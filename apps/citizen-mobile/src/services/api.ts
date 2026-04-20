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

export type CitizenUserProfile = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export type CitizenMedicalProfile = {
  id: string;
  userId: string;
  bloodType: string | null;
  conditions: string | null;
  allergies: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  healthDataSharing: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmergencyLocation = {
  latitude: number;
  longitude: number;
};

export type CitizenEmergencyCase = {
  id: string;
  caseNumber: string;
  status: string;
  reportingUserId?: string;
  emergencyType?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  address?: string;
  location?: EmergencyLocation;
  voiceDescription?: string | null;
  transcriptionText?: string | null;
  aiAnalysis?: string | null;
  possibleCondition?: string | null;
  riskLevel?: string | null;
  ambulanceEtaMinutes?: number | null;
  volunteerEtaMinutes?: number | null;
};

export type CitizenEmergencyDetails = {
  case: CitizenEmergencyCase & {
    voiceDescription?: string | null;
    transcriptionText?: string | null;
    aiAnalysis?: string | null;
    possibleCondition?: string | null;
    riskLevel?: string | null;
    ambulanceEtaMinutes?: number | null;
    volunteerEtaMinutes?: number | null;
  };
  updates: Array<{
    id: string;
    updateType: string;
    message: string;
    createdAt: string;
  }>;
};

export type CitizenEmergencyHistoryItem = {
  id: string;
  caseNumber: string;
  emergencyType: string;
  status: string;
  address: string;
  createdAt?: string;
};

const REQUEST_TIMEOUT_MS = 10_000;
const AUTH_REQUEST_TIMEOUT_MS = 10_000;
const CHAT_REQUEST_TIMEOUT_MS = 35_000;
const DEFAULT_PRODUCTION_API_BASE_URL = "https://ersapi-production.up.railway.app/api/v1";
const API_PATH = "/api/v1";

/** Support both names; Metro injects EXPO_PUBLIC_API_BASE_URL from start-expo-with-api.mjs. */
const ENV_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || process.env.EXPO_PUBLIC_API_URL?.trim();
const ENV_WS_BASE_URL = process.env.EXPO_PUBLIC_WS_BASE_URL?.trim();

let authToken = "";
let authTokenPromise: Promise<string> | null = null;
let workingApiBase: string | null = null;
let lastLoggedApiBase: string | null = null;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Throttle dev connectivity logs so Expo LogBox does not stack one error per poll/retry. */
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

const isIgnoredDevHost = (host: string): boolean =>
  /(^|\.)(exp\.direct|expo\.dev|exp\.host)$/.test(host.toLowerCase());

const toAbsoluteUrl = (value: string): string => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  return `http://${value}`;
};

const normalizeApiBase = (value: string | undefined): string | undefined => {
  const raw = trim(value);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = new URL(toAbsoluteUrl(raw));
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
  const raw = trim(value);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = new URL(toAbsoluteUrl(raw));
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
  const normalizedEnvBase = normalizeApiBase(ENV_API_BASE_URL);
  const wsBase = normalizeSocketBase(ENV_WS_BASE_URL);

  const ordered: string[] = [];
  const pushUnique = (base: string | undefined) => {
    if (!base || ordered.includes(base)) {
      return;
    }
    ordered.push(base);
  };

  pushUnique(normalizedEnvBase);
  if (wsBase) {
    pushUnique(`${wsBase}${API_PATH}`);
  }
  pushUnique(workingApiBase ?? undefined);
  pushUnique(DEFAULT_PRODUCTION_API_BASE_URL);

  return ordered;
};

