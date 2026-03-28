import { NativeModules, Platform } from "react-native";

export type MedicalChatMessagePayload = {
  role: "user" | "assistant";
  content: string;
};

export type MedicalChatResult = {
  message: string;
  analysis: {
    language: "ar" | "en" | "mixed";
    responseLanguage: "ar" | "en";
    isEmergency: boolean;
    needsFollowUp: boolean;
    followUpQuestions: string[];
    sources: Array<{ title: string; url: string }>;
  };
};

const REQUEST_TIMEOUT_MS = 12000;

// 🔥 حط IP تبعك هون
const API_BASE = "http://192.168.1.102:4100/api/v1";
const withTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

let authToken = "test-token";
let authTokenPromise: Promise<string> | null = null;

export const setAuthToken = (token: string) => {
  authToken = token;
};

const readExpoHost = (): string | undefined => {
  const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL;
  const rawHost = scriptURL?.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (rawHost?.trim()) {
    return rawHost.trim();
  }

  const serverHost = (NativeModules as { PlatformConstants?: { ServerHost?: string } }).PlatformConstants?.ServerHost;
  const fallbackHost = serverHost?.split(":")[0];
  return fallbackHost?.trim() ? fallbackHost.trim() : undefined;
};

const normalizeForEmail = (value: string): string => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "mobile";
};

const isPlaceholderToken = (token: string): boolean => {
  const lowered = token.trim().toLowerCase();
  return lowered === "test-token" || lowered === "your-jwt-token-here";
};

const getDemoCredentials = () => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const hostPart = normalizeForEmail(readExpoHost() ?? "local");
  const platformPart = normalizeForEmail(Platform.OS);

  const email =
    env?.EXPO_PUBLIC_CITIZEN_DEMO_EMAIL?.trim() || `citizen-${platformPart}-${hostPart}@rapidaid.local`;
  const password = env?.EXPO_PUBLIC_CITIZEN_DEMO_PASSWORD?.trim() || "Citizen123!";
  const fullName = env?.EXPO_PUBLIC_CITIZEN_DEMO_NAME?.trim() || "RapidAid Citizen";

  return { email, password, fullName };
};

const extractAccessToken = (payload: any): string | null => {
  const token = payload?.data?.tokens?.accessToken;
  return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
};

const ensureValidCitizenToken = async (): Promise<string> => {
  if (authToken && !isPlaceholderToken(authToken)) {
    return authToken;
  }

  if (authTokenPromise) {
    return authTokenPromise;
  }

  authTokenPromise = (async () => {
    const credentials = getDemoCredentials();

    const login = async (): Promise<string | null> => {
      const response = await withTimeout(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          return null;
        }

        throw new Error(await parseErrorMessage(response));
      }

      const payload = await response.json();
      return extractAccessToken(payload);
    };

    const register = async (): Promise<string | null> => {
      const response = await withTimeout(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fullName: credentials.fullName,
          email: credentials.email,
          password: credentials.password,
          role: "CITIZEN"
        })
      });

      if (!response.ok) {
        if (response.status === 409) {
          return null;
        }

        throw new Error(await parseErrorMessage(response));
      }

      const payload = await response.json();
      return extractAccessToken(payload);
    };

    const loginToken = await login();
    if (loginToken) {
      authToken = loginToken;
      return loginToken;
    }

    const registerToken = await register();
    if (registerToken) {
      authToken = registerToken;
      return registerToken;
    }

    const secondLoginToken = await login();
    if (!secondLoginToken) {
      throw new Error("Unable to authenticate citizen session");
    }

    authToken = secondLoginToken;
    return secondLoginToken;
  })().finally(() => {
    authTokenPromise = null;
  });

  return authTokenPromise;
};

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const json = await response.json();
    return json.error || json.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

// ✅ request نظيف بدون fallback
const request = async (path: string, init?: RequestInit) => {
  const url = `${API_BASE}${path}`;
  const needsAuth = path.startsWith("/emergencies");
  const token =
    needsAuth ? await ensureValidCitizenToken() : authToken && !isPlaceholderToken(authToken) ? authToken : "";

  console.log("🚀 Sending request to:", url);

  const response = await withTimeout(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    console.warn("API warning:", errorMessage);
    throw new Error(errorMessage);
  }

  const data = await response.json();

  console.log("✅ API Response:", data);

  return data;
};

// 🔥 chat function
export const sendMedicalChatMessage = async (
  messages: MedicalChatMessagePayload[]
): Promise<MedicalChatResult> => {
  try {
    const result = await request("/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        messages
      })
    });

    return {
      message: result?.data?.assistantMessage?.content || "No response",
      analysis: {
        language: result?.data?.analysis?.language || "en",
        responseLanguage: result?.data?.analysis?.responseLanguage || "en",
        isEmergency: Boolean(result?.data?.analysis?.isEmergency),
        needsFollowUp: Boolean(result?.data?.analysis?.needsFollowUp),
        followUpQuestions: result?.data?.analysis?.followUpQuestions || [],
        sources: result?.data?.analysis?.sources || []
      }
    };
  } catch (error) {
    console.warn("CHAT warning:", error);
    throw error; // ❌ ما في fallback
  }
};

// (اختياري) emergency request
export const createEmergencyRequest = async (payload: any) => {
  const result = await request("/emergencies", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return result?.data ?? result;
};

export const sendEmergencyUpdate = async (caseId: string, message: string) => {
  const result = await request(`/emergencies/${caseId}/updates`, {
    method: "POST",
    body: JSON.stringify({
      updateType: "USER_UPDATE",
      message
    })
  });

  return result?.data ?? result;
};
