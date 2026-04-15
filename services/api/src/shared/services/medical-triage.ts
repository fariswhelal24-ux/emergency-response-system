import OpenAI from "openai";

import { env } from "../../config/env.js";

export type TriageSeverity = "low" | "medium" | "high";

export interface MedicalTriagePayload {
  /** Short structured reasoning for logs / dashboards (not shown to the user by default). */
  decisionSummary: string;
  type: string;
  emergency: boolean;
  severity: TriageSeverity;
  response: string;
}

export type TriageChatRole = "user" | "assistant";

export interface TriageChatMessage {
  role: TriageChatRole;
  content: string;
}

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;
const CHAT_TIMEOUT_MS = 12_000;

let openAICooldownUntil = 0;
let lastOpenAIFailureAt: string | null = null;
let lastOpenAIFailureReason: string | null = null;
let lastOpenAISuccessAt: string | null = null;
let lastFallbackAt: string | null = null;
let lastFallbackReason: string | null = null;

class OpenAITimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`OpenAI request timed out after ${timeoutMs}ms`);
    this.name = "OpenAITimeoutError";
  }
}

const withOpenAITimeout = async <T>(promise: Promise<T>, timeoutMs: number = CHAT_TIMEOUT_MS): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new OpenAITimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const shouldBypassOpenAI = (): boolean => Date.now() < openAICooldownUntil;

const setOpenAICooldown = (milliseconds: number): void => {
  openAICooldownUntil = Date.now() + milliseconds;
};

const markOpenAISuccess = (): void => {
  lastOpenAISuccessAt = new Date().toISOString();
};

const markOpenAIFailure = (reason: string): void => {
  lastOpenAIFailureAt = new Date().toISOString();
  lastOpenAIFailureReason = reason;
};

const markFallback = (reason: string): void => {
  lastFallbackAt = new Date().toISOString();
  lastFallbackReason = reason;
};

const extractOpenAIError = (
  error: unknown
): { status?: number; code?: string; type?: string; message?: string } => {
  if (!error || typeof error !== "object") {
    return {};
  }
  const candidate = error as {
    status?: unknown;
    code?: unknown;
    type?: unknown;
    message?: unknown;
    error?: { code?: unknown; type?: unknown; message?: unknown };
  };
  return {
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    code:
      typeof candidate.code === "string"
        ? candidate.code
        : typeof candidate.error?.code === "string"
          ? candidate.error.code
          : undefined,
    type:
      typeof candidate.type === "string"
        ? candidate.type
        : typeof candidate.error?.type === "string"
          ? candidate.error.type
          : undefined,
    message:
      typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.error?.message === "string"
          ? candidate.error.message
          : undefined
  };
};

const buildModelCandidates = (preferred?: string): string[] =>
  Array.from(
    new Set(
      [(preferred || "").trim(), (env.openaiModel || "").trim(), "gpt-4.1-mini"].filter((value) => value.length > 0)
    )
  );

const detectLanguageHint = (text: string): "ar" | "en" =>
  /[\u0600-\u06FF]/.test(text) ? "ar" : "en";

const TRIAGE_SYSTEM_PROMPT = `You are a real-time medical decision-making AI inside an emergency-response app.

Priority: fast, accurate judgment — not generic or scripted answers.

Work order (do this mentally, then output JSON):
1. Understand the situation deeply from the user’s words (meaning and context, not keyword matching).
2. Decide immediately:
   - emergency: true or false — would immediate ambulance / emergency services be appropriate for what they actually described?
   - severity: "low" | "medium" | "high" — how urgent is it?
   - In free prose (not a rigid label list), what is most likely going on given ONLY what they said?
3. Write the user-facing message from that understanding only.

Your entire output MUST be one JSON object with exactly these keys:
- "decision_summary": 2–4 sentences in the SAME language as the user’s last message. This is structured reasoning for the system: what you understood, why emergency true/false, and urgency. Do NOT use fixed templates; think in your own words. This field is not shown to the user in the app UI by default.
- "type": short snake_case tag for analytics only (e.g. choking, possible_cardiac, bleeding, respiratory, collapse, seizure, minor_complaint, unclear). Infer from meaning.
- "emergency": boolean.
- "severity": "low" | "medium" | "high".
- "response": the ONLY text the end user sees. Same language as the user. Never put JSON inside "response".

Formatting for "response" (ChatGPT-style readability):
- Use a few tasteful, relevant emojis (e.g. ⚠️ for urgent warning, ✅ for reassurance, 📞 for calling help, 💡 for tips) — not every line; keep it professional.
- Structure clearly: short intro if needed, then blank line between sections.
- Numbered steps: use "1." "2." "3." with ONE step per line (newline after each number).
- Bullet tips: one bullet per line (use "• " or "- ").
- Keep paragraphs short; avoid one huge block of text.

Hard rules:
- Do NOT assume symptoms, history, or details the user did not state.
- Do NOT follow canned scripts; adapt every sentence to this exact situation.
- Do NOT name specific drugs or doses unless the user explicitly mentioned that drug.
- If emergency is true: urgent, action-first; clear warning opening line, call emergency services, then immediate steps.
- If emergency is false: calm, helpful, specific — no false alarm.
- You are not a diagnosing physician; safety-oriented triage and first-aid style guidance only.`;

