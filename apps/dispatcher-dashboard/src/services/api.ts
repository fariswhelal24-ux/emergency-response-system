import { io, type Socket } from "socket.io-client";
import type {
  ActiveCase,
  AvailableVolunteerSummary,
  CaseDetail,
  DashboardStats,
  IncidentClosurePayload,
  RegisteredVolunteerSummary,
  ReportPoint
} from "../types";

type ApiEnvelope<T> = {
  data?: T;
  message?: string;
  error?: string;
};

type RequestOptions = {
  fallbackMessage?: string;
  hasRetriedAfterAuthRefresh?: boolean;
  hasRetriedAfterTimeout?: boolean;
  timeoutMs?: number;
  retryOnTimeout?: boolean;
};

const API_PATH = "/api/v1";
const TOKEN_STORAGE_KEY = "ers_dispatcher_token";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS ?? "15000");
const AI_VOICE_TIMEOUT_MS = Number(import.meta.env.VITE_AI_VOICE_TIMEOUT_MS ?? "90000");
const DEMO_IDENTIFIER = (
  import.meta.env.VITE_DEMO_IDENTIFIER?.trim() ||
  import.meta.env.VITE_DEMO_EMAIL?.trim() ||
  ""
);
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD?.trim() || "";
const DEMO_NAME = import.meta.env.VITE_DEMO_NAME?.trim() || "Dispatch Operator";

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const withApiPath = (value: string): string =>
  value.endsWith(API_PATH) ? stripTrailingSlash(value) : `${stripTrailingSlash(value)}${API_PATH}`;

const resolveApiBase = (): string => {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();

  if (configured) {
    if (/^https?:\/\//i.test(configured)) {
      return withApiPath(configured);
    }

    if (configured.startsWith("/")) {
      return withApiPath(configured);
    }

    return withApiPath(`http://${configured}`);
  }

  return API_PATH;
};

const resolveWsBase = (apiBase: string): string => {
  const configured = import.meta.env.VITE_WS_BASE_URL?.trim();

  if (configured) {
    if (/^https?:\/\//i.test(configured)) {
      return stripTrailingSlash(configured);
    }

    if (configured.startsWith("/")) {
      if (typeof window !== "undefined") {
        return `${window.location.origin}${configured}`;
      }

      return configured;
    }

    return `http://${stripTrailingSlash(configured)}`;
  }

  if (/^https?:\/\//i.test(apiBase)) {
    const parsed = new URL(apiBase);
    return `${parsed.protocol}//${parsed.host}`;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://127.0.0.1:4100";
};

const API_BASE_URL = resolveApiBase();
const WS_BASE_URL = resolveWsBase(API_BASE_URL);

console.log("Using API:", API_BASE_URL);
console.log("Using WS:", WS_BASE_URL);

const readStoredToken = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(TOKEN_STORAGE_KEY)?.trim() ?? "";
};

let authToken = import.meta.env.VITE_DEMO_TOKEN?.trim() || readStoredToken();
let tokenBootstrapPromise: Promise<string | null> | null = null;

export const setDispatcherAuthToken = (token: string): void => {
  authToken = token.trim();

  if (typeof window === "undefined") {
    return;
  }

  if (authToken) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
    return;
  }

  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
};

const canAutoLoginDispatcher = (): boolean => Boolean(DEMO_IDENTIFIER && DEMO_PASSWORD);

const loginDispatcherWithDemoCredentials = async (): Promise<string | null> => {
  if (!canAutoLoginDispatcher()) {
    return null;
  }

  const loginOnce = () =>
    withTimeout(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        identifier: DEMO_IDENTIFIER,
        password: DEMO_PASSWORD
      })
    });

  let response = await loginOnce();

  if (!response.ok && response.status === 401 && DEMO_IDENTIFIER.includes("@")) {
    const registerResponse = await withTimeout(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fullName: DEMO_NAME,
        email: DEMO_IDENTIFIER.toLowerCase(),
        password: DEMO_PASSWORD,
        role: "DISPATCHER"
      })
    });

    if (registerResponse.ok || registerResponse.status === 409) {
      response = await loginOnce();
    }
  }

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? (payload as { error?: string; message?: string }).error ||
          (payload as { error?: string; message?: string }).message
        : undefined;
    throw new Error(message || `Dispatcher auto-login failed with ${response.status}`);
  }

  const accessToken =
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data?: { tokens?: { accessToken?: string } } }).data?.tokens?.accessToken
      ? (payload as { data?: { tokens?: { accessToken?: string } } }).data?.tokens?.accessToken
      : undefined;

  if (!accessToken) {
    throw new Error("Dispatcher login succeeded but accessToken is missing.");
  }

  setDispatcherAuthToken(accessToken);
  console.log("Dispatcher auth token loaded via demo credentials.");
  return accessToken;
};

