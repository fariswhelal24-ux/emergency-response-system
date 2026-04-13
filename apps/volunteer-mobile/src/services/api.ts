import Constants from "expo-constants";
import { NativeModules } from "react-native";

declare const process: {
  env: Record<string, string | undefined>;
};

export type MedicalChatMessagePayload = {
  role: "user" | "assistant";
  content: string;
};

export type MedicalChatResult = {
  message: string;
  triage?: {
    type: string;
    emergency: boolean;
    severity: "low" | "medium" | "high";
  };
  analysis: {
    language: "ar" | "en" | "mixed";
    responseLanguage: "ar" | "en";
    isEmergency: boolean;
    needsFollowUp: boolean;
    followUpQuestions: string[];
    sources: Array<{ title: string; url: string }>;
  };
};

const REQUEST_TIMEOUT_MS = 10_000;
const AUTH_REQUEST_TIMEOUT_MS = 10_000;
const CHAT_REQUEST_TIMEOUT_MS = 35_000;
const API_PORT = "4100";
const API_PATH = "/api/v1";

const ENV_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || process.env.EXPO_PUBLIC_API_URL?.trim();
const ENV_WS_BASE_URL = process.env.EXPO_PUBLIC_WS_BASE_URL?.trim();

let authToken = "";
let authTokenPromise: Promise<string> | null = null;
let workingApiBase: string | null = null;
let lastLoggedApiBase: string | null = null;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Expo LogBox counts every `console.error`/`console.warn` in dev — polling then explodes the badge. Use throttled `console.log` for connectivity noise. */
const ERS_API_NET_LOG_COOLDOWN_MS = 12_000;
let ersApiNetLogAt = 0;

const logThrottledNetDiag = (...args: unknown[]) => {
  const now = Date.now();
  if (now - ersApiNetLogAt < ERS_API_NET_LOG_COOLDOWN_MS) {
    return;
  }
  ersApiNetLogAt = now;
  if (__DEV__) {
    console.log(...args);
  }
};

export const setAuthToken = (token: string) => {
  authToken = token.trim();
};

const trim = (value: string | undefined): string | undefined => {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
};

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const isPlaceholderHost = (host: string): boolean =>
  /your_laptop_ip|your-laptop-ip|example|placeholder|null|undefined|^(?:xxxx|example)\.(?:loca\.lt|ngrok(?:-free)?\.app)$/i.test(
    host
  );

const isLoopbackHost = (host: string): boolean =>
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/i.test(host);

const toAbsoluteUrl = (value: string): string => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  return `http://${value}`;
};

const normalizeApiBase = (value: string | undefined): string | undefined => {
  const trimmed = trim(value);
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = new URL(toAbsoluteUrl(trimmed));
    const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");

    if (!host || isLoopbackHost(host) || isPlaceholderHost(host)) {
      return undefined;
    }

    const pathname = parsed.pathname && parsed.pathname !== "/" ? stripTrailingSlash(parsed.pathname) : API_PATH;
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return undefined;
  }
};

const normalizeSocketBase = (value: string | undefined): string | undefined => {
  const trimmed = trim(value);
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = new URL(toAbsoluteUrl(trimmed));
    const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");

    if (!host || isLoopbackHost(host) || isPlaceholderHost(host)) {
      return undefined;
    }

    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return undefined;
  }
};

const extractHostFromUri = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/^exp:\/\//i, "http://")
    .replace(/^exps:\/\//i, "https://")
    .trim();
  const withoutScheme = normalized.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const hostPort = withoutScheme.split("/")[0] || "";
  const host = hostPort.replace(/^\[/, "").replace(/\]$/, "").split(":")[0];
  return trim(host);
};

const isIgnoredDevHost = (host: string): boolean =>
  /(^|\.)(exp\.direct|expo\.dev|exp\.host)$/.test(host.toLowerCase());