const logApiBase = (base: string): void => {
  if (lastLoggedApiBase === base) {
    return;
  }

  lastLoggedApiBase = base;
  console.log("Using API:", base);
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

/** localtunnel/ngrok may return an HTML interstitial unless these headers are set. */
const isUnstableFreeTunnelUrl = (url: string): boolean =>
  /\.(?:loca\.lt|trycloudflare\.com)\b/i.test(url) ||
  /\.ngrok(?:-free)?\.app\b/i.test(url);

/** localtunnel / free ngrok often return transient 503; retry before giving up. */
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

/** One automatic retry for flaky tunnels / transient disconnects. */
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

const buildUnreachableApiError = (candidates: string[], errors: string[]): Error => {
  const configured = candidates.length > 0 ? candidates.join(", ") : "none";
  const attempts = errors.length > 0 ? errors.join(" | ") : "no network attempt";

  return new Error(
    `Cannot reach emergency API. Configured bases: ${configured}. Attempts: ${attempts}. Set EXPO_PUBLIC_API_BASE_URL to your Railway API URL (example: https://ersapi-production.up.railway.app/api/v1).`
  );
};

const requestAcrossBases = async (path: string, init: RequestInit): Promise<{ response: Response; base: string }> => {
  return requestAcrossBasesWithTimeout(path, init, REQUEST_TIMEOUT_MS);
};

const requestAcrossBasesWithTimeout = async (
  path: string,
  init: RequestInit,
  timeoutMs: number
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

  const tokens = (payload as { data?: { tokens?: { accessToken?: unknown } } }).data?.tokens;
  const token = tokens?.accessToken;

  return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
};

const ensureValidCitizenToken = async (): Promise<string> => {
  if (!isMissingToken(authToken)) {
    return authToken;
  }

  if (authTokenPromise) {
    return authTokenPromise;
  }

  authTokenPromise = (async () => {
    throw new Error("Citizen authentication required. Please sign in first.");
  })().finally(() => {
    authTokenPromise = null;
  });

  return authTokenPromise;
};

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
  const requiresAuth = options?.requireAuth ?? (
    path.startsWith("/users") ||
    path.startsWith("/emergency") ||
    path.startsWith("/emergencies")
  );

  const token = requiresAuth ? await ensureValidCitizenToken() : authToken;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {})
  };

  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let response: Response;
  let base: string;
  try {
    ({ response, base } = await requestAcrossBasesWithTimeout(path, {
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

  if (response.status === 408 && options?.retryOnHttp408 && !options?.hasRetriedAfterHttp408) {
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

const request = async <T = unknown>(
  path: string,
  init: RequestInit = {},
  options?: RequestOptions
): Promise<T> => {
  const { payload } = await requestRaw(path, init, options);
  return payload as T;
};

export const setAuthToken = (token: string): void => {
  authToken = token.trim();
};

export const ensureCitizenAuthToken = async (): Promise<string> => ensureValidCitizenToken();

export const getCitizenSocketBaseUrl = async (): Promise<string> => {
  await ensureValidCitizenToken();

  const explicitSocketBase = normalizeSocketBase(ENV_WS_BASE_URL);
  if (explicitSocketBase) {
    return explicitSocketBase;
  }

  const selectedApiBase = workingApiBase ?? getApiBaseCandidates()[0];
  if (!selectedApiBase) {
    throw buildUnreachableApiError([], []);
  }

  const parsed = new URL(selectedApiBase);
  return `${parsed.protocol}//${parsed.host}`;
};

export const loginCitizenAccount = async (input: {
  identifier: string;
  password: string;
}) => {
  const payload = await request<{ data?: { user?: { role?: string } } }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: input.identifier.trim(),
      password: input.password
    })
  }, {
    requireAuth: false,
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    retryOnTimeout: true,
    retryOnHttp408: true
  });

  const token = extractAccessToken(payload);
  if (!token) {
    throw new Error("Login succeeded but access token is missing.");
  }

  authToken = token;
  return payload?.data;
};

export const registerCitizenAccount = async (input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
}) => {
  const payload = await request<{ data?: { user?: { role?: string } } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      password: input.password,
      phone: input.phone?.trim() || undefined,
      role: "CITIZEN"
    })
  }, {
    requireAuth: false,
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    retryOnTimeout: true,
    retryOnHttp408: true
  });

  const token = extractAccessToken(payload);
  if (!token) {
    throw new Error("Registration succeeded but access token is missing.");
  }

  authToken = token;
  return payload?.data;
};

export const switchAccountRole = async (input: {
  identifier: string;
  password: string;
  newRole: "CITIZEN" | "VOLUNTEER";
}) => {
  const payload = await request<{ data?: { user?: { role?: string } } }>("/auth/switch-role", {
    method: "POST",
    body: JSON.stringify({
      identifier: input.identifier.trim(),
      password: input.password,
      newRole: input.newRole
    })
  }, {
    requireAuth: false,
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    retryOnTimeout: true,
    retryOnHttp408: true
  });

  const token = extractAccessToken(payload);
  if (token) {
    authToken = token;
  }
  return payload?.data;
};

export const getCitizenUserProfile = async (): Promise<CitizenUserProfile> => {
  const payload = await request<{ data: CitizenUserProfile }>("/users/me/profile", {
    method: "GET"
  });

  return payload.data;
};

export const updateCitizenUserProfile = async (input: {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
}): Promise<CitizenUserProfile> => {
  const payload = await request<{ data: CitizenUserProfile }>("/users/me/profile", {
    method: "PATCH",
    body: JSON.stringify(input)
  });

  return payload.data;
};

export const getCitizenMedicalProfile = async (): Promise<CitizenMedicalProfile> => {
  const payload = await request<{ data: CitizenMedicalProfile }>("/users/me/medical-profile", {
    method: "GET"
  });

  return payload.data;
};

export const updateCitizenMedicalProfile = async (input: {
  bloodType?: string;
  conditions?: string;
  allergies?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  healthDataSharing?: boolean;
}): Promise<CitizenMedicalProfile> => {
  const payload = await request<{ data: CitizenMedicalProfile }>("/users/me/medical-profile", {
    method: "PUT",
    body: JSON.stringify(input)
  });

  return payload.data;
};