const ensureDispatcherToken = async (): Promise<string | null> => {
  if (authToken) {
    return authToken;
  }

  if (!canAutoLoginDispatcher()) {
    return null;
  }

  if (!tokenBootstrapPromise) {
    tokenBootstrapPromise = loginDispatcherWithDemoCredentials()
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        console.warn("Unable to auto-login dispatcher:", message);
        return null;
      })
      .finally(() => {
        tokenBootstrapPromise = null;
      });
  }

  return tokenBootstrapPromise;
};

const normalizeError = (error: unknown, fallbackMessage?: string, timeoutMs: number = REQUEST_TIMEOUT_MS): Error => {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new Error(`Request timed out after ${timeoutMs}ms.`);
    }

    return error;
  }

  return new Error(fallbackMessage ?? "Unknown network error.");
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return text || null;
  }

  return response.json();
};

const withTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const extractData = <T>(payload: unknown): T => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }

  return payload as T;
};

const request = async <T>(path: string, init: RequestInit = {}, options?: RequestOptions): Promise<T> => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;
  const headers = new Headers(init.headers ?? {});
  const hasBody = init.body !== undefined && init.body !== null;
  const token = authToken || (await ensureDispatcherToken());
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await withTimeout(url, {
      ...init,
      headers
    }, timeoutMs);
  } catch (reason: unknown) {
    const isAbortTimeout = reason instanceof Error && reason.name === "AbortError";
    if (isAbortTimeout && options?.retryOnTimeout && !options?.hasRetriedAfterTimeout) {
      const nextTimeoutMs = Math.round(timeoutMs * 1.5);
      console.warn(`Retrying ${normalizedPath} after timeout (${timeoutMs}ms -> ${nextTimeoutMs}ms).`);
      return request<T>(path, init, {
        ...options,
        hasRetriedAfterTimeout: true,
        timeoutMs: nextTimeoutMs
      });
    }

    const normalized = normalizeError(
      reason,
      options?.fallbackMessage ??
        `Cannot reach dispatcher API at ${API_BASE_URL}. Make sure API server is running and reachable.`,
      timeoutMs
    );
    throw normalized;
  }

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    const messageFromPayload =
      payload && typeof payload === "object"
        ? (payload as { error?: string; message?: string }).error ||
          (payload as { error?: string; message?: string }).message
        : undefined;

    const baseMessage = messageFromPayload || `Request failed with status ${response.status}`;

    if (response.status === 401) {
      if (!options?.hasRetriedAfterAuthRefresh && canAutoLoginDispatcher()) {
        setDispatcherAuthToken("");
        const refreshedToken = await ensureDispatcherToken();

        if (refreshedToken) {
          return request<T>(path, init, {
            ...options,
            hasRetriedAfterAuthRefresh: true
          });
        }
      }

      throw new Error(
        `${baseMessage}. Dispatcher auth token is missing/invalid. Set VITE_DEMO_TOKEN or (VITE_DEMO_IDENTIFIER + VITE_DEMO_PASSWORD) or call setDispatcherAuthToken().`
      );
    }

    throw new Error(baseMessage);
  }

  return extractData<T>(payload);
};