const readExpoConstantsHosts = (): string[] => {
  const constantsAny = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
    manifest?: { debuggerHost?: string };
  };

  const candidates = [
    constantsAny.expoConfig?.hostUri,
    constantsAny.manifest2?.extra?.expoClient?.hostUri,
    constantsAny.manifest?.debuggerHost
  ];

  const hosts = new Set<string>();
  for (const candidate of candidates) {
    const host = extractHostFromUri(candidate);
    if (!host || isLoopbackHost(host) || isIgnoredDevHost(host) || isPlaceholderHost(host)) {
      continue;
    }
    hosts.add(host);
  }

  return Array.from(hosts);
};

const readExpoHosts = (): string[] => {
  const sourceCode = (NativeModules as {
    SourceCode?: { scriptURL?: string; bundleURL?: string };
  }).SourceCode;
  const serverHost = (NativeModules as { PlatformConstants?: { ServerHost?: string } }).PlatformConstants?.ServerHost;
  const locationHost = (globalThis as { location?: { hostname?: string } }).location?.hostname;

  const hosts = new Set<string>();

  for (const candidate of [
    sourceCode?.scriptURL,
    sourceCode?.bundleURL,
    serverHost,
    locationHost,
    ...readExpoConstantsHosts()
  ]) {
    const host = extractHostFromUri(candidate);

    if (!host || isLoopbackHost(host) || isIgnoredDevHost(host) || isPlaceholderHost(host)) {
      continue;
    }

    hosts.add(host);
  }

  return Array.from(hosts);
};

const getApiBaseCandidates = (): string[] => {
  const expoHosts = readExpoHosts();
  const normalizedEnvBase = normalizeApiBase(ENV_API_BASE_URL);
  const normalizedWsBase = normalizeSocketBase(ENV_WS_BASE_URL);
  const webHost = trim((globalThis as { location?: { hostname?: string } }).location?.hostname);

  const ordered: string[] = [];
  const pushUnique = (base: string | undefined) => {
    if (!base || ordered.includes(base)) {
      return;
    }
    ordered.push(base);
  };

  pushUnique(normalizedEnvBase);
  if (normalizedWsBase) {
    pushUnique(`${normalizedWsBase}${API_PATH}`);
  }
  pushUnique(workingApiBase ?? undefined);

  for (const host of expoHosts) {
    pushUnique(`http://${host}:${API_PORT}${API_PATH}`);
  }

  if (webHost && !isLoopbackHost(webHost) && !isPlaceholderHost(webHost)) {
    pushUnique(`http://${webHost}:${API_PORT}${API_PATH}`);
  }

  return ordered;
};

const logApiBase = (base: string): void => {
  if (lastLoggedApiBase === base) {
    return;
  }

  lastLoggedApiBase = base;
  console.log("Using API:", base);
};

const isUnstableFreeTunnelUrl = (url: string): boolean =>
  /\.(?:loca\.lt|trycloudflare\.com)\b/i.test(url) ||
  /\.ngrok(?:-free)?\.app\b/i.test(url);

const fetchWithOptionalTunnelRetry = async (
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  let response = await withTimeout(url, init, timeoutMs);
  if (!isUnstableFreeTunnelUrl(url)) {
    return response;
  }
  for (let attempt = 0; attempt < 2 && response.status === 503; attempt++) {
    await wait(1_000);
    response = await withTimeout(url, init, timeoutMs);
  }
  return response;
};

const shouldRetryNetworkError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError") {
    return true;
  }
  const msg = error.message.toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("timed out")
  );
};

const fetchWithNetworkRetry = async (
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const run = () => fetchWithOptionalTunnelRetry(url, init, timeoutMs);
  try {
    return await run();
  } catch (error) {
    if (!shouldRetryNetworkError(error)) {
      logThrottledNetDiag("[ERS API] Request failed:", url, error);
      throw error;
    }
    logThrottledNetDiag("[ERS API] Retrying after network error:", url, error);
    await wait(750);
    try {
      return await run();
    } catch (second) {
      logThrottledNetDiag("[ERS API] Retry failed:", url, second);
      throw second;
    }
  }
};