export const initEmergencyCall = async (input: {
  userId?: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  callType?: string;
}): Promise<{
  emergencyId: string;
  caseNumber?: string;
  status?: string;
  reportingUserId?: string;
  location?: EmergencyLocation;
  case?: CitizenEmergencyCase;
}> => {
  const payload = await request<{ data: {
    emergencyId: string;
    caseNumber?: string;
    status?: string;
    reportingUserId?: string;
    location?: EmergencyLocation;
    case?: CitizenEmergencyCase;
  } }>("/emergency/init", {
    method: "POST",
    body: JSON.stringify(input)
  });

  return payload.data;
};

export const createEmergencyRequest = async (input: {
  emergencyType: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  callerUserId?: string;
  callerName?: string;
  callerPhone?: string;
  voiceDescription?: string;
  transcriptionText?: string;
  aiAnalysis?: string;
  possibleCondition?: string;
  riskLevel?: string;
  address: string;
  latitude: number;
  longitude: number;
  etaMinutes?: number;
  ambulanceEtaMinutes?: number;
  volunteerEtaMinutes?: number;
}): Promise<CitizenEmergencyCase & { location: EmergencyLocation }> => {
  const payload = await request<{ data: CitizenEmergencyCase & { location: EmergencyLocation } }>("/emergency/request", {
    method: "POST",
    body: JSON.stringify(input)
  });

  return payload.data;
};

export const sendEmergencyUpdate = async (caseId: string, message: string) => {
  const payload = await request<{ data?: unknown }>(`/emergencies/${caseId}/updates`, {
    method: "POST",
    body: JSON.stringify({
      updateType: "CITIZEN_UPDATE",
      message: message.trim()
    })
  });

  return payload?.data;
};

export const sendCitizenLocationUpdate = async (input: {
  caseId?: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speedKmh?: number;
  etaMinutes?: number;
}) => {
  const payload = await request<{ data?: unknown }>("/locations", {
    method: "POST",
    body: JSON.stringify({
      caseId: input.caseId,
      actorType: "CITIZEN",
      latitude: input.latitude,
      longitude: input.longitude,
      heading: input.heading,
      speedKmh: input.speedKmh,
      etaMinutes: input.etaMinutes
    })
  });

  return payload?.data;
};

export const listCitizenEmergencies = async (): Promise<CitizenEmergencyHistoryItem[]> => {
  const payload = await request<{ data?: CitizenEmergencyHistoryItem[] }>("/emergencies?limit=80&offset=0", {
    method: "GET"
  });

  return Array.isArray(payload?.data) ? payload.data : [];
};

export const getCitizenEmergencyById = async (caseId: string): Promise<CitizenEmergencyDetails> => {
  const payload = await request<{ data: CitizenEmergencyDetails }>(`/emergencies/${caseId}`, {
    method: "GET"
  });

  return payload.data;
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
      : nested?.severity === "low" || nested?.severity === "medium" || nested?.severity === "high"
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
      console.warn("CITIZEN CHAT warning (/medical-advice):", error);
    }
  }

  try {
    const payload = await request<MedicalChatApiPayload>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages })
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
    console.warn("CITIZEN CHAT warning (/ai/chat):", error);
  }

  try {
    const payload = await request<MedicalChatApiPayload>("/ai/chat/public", {
      method: "POST",
      body: JSON.stringify({ messages })
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
    console.warn("CITIZEN CHAT warning (/ai/chat/public):", error);
  }

  return buildMedicalChatFallback(messages);
};

// Backward-compatible aliases
export const getProfile = getCitizenUserProfile;
export const createEmergency = createEmergencyRequest;

export type RouteCoordinate = { latitude: number; longitude: number };
export type RoutePayload = {
  from: RouteCoordinate;
  to: RouteCoordinate;
  mode: "fastest" | "shortest";
  provider: "mapbox" | "osrm" | "linear";
  trafficAware: boolean;
  distanceKm: number;
  durationMinutes: number;
  geometry: RouteCoordinate[];
};

export const fetchRoute = async (
  from: RouteCoordinate,
  to: RouteCoordinate,
  options: { mode?: "fastest" | "shortest"; avoidTraffic?: boolean } = {}
): Promise<RoutePayload | null> => {
  try {
    const params = new URLSearchParams({
      fromLat: String(from.latitude),
      fromLng: String(from.longitude),
      toLat: String(to.latitude),
      toLng: String(to.longitude),
      mode: options.mode ?? "fastest",
      avoidTraffic: String(options.avoidTraffic ?? true)
    });
    const payload = await request<{ data: RoutePayload }>(`/routing/route?${params.toString()}`, {
      method: "GET"
    });
    return payload.data;
  } catch (error) {
    console.warn("CITIZEN routing fetch failed, falling back to linear", error);
    return null;
  }
};
