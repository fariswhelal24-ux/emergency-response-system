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

const REQUEST_TIMEOUT_MS = 12_000;
const DEMO_TOKEN = "";

const trim = (value: string | undefined): string | undefined => {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
};

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const hostFromUri = (uri: string | undefined): string | undefined => {
  if (!uri) {
    return undefined;
  }

  const raw = uri.replace(/^https?:\/\//, "");
  const hostPort = raw.split("/")[0];
  const host = hostPort.split(":")[0];
  return trim(host);
};

const getExpoHost = (): string | undefined => {
  const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL;
  const scriptHost = hostFromUri(scriptURL);
  if (scriptHost) {
    return scriptHost;
  }

  const serverHost = (NativeModules as { PlatformConstants?: { ServerHost?: string } }).PlatformConstants?.ServerHost;
  const platformHost = hostFromUri(serverHost) ?? trim(serverHost?.split(":")[0]);
  if (platformHost) {
    return platformHost;
  }

  const locationHost = (globalThis as { location?: { hostname?: string } }).location?.hostname;
  return trim(locationHost);
};

const getApiBaseCandidates = (): string[] => {
  const envBase = trim(
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.EXPO_PUBLIC_API_BASE_URL
  );
  const expoHost = getExpoHost();

  const candidates = new Set<string>();

  if (envBase) {
    candidates.add(stripTrailingSlash(envBase));
  }

  if (expoHost) {
    candidates.add(`http://${expoHost}:4100/api/v1`);
  }

  if (Platform.OS === "android") {
    candidates.add("http://10.0.2.2:4100/api/v1");
  }

  candidates.add("http://localhost:4100/api/v1");
  candidates.add("http://127.0.0.1:4100/api/v1");

  return Array.from(candidates);
};

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

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const json = (await response.json()) as { error?: string; message?: string };
    return json.error || json.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const request = async (path: string, init?: RequestInit) => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(DEMO_TOKEN ? { Authorization: `Bearer ${DEMO_TOKEN}` } : {}),
    ...(init?.headers ?? {})
  };

  const errors: string[] = [];
  const bases = getApiBaseCandidates();

  for (const base of bases) {
    const url = `${base}${path}`;

    try {
      const response = await withTimeout(url, {
        ...init,
        headers
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        errors.push(`${base} -> ${message}`);
        continue;
      }

      return await response.json();
    } catch (error) {
      errors.push(`${base} -> ${(error as Error).message}`);
    }
  }

  throw new Error(`API unreachable. ${errors.join(" | ")}`);
};

const detectLanguage = (message: string): "ar" | "en" | "mixed" => {
  const hasArabic = /[\u0600-\u06FF]/.test(message);
  const hasEnglish = /[A-Za-z]/.test(message);

  if (hasArabic && hasEnglish) {
    return "mixed";
  }

  return hasArabic ? "ar" : "en";
};

const detectEmergency = (message: string): boolean =>
  /not breathing|unconscious|not responsive|severe chest pain|stroke|seizure|severe bleeding|overdose|poison|suicid|لا يتنفس|فاقد الوعي|لا يستجيب|ألم صدر شديد|جلطة|نزيف شديد|تسمم|انتحار/i.test(
    message
  );

const localMedicalFallback = (message: string): MedicalChatResult => {
  const language = detectLanguage(message);
  const responseLanguage: "ar" | "en" = language === "ar" ? "ar" : "en";
  const isEmergency = detectEmergency(message);

  if (isEmergency) {
    return {
      message:
        responseLanguage === "ar"
          ? "هذه حالة طارئة. اتصل بالإسعاف فوراً الآن واتبع تعليماتهم."
          : "This is an emergency. Call emergency services immediately and follow dispatcher instructions.",
      analysis: {
        language,
        responseLanguage,
        isEmergency: true,
        needsFollowUp: true,
        followUpQuestions:
          responseLanguage === "ar"
            ? ["ما موقع الحالة الآن؟", "هل يوجد تنفس؟", "هل يوجد نزيف شديد؟"]
            : ["What is the exact location?", "Is the patient breathing?", "Is there severe bleeding?"],
        sources: [
          {
            title: "WHO Emergency Care",
            url: "https://www.who.int/health-topics/emergency-care"
          }
        ]
      }
    };
  }

  return {
    message:
      responseLanguage === "ar"
        ? "سأقدم إرشادات أولية عامة. أرسل تفاصيل أكثر عن الأعراض والشدة والمدة."
        : "I can provide general first-aid guidance. Share more details about symptoms, severity, and duration.",
    analysis: {
      language,
      responseLanguage,
      isEmergency: false,
      needsFollowUp: true,
      followUpQuestions:
        responseLanguage === "ar"
          ? ["متى بدأت الأعراض؟", "ما الشدة من 1 إلى 10؟", "هل يوجد ضيق تنفس؟"]
          : ["When did symptoms start?", "Severity from 1 to 10?", "Any breathing difficulty?"],
      sources: [
        {
          title: "MedlinePlus",
          url: "https://medlineplus.gov"
        }
      ]
    }
  };
};

export const respondToAlert = async (caseId: string, accepted: boolean) => {
  try {
    const result = await request(`/emergencies/${caseId}/volunteer-response`, {
      method: "POST",
      body: JSON.stringify({ accepted })
    });

    return result.data;
  } catch {
    return { accepted };
  }
};

export const updateAvailability = async (available: boolean) => {
  try {
    const result = await request("/volunteers/me/availability", {
      method: "PATCH",
      body: JSON.stringify({
        availability: available ? "AVAILABLE" : "OFF_DUTY"
      })
    });

    return result.data;
  } catch {
    return { available };
  }
};

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
      message: result?.data?.assistantMessage?.content ?? "",
      analysis: {
        language: result?.data?.analysis?.language ?? "en",
        responseLanguage: result?.data?.analysis?.responseLanguage ?? "en",
        isEmergency: Boolean(result?.data?.analysis?.isEmergency),
        needsFollowUp: Boolean(result?.data?.analysis?.needsFollowUp),
        followUpQuestions: result?.data?.analysis?.followUpQuestions ?? [],
        sources: result?.data?.analysis?.sources ?? []
      }
    };
  } catch {
    const lastUserMessage = [...messages].reverse().find((item) => item.role === "user")?.content ?? "";
    return localMedicalFallback(lastUserMessage);
  }
};