/** localtunnel/ngrok may return an HTML interstitial unless these headers are set. */
const mergeDevTunnelFetchInit = (url: string, init: RequestInit): RequestInit => {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return init;
  }

  const headers = new Headers((init.headers as HeadersInit) ?? undefined);

  if (hostname.endsWith(".loca.lt")) {
    headers.set("bypass-tunnel-reminder", "true");
  }

  if (
    hostname.includes("ngrok-free.app") ||
    hostname.endsWith(".ngrok.io") ||
    hostname.endsWith(".ngrok.app")
  ) {
    headers.set("ngrok-skip-browser-warning", "true");
  }

  return { ...init, headers };
};

const withTimeout = async (url: string, init: RequestInit, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...mergeDevTunnelFetchInit(url, init),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const toNetworkErrorMessage = (error: unknown, timeoutMs: number): string => {
  if (!(error instanceof Error)) {
    return "Unknown network error";
  }

  if (error.name === "AbortError") {
    return `Request timed out after ${timeoutMs}ms`;
  }

  return error.message;
};

const parseResponsePayload = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return null;
  }

  const body = await response.text();
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
};

const parseErrorPayload = (payload: unknown, status: number): string => {
  if (status === 408) {
    return "The server took too long to respond (HTTP 408). Please retry.";
  }

  if (status === 503) {
    return "Public tunnel is unavailable (HTTP 503). Please restart in public mode and use the new QR.";
  }

  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }

  if (payload && typeof payload === "object") {
    const value = payload as {
      message?: unknown;
      error?: unknown;
      details?: unknown;
    };

    if (typeof value.message === "string" && value.message.trim().length > 0) {
      return value.message.trim();
    }

    if (typeof value.error === "string" && value.error.trim().length > 0) {
      return value.error.trim();
    }

    if (Array.isArray(value.details) && value.details.length > 0) {
      const first = value.details[0];
      if (typeof first === "string") {
        return first;
      }
    }
  }

  return `HTTP ${status}`;
};

const isRetryableGatewayStatus = (status: number): boolean =>
  status === 408 || status === 429 || status === 502 || status === 503 || status === 504;

const buildUnreachableApiError = (bases: string[], errors: string[]): Error => {
  const configured = bases.length > 0 ? bases.join(", ") : "none";
  const attempts = errors.length > 0 ? errors.join(" | ") : "no network attempt";

  return new Error(
    `Cannot reach API server. Configured bases: ${configured}. Attempts: ${attempts}. Set EXPO_PUBLIC_API_BASE_URL or EXPO_PUBLIC_API_URL (tunnel URL from dev:public:unified / dev:public:volunteer-app).`
  );
};

const requestAcrossBases = async (
  path: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<{ response: Response; base: string }> => {
  const bases = getApiBaseCandidates();
  if (bases.length === 0) {
    throw buildUnreachableApiError([], []);
  }

  const errors: string[] = [];

  for (const base of bases) {
    const url = `${base}${path}`;

    try {
      const response = await fetchWithNetworkRetry(url, init, timeoutMs);

      if (isRetryableGatewayStatus(response.status)) {
        errors.push(`${url} -> HTTP ${response.status}`);
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && contentType.includes("text/html")) {
        errors.push(`${url} -> HTML response (tunnel web page, not the API)`);
        continue;
      }

      workingApiBase = base;
      logApiBase(base);
      return { response, base };
    } catch (error) {
      const detail = toNetworkErrorMessage(error, timeoutMs);
      logThrottledNetDiag("[ERS API] Candidate base failed:", base, detail);
      errors.push(`${url} -> ${detail}`);
    }
  }

  const err = buildUnreachableApiError(bases, errors);
  const summary = err.message.length > 480 ? `${err.message.slice(0, 480)}…` : err.message;
  logThrottledNetDiag("[ERS API] All API bases failed:", summary);
  throw err;
};

const isMissingToken = (token: string): boolean => token.trim().length === 0;

const extractAccessToken = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const token = (payload as { data?: { tokens?: { accessToken?: unknown } } }).data?.tokens?.accessToken;
  return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
};

const ensureValidVolunteerToken = async (): Promise<string> => {
  if (!isMissingToken(authToken)) {
    return authToken;
  }

  if (authTokenPromise) {
    return authTokenPromise;
  }

  authTokenPromise = (async () => {
    throw new Error("Volunteer authentication required. Please sign in with a real account.");
  })().finally(() => {
    authTokenPromise = null;
  });

  return authTokenPromise;
};