const normalizeSeverity = (value: unknown): TriageSeverity => {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "medium";
};

const parseTriageJson = (raw: string): MedicalTriagePayload | null => {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rawSummary =
      typeof parsed.decision_summary === "string"
        ? parsed.decision_summary.trim()
        : typeof parsed.decisionSummary === "string"
          ? parsed.decisionSummary.trim()
          : "";
    const type =
      typeof parsed.type === "string" && parsed.type.trim().length > 0
        ? parsed.type.trim().slice(0, 80)
        : "general";
    const response = typeof parsed.response === "string" ? parsed.response.trim() : "";
    const decisionSummary = rawSummary.slice(0, 1_500);
    if (!response || response.length < 8 || decisionSummary.length < 12) {
      return null;
    }
    return {
      decisionSummary,
      type,
      emergency: Boolean(parsed.emergency),
      severity: normalizeSeverity(parsed.severity),
      response: response.slice(0, 12_000)
    };
  } catch {
    return null;
  }
};

const unavailablePayload = (lang: "ar" | "en"): MedicalTriagePayload => {
  if (lang === "ar") {
    return {
      decisionSummary:
        "الخدمة غير متاحة تقنياً؛ لا يمكن إجراء تقييم طبي. يُنصح المستخدم بالاتصال بالطوارئ إذا كانت هناك شكوك خطيرة.",
      type: "assistant_unavailable",
      emergency: false,
      severity: "low",
      response:
        "تعذّر الاتصال بمساعد الفحص الطبي الآن. إذا كانت الحالة مهددة للحياة، اتصل بخدمات الطوارئ فوراً."
    };
  }
  return {
    decisionSummary:
      "Triage service unavailable; no AI assessment performed. User advised to call emergency services if life-threatening concern.",
    type: "assistant_unavailable",
    emergency: false,
    severity: "low",
    response:
      "The medical triage assistant is unavailable right now. If this is life-threatening, call emergency services immediately."
  };
};

export function getMedicalTriageDiagnostics(): {
  openAIConfigured: boolean;
  bypassActive: boolean;
  cooldownRemainingMs: number;
  lastOpenAISuccessAt: string | null;
  lastOpenAIFailureAt: string | null;
  lastOpenAIFailureReason: string | null;
  lastFallbackAt: string | null;
  lastFallbackReason: string | null;
} {
  const cooldownRemainingMs = Math.max(0, openAICooldownUntil - Date.now());
  return {
    openAIConfigured: Boolean(client),
    bypassActive: cooldownRemainingMs > 0,
    cooldownRemainingMs,
    lastOpenAISuccessAt,
    lastOpenAIFailureAt,
    lastOpenAIFailureReason,
    lastFallbackAt,
    lastFallbackReason
  };
}

/**
 * Single OpenAI call: semantic triage + user-facing instructions. No server-side keyword rules.
 */
export async function runMedicalTriage(messages: TriageChatMessage[]): Promise<MedicalTriagePayload> {
  const sanitized = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content.length > 0)
    .slice(-40);

  const lastUser = [...sanitized].reverse().find((m) => m.role === "user")?.content ?? "";
  const lang = detectLanguageHint(lastUser || sanitized.map((m) => m.content).join(" ") || "help");

  if (!client) {
    markFallback("openai_not_configured");
    return unavailablePayload(lang);
  }

  if (shouldBypassOpenAI()) {
    markFallback("openai_cooldown_active");
    return unavailablePayload(lang);
  }

  const models = buildModelCandidates(env.openaiModel || "gpt-4.1");

  for (const model of models) {
    try {
      const completion = await withOpenAITimeout(
        client.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: 1_400,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: TRIAGE_SYSTEM_PROMPT },
            ...sanitized.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
          ]
        }),
        CHAT_TIMEOUT_MS
      );

      const candidate = completion.choices[0]?.message?.content?.trim();
      if (!candidate) {
        continue;
      }
      const parsed = parseTriageJson(candidate);
      if (parsed) {
        markOpenAISuccess();
        return parsed;
      }
    } catch (err) {
      const details = extractOpenAIError(err);
      if (err instanceof OpenAITimeoutError) {
        markOpenAIFailure("openai_timeout");
      } else {
        markOpenAIFailure(details.message || details.code || details.type || "openai_error");
      }
      if (
        details.status === 429 ||
        details.code === "insufficient_quota" ||
        details.type === "insufficient_quota"
      ) {
        const cooldownMs =
          details.code === "insufficient_quota" || details.type === "insufficient_quota"
            ? 15 * 60 * 1000
            : 2 * 60 * 1000;
        setOpenAICooldown(cooldownMs);
      } else if (details.status === 401 || details.code === "invalid_api_key") {
        setOpenAICooldown(10 * 60 * 1000);
      }
    }
  }

  markFallback("openai_empty_or_invalid_triage_json");
  return unavailablePayload(lang);
}