export type CasePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type EmergencyCaseSnapshot = {
  id: string;
  caseNumber: string;
  emergencyType: string;
  priority: string;
  status: string;
  address: string;
  location: {
    latitude: number;
    longitude: number;
  };
  voiceDescription?: string | null;
  transcriptionText?: string | null;
  aiAnalysis?: string | null;
  possibleCondition?: string | null;
  riskLevel?: string | null;
  closedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type VoiceAnalysisRequest = {
  audio: string;
  mimeType?: string;
  durationMs?: number;
  emergencyId?: string;
  segmentTimestamp?: string;
  transcriptHint?: string;
  languageHint?: "ar" | "en";
  caseContext?: {
    emergencyType?: string;
    priority?: CasePriority;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
};

export type VoiceAnalysisPayload = {
  transcription: string;
  assistantResponse: string;
  emergencyCase?: EmergencyCaseSnapshot;
  conversation?: {
    callSummary?: string;
    turns?: Array<{
      speaker: "PATIENT" | "CALL_CENTER" | string;
      text: string;
      confidence?: number;
    }>;
  };
  analysis: {
    isEmergency: boolean;
    intent?: string;
    confidence?: number;
    responseLanguage?: "ar" | "en" | "mixed" | string;
    keywords?: string[];
    followUpQuestions?: string[];
    emergencyLevel?: "LOW" | "MEDIUM" | "HIGH";
    recommendedAction?: "DISPATCH" | "MONITOR" | "ASK_FOR_MORE_INFO";
    confidenceBand?: "AUTO" | "OPERATOR_REVIEW" | "OPERATOR_CONFIRMATION_REQUIRED";
    operatorAlert?: string;
  };
  decision?: {
    emergencyLevel: "LOW" | "MEDIUM" | "HIGH";
    recommendedAction: "DISPATCH" | "MONITOR" | "ASK_FOR_MORE_INFO";
    confidence: number;
    confidenceBand: "AUTO" | "OPERATOR_REVIEW" | "OPERATOR_CONFIRMATION_REQUIRED";
    score: number;
    scoreSignals: Array<{
      code: string;
      score: number;
      evidence: string;
    }>;
    operatorAlert: string;
    escalationReason?: string;
    audioIntelligence: {
      panicDetected: boolean;
      speechSpeedWpm: number | null;
      speechSpeedCategory: "slow" | "normal" | "fast" | "unknown";
      speakerSeparation: {
        method: "ai" | "heuristic";
        averageConfidence: number;
        lowConfidenceTurns: number;
        uncertaintyRatio: number;
      };
      keywords: string[];
      temporalEscalationDetected: boolean;
    };
  };
  dispatchRecommendation?: {
    priority?: string;
    patientCount?: number;
    requiredVolunteers?: number;
    emergencyType?: string;
    rationale?: string;
  };
  caseUpdateSuggestion?: {
    summary?: string;
    emergencyType?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    locationConfidence?: number;
    priority?: string;
    patientCount?: number;
    requiredVolunteers?: number;
    possibleCondition?: string;
    riskLevel?: string;
  };
  criticalFacts?: {
    patientCount?: number;
    requiredVolunteers?: number;
    priority?: string;
    emergencyType?: string;
    possibleCondition?: string;
    riskLevel?: string;
    address?: string;
    breathingStatus?: "normal" | "distressed" | "not_breathing" | "unknown" | string;
    consciousnessStatus?: "alert" | "reduced" | "unconscious" | "unknown" | string;
    bleedingStatus?: "none" | "minor" | "severe" | "unknown" | string;
    hasChestPain?: boolean;
    hasSeizure?: boolean;
    hasTrauma?: boolean;
    summary?: string;
  };
  volunteerSummary?: string;
  dispatcherDetails?: string;
  autoDispatch?: {
    actionTaken: boolean;
    requestedTarget: number;
    activeAssignments: number;
    createdAssignments: number;
    skippedReason?: string;
  } | null;
  processing?: {
    audioSeconds?: number;
    speakerSeparationMethod?: string;
    fallbackUsed?: {
      conversation?: boolean;
      assistant?: boolean;
      caseFieldExtraction?: boolean;
    };
    timingsMs?: {
      transcription?: number;
      conversation?: number;
      assistant?: number;
      caseFieldExtraction?: number;
      total?: number;
    };
  };
};

export type UpdateEmergencyCaseInput = {
  emergencyType?: string;
  priority?: CasePriority;
  address?: string;
  latitude?: number;
  longitude?: number;
  voiceDescription?: string;
  transcriptionText?: string;
  aiAnalysis?: string;
  possibleCondition?: string;
  riskLevel?: string;
  ambulanceEtaMinutes?: number;
  volunteerEtaMinutes?: number;
};

export type NearbyVolunteer = {
  volunteerId: string;
  userId: string;
  name: string;
  specialty: string;
  availability: string;
  distanceKm: number;
};

export type CaseMessageInput = {
  caseId: string;
  recipientUserId: string;
  body: string;
};

export type AddCaseUpdateInput = {
  caseId: string;
  updateType: string;
  message: string;
  payload?: Record<string, unknown>;
};

export type CloseEmergencyCaseInput = {
  caseId: string;
  finalOutcome: string;
  notes?: string;
  interventions?: string;
};

export type DashboardOverview = {
  stats: DashboardStats;
  activeCases: ActiveCase[];
  availableVolunteers?: AvailableVolunteerSummary[];
  registeredVolunteers?: RegisteredVolunteerSummary[];
};

export type RealtimeLocationUpdate = {
  caseId: string;
  location: {
    actorType: "CITIZEN" | "VOLUNTEER" | "AMBULANCE" | "DISPATCHER" | string;
    latitude: number;
    longitude: number;
    etaMinutes?: number;
    recordedAt?: string;
  };
};

export type RealtimeAmbulanceUpdate = {
  caseId: string;
  ambulance: {
    latitude: number;
    longitude: number;
    etaMinutes?: number;
    updatedAt?: string;
    status?: string;
  };
  route?: Array<{
    latitude: number;
    longitude: number;
  }>;
};

export type RealtimeCallStateUpdate = {
  emergencyId?: string;
  caseId?: string;
  at?: string;
};

export type RealtimeConnectionHandlers = {
  onEmergencyCreated: (payload?: unknown) => void;
  onStatusChanged: (payload?: unknown) => void;
  onCaseUpdated?: (payload?: unknown) => void;
  onVolunteerRequested?: (payload?: unknown) => void;
  onVolunteerAccepted?: (payload?: unknown) => void;
  onVolunteerAvailabilityChanged?: (payload?: unknown) => void;
  onLocationUpdate?: (payload: RealtimeLocationUpdate) => void;
  onAmbulanceUpdate?: (payload: RealtimeAmbulanceUpdate) => void;
  onCallStarted?: (payload: RealtimeCallStateUpdate) => void;
  onCallConnected?: (payload: RealtimeCallStateUpdate) => void;
  onCallEnded?: (payload: RealtimeCallStateUpdate) => void;
};

export const analyzeVoice = (input: VoiceAnalysisRequest): Promise<VoiceAnalysisPayload> =>
  request<VoiceAnalysisPayload>("/ai/voice", {
    method: "POST",
    body: JSON.stringify(input)
  }, {
    timeoutMs: AI_VOICE_TIMEOUT_MS,
    retryOnTimeout: true,
    fallbackMessage:
      "AI voice analysis took too long. Try again with a shorter segment (8-20s) or verify API/OpenAI connectivity."
  });

export const createEmergencyFromVoice = (input: Record<string, unknown>): Promise<EmergencyCaseSnapshot> =>
  request<EmergencyCaseSnapshot>("/emergency/create", {
    method: "POST",
    body: JSON.stringify(input)
  });

export const updateEmergencyCase = (
  caseId: string,
  input: UpdateEmergencyCaseInput
): Promise<EmergencyCaseSnapshot> =>
  request<EmergencyCaseSnapshot>(`/emergencies/${caseId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });

export const getNearbyVolunteersForCase = (caseId: string, radiusKm = 12): Promise<NearbyVolunteer[]> =>
  request<NearbyVolunteer[]>(
    `/emergencies/${caseId}/nearby-volunteers?radiusKm=${encodeURIComponent(String(radiusKm))}`
  );

export const assignVolunteerToCase = (caseId: string, volunteerId: string): Promise<unknown> =>
  request<unknown>(`/emergencies/${caseId}/assign-volunteer`, {
    method: "POST",
    body: JSON.stringify({ volunteerId })
  });

export const sendCaseMessageToVolunteer = (input: CaseMessageInput): Promise<unknown> =>
  request<unknown>("/messages", {
    method: "POST",
    body: JSON.stringify(input)
  });

export const addCaseUpdate = (input: AddCaseUpdateInput): Promise<unknown> =>
  request<unknown>(`/emergencies/${input.caseId}/updates`, {
    method: "POST",
    body: JSON.stringify({
      updateType: input.updateType,
      message: input.message,
      payload: input.payload ?? {}
    })
  });

export const closeEmergencyCase = (input: CloseEmergencyCaseInput): Promise<EmergencyCaseSnapshot> =>
  request<EmergencyCaseSnapshot>(`/emergencies/${input.caseId}/close`, {
    method: "POST",
    body: JSON.stringify({
      finalOutcome: input.finalOutcome,
      notes: input.notes,
      interventions: input.interventions
    })
  });

export const getDashboardOverview = async (): Promise<DashboardOverview> => {
  return request<DashboardOverview>("/dispatcher/overview");
};

export const getCaseDetails = async (caseId: string): Promise<CaseDetail> => {
  return request<CaseDetail>(`/dispatcher/cases/${caseId}`);
};

export const assignAmbulance = (caseId: string, ambulanceId: string): Promise<unknown> =>
  request<unknown>(`/dispatcher/cases/${caseId}/assign-ambulance`, {
    method: "POST",
    body: JSON.stringify({ ambulanceId })
  });

export const assignVolunteer = (caseId: string, volunteerId: string): Promise<unknown> =>
  request<unknown>(`/dispatcher/cases/${caseId}/assign-volunteer`, {
    method: "POST",
    body: JSON.stringify({ volunteerId })
  });

export const closeCase = (caseId: string, payload: IncidentClosurePayload): Promise<unknown> =>
  request<unknown>(`/dispatcher/cases/${caseId}/close`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

export const getReportsSummary = async (): Promise<ReportPoint[]> => {
  return request<ReportPoint[]>("/dispatcher/reports/summary");
};

export const createRealtimeConnection = (handlers: RealtimeConnectionHandlers): Socket => {
  let socketToken = authToken;
  const socket = io(WS_BASE_URL, {
    transports: ["websocket"],
    autoConnect: false,
    auth: (callback) => {
      callback(socketToken ? { token: socketToken } : {});
    }
  });

  socket.on("connect_error", (error) => {
    console.error("Realtime connection error:", error.message);
  });

  socket.on("connect", () => {
    socket.emit("dashboard:join");
  });

  socket.on("emergency:created", handlers.onEmergencyCreated);
  socket.on("emergency_created", handlers.onEmergencyCreated);
  socket.on("emergency:status-changed", handlers.onStatusChanged);
  socket.on("status_changed", handlers.onStatusChanged);

  if (handlers.onCaseUpdated) {
    socket.on("emergency:update", handlers.onCaseUpdated);
    socket.on("emergency:ambulance-assigned", handlers.onCaseUpdated);
    socket.on("emergency:closed", handlers.onCaseUpdated);
  }

  if (handlers.onVolunteerRequested) {
    socket.on("emergency:volunteer-assigned", handlers.onVolunteerRequested);
    socket.on("volunteer_requested", handlers.onVolunteerRequested);
  }

  if (handlers.onVolunteerAccepted) {
    socket.on("emergency:volunteer-responded", handlers.onVolunteerAccepted);
    socket.on("volunteer_accepted", handlers.onVolunteerAccepted);
  }

  if (handlers.onVolunteerAvailabilityChanged) {
    socket.on("volunteer_availability_changed", handlers.onVolunteerAvailabilityChanged);
  }

  if (handlers.onLocationUpdate) {
    socket.on("emergency:location-changed", handlers.onLocationUpdate);
    socket.on("location_update", handlers.onLocationUpdate);
  }

  if (handlers.onAmbulanceUpdate) {
    socket.on("ambulance_update", handlers.onAmbulanceUpdate);
  }

  if (handlers.onCallStarted) {
    socket.on("call_started", handlers.onCallStarted);
  }

  if (handlers.onCallConnected) {
    socket.on("call_connected", handlers.onCallConnected);
  }

  if (handlers.onCallEnded) {
    socket.on("call_ended", handlers.onCallEnded);
  }

  if (socketToken) {
    socket.connect();
  } else {
    void ensureDispatcherToken().then((token) => {
      if (!token) {
        console.warn(
          "Realtime disabled: dispatcher auth token is missing. Set VITE_DEMO_TOKEN or (VITE_DEMO_IDENTIFIER + VITE_DEMO_PASSWORD)."
        );
        return;
      }

      socketToken = token;
      socket.connect();
    });
  }

  return socket;
};