export const ensureVolunteerAuthToken = async (): Promise<string> => ensureValidVolunteerToken();

type RequestOptions = {
  requireAuth?: boolean;
  acceptedStatusCodes?: number[];
  timeoutMs?: number;
  retryOnTimeout?: boolean;
  retryOnHttp408?: boolean;
  hasRetriedAfterTimeout?: boolean;
  hasRetriedAfterHttp408?: boolean;
};

const requestRaw = async (
  path: string,
  init: RequestInit = {},
  options?: RequestOptions
): Promise<{ response: Response; payload: unknown; base: string }> => {
  const needsAuth = options?.requireAuth ?? (
    path.startsWith("/volunteers") ||
    path.startsWith("/emergency") ||
    path.startsWith("/emergencies")
  );
  const token = needsAuth ? await ensureValidVolunteerToken() : authToken;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {})
  };

  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let response: Response;
  let base: string;
  try {
    ({ response, base } = await requestAcrossBases(path, {
      ...init,
      headers
    }, timeoutMs));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeoutError = /timed out|abort/i.test(message);

    if (isTimeoutError && options?.retryOnTimeout && !options?.hasRetriedAfterTimeout) {
      return requestRaw(path, init, {
        ...options,
        hasRetriedAfterTimeout: true
      });
    }

    throw error;
  }

  const payload = await parseResponsePayload(response);
  const accepted = new Set(options?.acceptedStatusCodes ?? []);

  if (
    response.status === 408 &&
    options?.retryOnHttp408 &&
    !options?.hasRetriedAfterHttp408
  ) {
    return requestRaw(path, init, {
      ...options,
      hasRetriedAfterHttp408: true
    });
  }

  if (!response.ok && !accepted.has(response.status)) {
    throw new Error(`${parseErrorPayload(payload, response.status)} (base: ${base})`);
  }

  return { response, payload, base };
};

const request = async <T = unknown>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> => {
  const { payload } = await requestRaw(path, init, options);
  return payload as T;
};

export const getVolunteerSocketBaseUrl = async (): Promise<string> => {
  await ensureValidVolunteerToken();

  const explicitSocketBase = normalizeSocketBase(ENV_WS_BASE_URL);
  if (explicitSocketBase) {
    return explicitSocketBase;
  }

  const base = workingApiBase ?? getApiBaseCandidates()[0];
  if (!base) {
    throw buildUnreachableApiError([], []);
  }

  const parsed = new URL(base);
  return `${parsed.protocol}//${parsed.host}`;
};

type VolunteerAuthData = {
  user?: { role?: string };
  tokens?: { accessToken?: string };
};

export const loginVolunteerAccount = async (
  input: { identifier: string; password: string }
): Promise<VolunteerAuthData | undefined> => {
  const payload = await request<{ data?: VolunteerAuthData }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: input.identifier.trim(),
      password: input.password
    })
  }, {
    requireAuth: false,
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS
  });

  const token = extractAccessToken(payload);
  if (!token) {
    throw new Error("Login succeeded but token is missing.");
  }
  authToken = token;
  return payload?.data;
};

export const registerVolunteerAccount = async (input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<VolunteerAuthData | undefined> => {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const phone = input.phone?.trim();

  const { response, payload } = await requestRaw(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify({
        fullName: input.fullName.trim(),
        email,
        password,
        phone: phone || undefined,
        role: "VOLUNTEER"
      })
    },
    { acceptedStatusCodes: [409], requireAuth: false, timeoutMs: AUTH_REQUEST_TIMEOUT_MS }
  );

  if (response.status === 409) {
    // Smart fallback: try phone-first login if provided, then fallback to email.
    if (phone) {
      try {
        return await loginVolunteerAccount({ identifier: phone, password });
      } catch {
        return loginVolunteerAccount({ identifier: email, password });
      }
    }
    return loginVolunteerAccount({ identifier: email, password });
  }

  const normalizedPayload = payload as { data?: VolunteerAuthData };
  const token = extractAccessToken(normalizedPayload);
  if (!token) {
    throw new Error("Registration succeeded but token is missing.");
  }
  authToken = token;
  return normalizedPayload?.data;
};

