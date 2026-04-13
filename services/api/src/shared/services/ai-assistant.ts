import {
  getMedicalTriageDiagnostics,
  runMedicalTriage,
  type MedicalTriagePayload,
  type TriageChatMessage
} from "./medical-triage";

export type AssistantChatMessage = TriageChatMessage;

type Language = "ar" | "en" | "mixed";
type ResponseLanguage = "ar" | "en";
type AssistantIntent = "medical_question" | "emergency" | "appointment" | "general" | "unclear";

export interface AssistantEntities {
  symptoms: string[];
  bodyParts: string[];
  medicines: string[];
  conditions: string[];
}

export interface AssistantAnalysis {
  intent: AssistantIntent;
  confidence: number;
  keywords: string[];
  entities: AssistantEntities;
}

interface TrustedSource {
  title: string;
  url: string;
}

const detectLanguageFromText = (text: string): Language => {
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasEnglish = /[A-Za-z]/.test(text);
  if (hasArabic && hasEnglish) {
    return "mixed";
  }
  return hasArabic ? "ar" : "en";
};

const extractFollowUpQuestions = (response: string): string[] =>
  response
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.endsWith("?") || line.endsWith("؟"))
    .slice(0, 2);

const mapTriageToAnalysis = (triage: MedicalTriagePayload): AssistantAnalysis => ({
  intent: triage.emergency ? "emergency" : "medical_question",
  confidence: triage.emergency ? 0.88 : 0.72,
  keywords: triage.type ? [triage.type] : [],
  entities: {
    symptoms: [],
    bodyParts: [],
    medicines: [],
    conditions: []
  }
});

export type AssistantServiceResult = {
  response: string;
  language: Language;
  responseLanguage: ResponseLanguage;
  isEmergency: boolean;
  preprocessed: boolean;
  needsFollowUp: boolean;
  followUpQuestions: string[];
  sources: TrustedSource[];
  analysis: AssistantAnalysis;
  triage: MedicalTriagePayload;
};

const buildServiceResult = (triage: MedicalTriagePayload, lastUserText: string): AssistantServiceResult => {
  const language = detectLanguageFromText(lastUserText || triage.response || "help");
  const responseLanguage: ResponseLanguage = /[\u0600-\u06FF]/.test(triage.response)
    ? "ar"
    : language === "ar"
      ? "ar"
      : "en";
  const followUpQuestions = extractFollowUpQuestions(triage.response);

  return {
    response: triage.response,
    language,
    responseLanguage,
    isEmergency: triage.emergency,
    preprocessed: false,
    needsFollowUp: followUpQuestions.length > 0,
    followUpQuestions,
    sources: [],
    analysis: mapTriageToAnalysis(triage),
    triage
  };
};

export const assistantResultFromTriage = (
  triage: MedicalTriagePayload,
  lastUserText: string
): AssistantServiceResult => buildServiceResult(triage, lastUserText);

export class AIAssistantService {
  static getRuntimeDiagnostics(): ReturnType<typeof getMedicalTriageDiagnostics> {
    return getMedicalTriageDiagnostics();
  }

  static async getResponseFromMessages(messages: AssistantChatMessage[]): Promise<AssistantServiceResult> {
    const sanitized = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content.trim() }))
      .filter((m) => m.content.length > 0);

    const lastUser = [...sanitized].reverse().find((m) => m.role === "user")?.content ?? "";
    const triage = await runMedicalTriage(sanitized);
    return buildServiceResult(triage, lastUser);
  }

  static async getResponse(
    userMessage: string,
    context: { history?: Array<{ role: string; content: string }>; userId?: string; modelOverride?: string } = {}
  ): Promise<AssistantServiceResult> {
    const history: AssistantChatMessage[] = (context.history || [])
      .filter((item) => item.role === "user" || item.role === "assistant")
      .map((item) => ({
        role: item.role as TriageChatMessage["role"],
        content: item.content.trim()
      }))
      .filter((item) => item.content.length > 0)
      .slice(-30);

    const messages: AssistantChatMessage[] = [...history, { role: "user" as const, content: userMessage.trim() }].filter(
      (m) => m.content.length > 0
    );

    return AIAssistantService.getResponseFromMessages(messages);
  }
}

export default AIAssistantService;