export type VolunteerProfile = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  specialty: string;
  verificationBadge: string;
  responseRadiusKm: number;
  availability: string;
};

export const getVolunteerProfile = async (): Promise<VolunteerProfile> => {
  const result = await request<{ data: VolunteerProfile }>("/volunteers/me/profile", {
    method: "GET"
  });

  return result.data;
};

export const updateVolunteerProfile = async (payload: {
  specialty?: string;
  verificationBadge?: string;
  responseRadiusKm?: number;
}) => {
  const result = await request<{ data: VolunteerProfile }>("/volunteers/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  return result.data;
};

export type VolunteerEmergencyCase = {
  id: string;
  caseNumber: string;
  emergencyType: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: string;
  address: string;
  ambulanceEtaMinutes: number | null;
  volunteerEtaMinutes: number | null;
  voiceDescription: string | null;
  transcriptionText: string | null;
  aiAnalysis: string | null;
  possibleCondition: string | null;
  riskLevel: string | null;
  location: {
    latitude: number;
    longitude: number;
  };
};

export type VolunteerEmergencyInitResult = {
  emergencyId: string;
  caseNumber?: string;
  status?: string;
  reportingUserId?: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  case?: VolunteerEmergencyCase;
};

export const initVolunteerEmergencyCall = async (input: {
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  callType?: string;
}): Promise<VolunteerEmergencyInitResult> => {
  const payload = await request<{ data: VolunteerEmergencyInitResult }>("/emergency/init", {
    method: "POST",
    body: JSON.stringify({
      location: input.location,
      callType: input.callType ?? "Volunteer Emergency Call"
    })
  });

  if (!payload?.data?.emergencyId) {
    throw new Error("Emergency call initialization failed. Missing emergencyId.");
  }

  return payload.data;
};

export const fetchLatestVolunteerEmergency = async (): Promise<VolunteerEmergencyCase | null> => {
  const result = await request<{ data?: VolunteerEmergencyCase[] }>("/emergencies?limit=1&offset=0");
  const latest = Array.isArray(result?.data) ? result.data[0] : null;

  if (!latest) {
    return null;
  }

  return {
    id: latest.id,
    caseNumber: latest.caseNumber,
    emergencyType: latest.emergencyType,
    priority: latest.priority,
    status: latest.status,
    address: latest.address,
    ambulanceEtaMinutes: latest.ambulanceEtaMinutes ?? null,
    volunteerEtaMinutes: latest.volunteerEtaMinutes ?? null,
    voiceDescription: latest.voiceDescription ?? null,
    transcriptionText: latest.transcriptionText ?? null,
    aiAnalysis: latest.aiAnalysis ?? null,
    possibleCondition: latest.possibleCondition ?? null,
    riskLevel: latest.riskLevel ?? null,
    location: {
      latitude: Number(latest.location?.latitude ?? 0),
      longitude: Number(latest.location?.longitude ?? 0)
    }
  };
};

export const respondToAlert = async (caseId: string, accepted: boolean) => {
  const result = await request<{ data: unknown }>(`/emergencies/${caseId}/volunteer-response`, {
    method: "POST",
    body: JSON.stringify({ accepted })
  });

  return result.data;
};

export const updateAvailability = async (available: boolean) => {
  const result = await request<{ data: unknown }>("/volunteers/me/availability", {
    method: "PATCH",
    body: JSON.stringify({
      availability: available ? "AVAILABLE" : "OFF_DUTY"
    })
  });

  return result.data;
};

export type VolunteerIncident = {
  assignmentId: string;
  caseId: string;
  caseNumber: string;
  emergencyType: string;
  address: string;
  caseStatus: string;
  assignmentStatus: string;
  responseEtaMinutes: number | null;
  assignedAt: string;
  respondedAt: string | null;
  arrivedAt: string | null;
};

export const listVolunteerIncidents = async (): Promise<VolunteerIncident[]> => {
  const result = await request<{ data?: VolunteerIncident[] }>("/volunteers/me/incidents", {
    method: "GET"
  });

  return Array.isArray(result?.data) ? result.data : [];
};

export const sendVolunteerLocationUpdate = async (input: {
  caseId?: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speedKmh?: number;
  etaMinutes?: number;
}) => {
  const result = await request<{ data?: unknown }>("/locations", {
    method: "POST",
    body: JSON.stringify({
      caseId: input.caseId,
      actorType: "VOLUNTEER",
      latitude: input.latitude,
      longitude: input.longitude,
      heading: input.heading,
      speedKmh: input.speedKmh,
      etaMinutes: input.etaMinutes
    })
  });

  return result?.data;
};

type MedicalChatApiPayload = {
  data?: {
    type?: string;
    emergency?: boolean;
    severity?: "low" | "medium" | "high";
    response?: string;
    assistantMessage?: { content?: string };
    analysis?: {
      language?: "ar" | "en" | "mixed";
      responseLanguage?: "ar" | "en";
      isEmergency?: boolean;
      needsFollowUp?: boolean;
      followUpQuestions?: string[];
      sources?: Array<{ title: string; url: string }>;
    };
  };
};

type MedicalAdviceApiPayload = {
  data?: {
    type?: string;
    emergency?: boolean;
    severity?: "low" | "medium" | "high";
    response?: string;
    advice?: string;
    fullAdvice?: {
      response?: string;
      language?: "ar" | "en";
      isEmergency?: boolean;
      followUpQuestions?: string[];
      resources?: Array<{ title?: string; url?: string }>;
      triage?: {
        type?: string;
        emergency?: boolean;
        severity?: "low" | "medium" | "high";
      };
    };
    language?: "ar" | "en";
    isEmergency?: boolean;
    followUpQuestions?: string[];
    resources?: Array<{ title?: string; url?: string }>;
  };
};

const extractLastUserMessage = (messages: MedicalChatMessagePayload[]): string =>
  [...messages].reverse().find((item) => item.role === "user")?.content?.trim() ?? "";

const normalizeMedicalAdviceResponse = (payload: MedicalAdviceApiPayload): MedicalChatResult => {
  const d = payload?.data;
  const fullAdvice = d?.fullAdvice;
  const responseLanguage: "ar" | "en" = fullAdvice?.language ?? d?.language ?? "en";
  const message = d?.response ?? fullAdvice?.response ?? d?.advice ?? "";
  const nested = fullAdvice?.triage;
  const emergency = Boolean(d?.emergency ?? nested?.emergency ?? d?.isEmergency ?? fullAdvice?.isEmergency);
  const severity =
    d?.severity === "low" || d?.severity === "medium" || d?.severity === "high"
      ? d.severity
      : nested?.severity === "low" || nested?.severity === "high"
        ? nested.severity
        : "medium";
  const triageType =
    (typeof d?.type === "string" && d.type.trim()) ||
    (typeof nested?.type === "string" && nested.type.trim()) ||
    undefined;

  return {
    message,
    triage:
      triageType !== undefined
        ? { type: triageType, emergency, severity }
        : undefined,
    analysis: {
      language: responseLanguage,
      responseLanguage,
      isEmergency: emergency,
      needsFollowUp: (d?.followUpQuestions ?? fullAdvice?.followUpQuestions ?? []).length > 0,
      followUpQuestions: d?.followUpQuestions ?? fullAdvice?.followUpQuestions ?? [],
      sources: (d?.resources ?? fullAdvice?.resources ?? [])
        .map((item) => {
          const title = typeof item?.title === "string" ? item.title.trim() : "";
          const url = typeof item?.url === "string" ? item.url.trim() : "";
          return title && url ? { title, url } : null;
        })
        .filter((item): item is { title: string; url: string } => item !== null)
    }
  };
};

const normalizeMedicalChatResponse = (payload: MedicalChatApiPayload): MedicalChatResult => {
  const d = payload?.data;
  const message = d?.response ?? d?.assistantMessage?.content ?? "";
  const emergency = Boolean(d?.emergency ?? d?.analysis?.isEmergency);
  const severity =
    d?.severity === "low" || d?.severity === "medium" || d?.severity === "high" ? d.severity : "medium";
  const triageType = typeof d?.type === "string" && d.type.trim().length > 0 ? d.type.trim() : undefined;

  return {
    message,
    triage:
      triageType !== undefined
        ? { type: triageType, emergency, severity }
        : undefined,
    analysis: {
      language: d?.analysis?.language ?? "en",
      responseLanguage: d?.analysis?.responseLanguage ?? "en",
      isEmergency: emergency,
      needsFollowUp: Boolean(d?.analysis?.needsFollowUp),
      followUpQuestions: d?.analysis?.followUpQuestions ?? [],
      sources: d?.analysis?.sources ?? []
    }
  };
};

const buildMedicalChatFallback = (messages: MedicalChatMessagePayload[]): MedicalChatResult => {
  const lastUserMessage = extractLastUserMessage(messages);
  const hasArabic = /[\u0600-\u06FF]/.test(lastUserMessage);
  const hasEnglish = /[A-Za-z]/.test(lastUserMessage);
  const language: "ar" | "en" | "mixed" = hasArabic && hasEnglish ? "mixed" : hasArabic ? "ar" : "en";
  const responseLanguage: "ar" | "en" = hasArabic ? "ar" : "en";

  if (responseLanguage === "ar") {
    return {
      message:
        "تعذّر الاتصال بالمساعد الطبي. تحقق من الشبكة وحاول مجدداً. للحالات الطارئة اتصل بالإسعاف مباشرة.",
      analysis: {
        language,
        responseLanguage,
        isEmergency: false,
        needsFollowUp: false,
        followUpQuestions: [],
        sources: []
      }
    };
  }

  return {
    message:
      "Could not reach the medical assistant. Check your connection and try again. For emergencies, call emergency services directly.",
    analysis: {
      language,
      responseLanguage,
      isEmergency: false,
      needsFollowUp: false,
      followUpQuestions: [],
      sources: []
    }
  };
};

export const sendMedicalChatMessage = async (
  messages: MedicalChatMessagePayload[]
): Promise<MedicalChatResult> => {
  const lastUserMessage = extractLastUserMessage(messages);
  const hasAuthToken = authToken.trim().length > 0;

  if (hasAuthToken && lastUserMessage.length > 0) {
    try {
      const payload = await request<MedicalAdviceApiPayload>("/medical-advice", {
        method: "POST",
        body: JSON.stringify({
          message: lastUserMessage
        })
      }, {
        requireAuth: false,
        timeoutMs: CHAT_REQUEST_TIMEOUT_MS,
        retryOnTimeout: true,
        retryOnHttp408: true
      });

      const normalized = normalizeMedicalAdviceResponse(payload);
      if (normalized.message.trim().length > 0) {
        return normalized;
      }
    } catch (error) {
      console.warn("VOLUNTEER CHAT warning (/medical-advice):", error);
    }
  }

  try {
    const payload = await request<MedicalChatApiPayload>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        messages
      })
    }, {
      requireAuth: false,
      timeoutMs: CHAT_REQUEST_TIMEOUT_MS,
      retryOnTimeout: true,
      retryOnHttp408: true
    });

    const normalized = normalizeMedicalChatResponse(payload);
    if (normalized.message.trim().length > 0) {
      return normalized;
    }
  } catch (error) {
    console.warn("VOLUNTEER CHAT warning (/ai/chat):", error);
  }

  try {
    const payload = await request<MedicalChatApiPayload>("/ai/chat/public", {
      method: "POST",
      body: JSON.stringify({
        messages
      })
    }, {
      requireAuth: false,
      timeoutMs: CHAT_REQUEST_TIMEOUT_MS,
      retryOnTimeout: true,
      retryOnHttp408: true
    });

    const normalized = normalizeMedicalChatResponse(payload);
    if (normalized.message.trim().length > 0) {
      return normalized;
    }
  } catch (error) {
    console.warn("VOLUNTEER CHAT warning (/ai/chat/public):", error);
  }

  return buildMedicalChatFallback(messages);
};
