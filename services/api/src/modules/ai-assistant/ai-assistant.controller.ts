import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Request, Response } from "express";
import OpenAI from "openai";

import { env } from "../../config/env";
import {
  emergencyRepository,
  type EmergencyCaseRow,
  type VolunteerAssignmentRow,
  type VolunteerNearbyRow
} from "../emergencies/emergency.repository";
import { emitEmergencyUpdate, emitStatusChanged, emitVolunteerAssigned } from "../../sockets/realtimeServer";
import AIAssistantService, {
  assistantResultFromTriage,
  type AssistantServiceResult
} from "../../shared/services/ai-assistant";
import type { AssistantChatMessage } from "../../shared/services/ai-assistant";
import type { MedicalTriagePayload } from "../../shared/services/medical-triage";
import ConversationMemoryService from "../../shared/services/conversation-memory";
import { pushNotificationService } from "../../shared/services/push-notifications";

const buildConversationTitle = (message: string): string => {
  const plain = message.trim().replace(/\s+/g, " ");
  if (!plain) {
    return "Medical Chat";
  }

  const words = plain.split(" ").slice(0, 8).join(" ");
  return words.length > 48 ? `${words.slice(0, 45)}...` : words;
};

const sanitizePublicHistory = (history: unknown): Array<{ role: "user" | "assistant"; content: string }> => {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;

      if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
        return null;
      }

      if (!content.trim()) {
        return null;
      }

      return { role, content };
    })
    .filter((item): item is { role: "user" | "assistant"; content: string } => item !== null)
    .slice(-30);
};

const sanitizeMessages = (messages: unknown): AssistantChatMessage[] => {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;

      if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
        return null;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return null;
      }

      return {
        role,
        content: trimmed
      };
    })
    .filter((item): item is AssistantChatMessage => item !== null)
    .slice(-40);
};

const detectChatLanguage = (text: string): "ar" | "en" => (/[\u0600-\u06FF]/.test(text) ? "ar" : "en");

const buildChatDataCore = (assistantResult: AssistantServiceResult) => ({
  type: assistantResult.triage.type,
  emergency: assistantResult.triage.emergency,
  severity: assistantResult.triage.severity,
  decisionSummary: assistantResult.triage.decisionSummary,
  response: assistantResult.response,
  assistantMessage: {
    role: "assistant" as const,
    content: assistantResult.response
  },
  analysis: {
    intent: assistantResult.analysis.intent,
    confidence: assistantResult.analysis.confidence,
    keywords: assistantResult.analysis.keywords,
    entities: assistantResult.analysis.entities,
    isEmergency: assistantResult.isEmergency,
    preprocessed: assistantResult.preprocessed,
    language: assistantResult.language,
    responseLanguage: assistantResult.responseLanguage,
    needsFollowUp: assistantResult.needsFollowUp,
    followUpQuestions: assistantResult.followUpQuestions,
    sources: assistantResult.sources
  }
});

/** Non–AI fallback when the chat handler throws (no keyword-based triage). */
const buildControllerChatFallback = (messages: AssistantChatMessage[]): AssistantServiceResult => {
  const lastUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content?.trim() ?? "";
  const language = detectChatLanguage(lastUserMessage || "help");
  const triage: MedicalTriagePayload =
    language === "ar"
      ? {
          decisionSummary:
            "فشل مسار الخادم قبل إكمال تقييم الذكاء الاصطناعي؛ تم إرجاع رسالة خطأ عامة دون تحليل سريري.",
          type: "service_error",
          emergency: false,
          severity: "low",
          response:
            "حدث خطأ أثناء المعالجة. يرجى المحاولة مرة أخرى. إذا كانت الحالة طارئة، اتصل بالإسعاف مباشرة."
        }
      : {
          decisionSummary:
            "Server handler failed before AI triage completed; generic error message returned without clinical inference.",
          type: "service_error",
          emergency: false,
          severity: "low",
          response:
            "Something went wrong while processing your message. Please try again. If this is an emergency, call emergency services directly."
        };
  return assistantResultFromTriage(triage, lastUserMessage);
};

const DEFAULT_AUDIO_MIME = "audio/webm";
const MAX_VOICE_BYTES = 12 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const transcriptionClient = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

const compactSpaces = (value: string): string => value.replace(/\s+/g, " ").trim();

class StageTimeoutError extends Error {
  constructor(stage: string, timeoutMs: number) {
    super(`${stage} timed out after ${timeoutMs}ms`);
    this.name = "StageTimeoutError";
  }
}

const withStageTimeout = async <T>(stage: string, promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new StageTimeoutError(stage, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const appendAndTrim = (current: string | null | undefined, next: string, maxLength: number): string => {
  const merged = compactSpaces([current || "", next].filter(Boolean).join(" "));
  if (merged.length <= maxLength) {
    return merged;
  }

  return merged.slice(merged.length - maxLength);
};

type VoiceConversationSpeaker = "PATIENT" | "CALL_CENTER";

type VoiceConversationTurn = {
  speaker: VoiceConversationSpeaker;
  text: string;
  confidence: number;
};

type VoiceConversationInference = {
  turns: VoiceConversationTurn[];
  callSummary: string;
  inferenceMethod: "ai" | "heuristic";
};

type DispatchPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type DispatchRecommendation = {
  patientCount: number;
  requiredVolunteers: number;
  priority: DispatchPriority;
  emergencyType: string;
  rationale: string;
};

type CaseContextInput = {
  emergencyType?: string;
  priority?: DispatchPriority;
  address?: string;
  latitude?: number;
  longitude?: number;
};

type CaseUpdateSuggestion = {
  emergencyType: string;
  priority: DispatchPriority;
  address?: string;
  latitude?: number;
  longitude?: number;
  locationConfidence?: number;
  possibleCondition?: string;
  riskLevel: DispatchPriority;
  patientCount: number;
  requiredVolunteers: number;
  summary: string;
};

type AICaseFieldExtraction = {
  emergencyType?: string;
  priority?: DispatchPriority;
  address?: string;
  latitude?: number;
  longitude?: number;
  locationConfidence?: number;
  possibleCondition?: string;
  patientCount?: number;
  requiredVolunteers?: number;
  summary?: string;
};

type CriticalCaseFacts = {
  patientCount: number;
  requiredVolunteers: number;
  priority: DispatchPriority;
  emergencyType: string;
  possibleCondition?: string;
  riskLevel: DispatchPriority;
  address?: string;
  breathingStatus: "normal" | "distressed" | "not_breathing" | "unknown";
  consciousnessStatus: "alert" | "reduced" | "unconscious" | "unknown";
  bleedingStatus: "none" | "minor" | "severe" | "unknown";
  hasChestPain: boolean;
  hasSeizure: boolean;
  hasTrauma: boolean;
  summary: string;
};

type EmergencyLevel = "LOW" | "MEDIUM" | "HIGH";
type DecisionAction = "DISPATCH" | "MONITOR" | "ASK_FOR_MORE_INFO";
type DecisionMode = "AUTO" | "OPERATOR_REVIEW" | "OPERATOR_CONFIRMATION_REQUIRED";

type DecisionScoreSignal = {
  code: string;
  score: number;
  evidence: string;
};

type AudioIntelligenceSnapshot = {
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

type DecisionEngineResult = {
  emergencyLevel: EmergencyLevel;
  recommendedAction: DecisionAction;
  confidence: number;
  confidenceBand: DecisionMode;
  score: number;
  scoreSignals: DecisionScoreSignal[];
  operatorAlert: string;
  escalationReason?: string;
  audioIntelligence: AudioIntelligenceSnapshot;
};

type AssignedVolunteerDispatchInfo = {
  assignment: VolunteerAssignmentRow;
  volunteer: VolunteerNearbyRow;
  etaMinutes?: number;
  distanceKm?: number;
};

type AutoDispatchExecutionResult = {
  actionTaken: boolean;
  requestedTarget: number;
  activeAssignments: number;
  createdAssignments: number;
  skippedReason?: string;
  assignedVolunteers: AssignedVolunteerDispatchInfo[];
  caseAfterDispatch: EmergencyCaseRow | null;
};

type VoiceAssistantResult = Awaited<ReturnType<typeof AIAssistantService.getResponse>>;

const getAudioExtension = (mimeType: string): string => {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("m4a") || mimeType.includes("mp4")) return "m4a";
  return "webm";
};

const normalizeIncomingAudio = (audio: string, requestedMimeType?: string): { base64: string; mimeType: string } => {
  const trimmed = audio.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/i);

  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1]?.trim().toLowerCase() || DEFAULT_AUDIO_MIME,
      base64: dataUrlMatch[2]?.replace(/\s+/g, "") || ""
    };
  }

  return {
    mimeType: typeof requestedMimeType === "string" && requestedMimeType.trim()
      ? requestedMimeType.trim().toLowerCase()
      : DEFAULT_AUDIO_MIME,
    base64: trimmed.replace(/\s+/g, "")
  };
};

const transcribeAudio = async (params: {
  audioBuffer: Buffer;
  mimeType: string;
  languageHint?: "ar" | "en";
}): Promise<{ text: string; usedTranscriptionModel: boolean }> => {
  if (!transcriptionClient) {
    return { text: "", usedTranscriptionModel: false };
  }

  const extension = getAudioExtension(params.mimeType);
  const tempFilePath = path.join(os.tmpdir(), `ers-voice-${crypto.randomUUID()}.${extension}`);
  const preferredModel = (env.openaiTranscriptionModel || "gpt-4o-mini-transcribe").trim();
  const transcriptionModels = Array.from(
    new Set([preferredModel, "whisper-1"].filter((value) => value.length > 0))
  );

  await fs.writeFile(tempFilePath, params.audioBuffer);

  try {
    let lastError: unknown;

    for (const model of transcriptionModels) {
      try {
        const transcription = await transcriptionClient.audio.transcriptions.create({
          file: createReadStream(tempFilePath),
          model,
          ...(params.languageHint ? { language: params.languageHint } : {})
        });

        return {
          text: typeof transcription.text === "string" ? transcription.text.trim() : "",
          usedTranscriptionModel: true
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  } finally {
    await fs.unlink(tempFilePath).catch(() => undefined);
  }
};

const normalizeSpeaker = (value: unknown): VoiceConversationSpeaker | null => {
  if (typeof value !== "string") {
    return null;
  }

  const upper = value.trim().toUpperCase();
  if (upper === "PATIENT" || upper === "CALLER" || upper === "USER") {
    return "PATIENT";
  }

  if (upper === "CALL_CENTER" || upper === "DISPATCHER" || upper === "OPERATOR" || upper === "AGENT") {
    return "CALL_CENTER";
  }

  return null;
};

const CALL_CENTER_PREFIX_PATTERN =
  /^(?:dispatcher|operator|call\s*center|agent|nurse|ems|مركز\s*الاتصال|المشغل|الديزباشر|المسعف|الممرضة)\s*[:：-]/i;
const PATIENT_PREFIX_PATTERN = /^(?:patient|caller|user|citizen|المريض|المتصل|المواطن)\s*[:：-]/i;
const CALL_CENTER_LINGUISTIC_CUES =
  /\b(what|where|when|how|which|can you|please|confirm|tell me|is he|is she|are they|do you|did you|have you)\b|(?:شو|وين|متى|كيف|هل|كم|أكد|خبرني|احكيلي|اعطيني)/i;
const PATIENT_LINGUISTIC_CUES =
  /\b(i|my|me|he|she|father|mother|child|wife|husband|hurts|pain|bleeding|breathing|fainted|injured|accident)\b|(?:عندي|عنده|عندها|عنا|أبوي|امي|ابني|بنتي|زوجي|زوجتي|مريض|يتألم|نزيف|لا يتنفس|حادث|وقع)/i;

const inferSpeakerFromSegment = (
  rawSegment: string,
  fallbackSpeaker: VoiceConversationSpeaker
): { speaker: VoiceConversationSpeaker; confidence: number; usedFallback: boolean } => {
  if (CALL_CENTER_PREFIX_PATTERN.test(rawSegment)) {
    return { speaker: "CALL_CENTER", confidence: 0.94, usedFallback: false };
  }

  if (PATIENT_PREFIX_PATTERN.test(rawSegment)) {
    return { speaker: "PATIENT", confidence: 0.94, usedFallback: false };
  }

  const clean = stripTurnPrefix(rawSegment);
  if (!clean) {
    return { speaker: fallbackSpeaker, confidence: 0.45, usedFallback: true };
  }

  let callCenterScore = 0;
  let patientScore = 0;

  if (/[?؟]\s*$/.test(clean)) {
    callCenterScore += 1.6;
  }
  if (CALL_CENTER_LINGUISTIC_CUES.test(clean)) {
    callCenterScore += 1.5;
  }
  if (PATIENT_LINGUISTIC_CUES.test(clean)) {
    patientScore += 1.5;
  }
  if (/^(?:please|kindly|can you|هل|لو سمحت|ممكن)/i.test(clean)) {
    callCenterScore += 0.6;
  }
  if (/^(?:i|my|عندي|عنده|أبوي|امي|ابني|بنتي)\b/i.test(clean)) {
    patientScore += 0.6;
  }

  const scoreDelta = Math.abs(callCenterScore - patientScore);
  if (scoreDelta < 0.45) {
    return { speaker: fallbackSpeaker, confidence: 0.5, usedFallback: true };
  }

  const speaker: VoiceConversationSpeaker = callCenterScore > patientScore ? "CALL_CENTER" : "PATIENT";
  const confidence = Number(Math.min(0.92, 0.56 + scoreDelta * 0.13).toFixed(2));

  return {
    speaker,
    confidence,
    usedFallback: false
  };
};

const mergeAdjacentTurns = (turns: VoiceConversationTurn[]): VoiceConversationTurn[] => {
  if (turns.length <= 1) {
    return turns;
  }

  const merged: VoiceConversationTurn[] = [];
  for (const turn of turns) {
    const text = compactSpaces(turn.text);
    if (!text) {
      continue;
    }

    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.speaker === turn.speaker &&
      previous.text.length + text.length <= 280
    ) {
      previous.text = `${previous.text} ${text}`;
      previous.confidence = Number(
        Math.min(0.99, Math.max(previous.confidence, turn.confidence) * 0.98).toFixed(2)
      );
      continue;
    }

    merged.push({
      speaker: turn.speaker,
      text,
      confidence: Number(Math.max(0, Math.min(1, turn.confidence)).toFixed(2))
    });
  }

  return merged;
};

const sanitizeConversationTurns = (value: unknown): VoiceConversationTurn[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const speaker = normalizeSpeaker((item as { speaker?: unknown }).speaker);
      const text = (item as { text?: unknown }).text;
      const confidenceRaw = (item as { confidence?: unknown }).confidence;

      if (!speaker || typeof text !== "string" || !text.trim()) {
        return null;
      }

      const confidenceNumeric = typeof confidenceRaw === "number" ? confidenceRaw : Number(confidenceRaw);
      const confidence = Number.isFinite(confidenceNumeric)
        ? Math.max(0, Math.min(1, confidenceNumeric))
        : 0.7;

      return {
        speaker,
        text: text.trim(),
        confidence: Number(confidence.toFixed(2))
      };
    })
    .filter((item): item is VoiceConversationTurn => item !== null)
    .slice(0, 30);
};

function stripTurnPrefix(segment: string): string {
  return segment
    .replace(
      /^(?:patient|caller|user|citizen|dispatcher|operator|call\s*center|agent|nurse|ems|المريض|المتصل|المواطن|مركز\s*الاتصال|المشغل|الديزباشر|المسعف|الممرضة)\s*[:：-]\s*/i,
      ""
    )
    .trim();
}

const buildHeuristicConversationTurns = (transcription: string): VoiceConversationTurn[] => {
  const normalized = transcription.replace(/\r/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const segments =
    lines.length >= 2
      ? lines
      : normalized
          .split(/(?<=[.!?؟])\s+/)
          .map((line) => line.trim())
          .filter(Boolean);

  if (segments.length === 0) {
    return [];
  }

  let expectedSpeaker: VoiceConversationSpeaker = "PATIENT";

  const turns = segments
    .map((segment) => {
      const clean = stripTurnPrefix(segment);
      if (!clean) {
        return null;
      }

      const inferred = inferSpeakerFromSegment(segment, expectedSpeaker);
      expectedSpeaker =
        inferred.speaker === "PATIENT"
          ? "CALL_CENTER"
          : inferred.speaker === "CALL_CENTER"
            ? "PATIENT"
            : expectedSpeaker === "PATIENT"
              ? "CALL_CENTER"
              : "PATIENT";

      return {
        speaker: inferred.speaker,
        text: clean,
        confidence: inferred.confidence
      } as VoiceConversationTurn;
    })
    .filter((item): item is VoiceConversationTurn => item !== null)
    .slice(0, 30);

  if (turns.length === 0) {
    return [{ speaker: "PATIENT", text: normalized, confidence: 0.4 }];
  }

  const merged = mergeAdjacentTurns(turns).slice(0, 24);
  return merged.length > 0 ? merged : turns.slice(0, 24);
};

const refineConversationTurns = (turns: VoiceConversationTurn[], transcription: string): {
  turns: VoiceConversationTurn[];
  usedHeuristicFallback: boolean;
} => {
  const sanitized = mergeAdjacentTurns(
    turns
      .map((turn) => ({
        speaker: turn.speaker,
        text: compactSpaces(turn.text),
        confidence: Number(Math.max(0, Math.min(1, turn.confidence)).toFixed(2))
      }))
      .filter((turn) => turn.text.length > 0)
  ).slice(0, 24);

  if (sanitized.length === 0) {
    return {
      turns: buildHeuristicConversationTurns(transcription),
      usedHeuristicFallback: true
    };
  }

  const patientTurns = sanitized.filter((turn) => turn.speaker === "PATIENT").length;
  const callCenterTurns = sanitized.filter((turn) => turn.speaker === "CALL_CENTER").length;
  const lowConfidenceTurns = sanitized.filter((turn) => turn.confidence < 0.42).length;

  if (
    (patientTurns === 0 || callCenterTurns === 0) &&
    sanitized.length >= 3
  ) {
    return {
      turns: buildHeuristicConversationTurns(transcription),
      usedHeuristicFallback: true
    };
  }

  if (lowConfidenceTurns >= Math.ceil(sanitized.length * 0.75)) {
    return {
      turns: buildHeuristicConversationTurns(transcription),
      usedHeuristicFallback: true
    };
  }

  return {
    turns: sanitized,
    usedHeuristicFallback: false
  };
};

const extractJsonObject = (content: string): string => {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return content.trim();
  }

  return content.slice(firstBrace, lastBrace + 1).trim();
};

const inferConversationTurns = async (params: {
  transcription: string;
  languageHint?: "ar" | "en";
}): Promise<VoiceConversationInference> => {
  if (!transcriptionClient) {
    return {
      turns: buildHeuristicConversationTurns(params.transcription),
      callSummary: params.transcription,
      inferenceMethod: "heuristic"
    };
  }

  try {
    const completion = await transcriptionClient.chat.completions.create({
      model: env.openaiVoiceAnalysisModel || env.openaiModel || "gpt-4.1-mini",
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an emergency-call diarization engine. Separate transcript turns into PATIENT and CALL_CENTER only. Never use any other speaker labels. Do not alternate blindly; infer who is speaking based on medical narrative vs clarifying questions. Keep each turn short and faithful. Return strict JSON only with keys: turns, callSummary. turns must be an array of {speaker,text,confidence}. confidence is 0..1."
        },
        {
          role: "user",
          content:
            `Language hint: ${params.languageHint ?? "auto"}\n` +
            "Analyze this transcript and separate speakers accurately. PATIENT usually describes symptoms/history/location; CALL_CENTER usually asks questions, confirms info, or gives instructions:\n" +
            params.transcription
        }
      ]
    });

    const rawContent = completion.choices?.[0]?.message?.content;
    if (typeof rawContent !== "string" || !rawContent.trim()) {
      throw new Error("Empty diarization response");
    }

    const parsed = JSON.parse(extractJsonObject(rawContent)) as {
      turns?: unknown;
      callSummary?: unknown;
    };

    const turns = sanitizeConversationTurns(parsed.turns);
    if (turns.length === 0) {
      throw new Error("No valid diarization turns");
    }
    const refined = refineConversationTurns(turns, params.transcription);

    const callSummary =
      typeof parsed.callSummary === "string" && parsed.callSummary.trim()
        ? parsed.callSummary.trim()
        : refined.turns.map((turn) => `${turn.speaker}: ${turn.text}`).join(" | ");

    return {
      turns: refined.turns,
      callSummary,
      inferenceMethod: refined.usedHeuristicFallback ? "heuristic" : "ai"
    };
  } catch (error) {
    console.error("Conversation diarization fallback:", error);
    return {
      turns: buildHeuristicConversationTurns(params.transcription),
      callSummary: params.transcription,
      inferenceMethod: "heuristic"
    };
  }
};

const inferPatientCount = (text: string): number => {
  const directCount = text.match(
    /(\d+)\s*(?:patients?|people|persons|victims|injured|casualties|مرضى|مصابين|أشخاص|اشخاص|ضحايا)/i
  );
  if (directCount) {
    const parsed = Number(directCount[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.min(20, parsed));
    }
  }

  if (/(multiple|many|several|حادث جماعي|عدة مصابين|كثير مصابين|عدد كبير)/i.test(text)) {
    return 4;
  }

  if (/(two patients|2 patients|patient and child|مريضين|شخصين|اثنين مصابين)/i.test(text)) {
    return 2;
  }

  return 1;
};

const inferEmergencyTypeFromText = (text: string): string => {
  if (/(not breathing|no breathing|لا يتنفس|اختناق)/i.test(text)) return "Breathing Emergency";
  if (/(severe bleeding|نزيف شديد|hemorrhage)/i.test(text)) return "Severe Bleeding";
  if (/(chest pain|ألم صدر|جلطة|heart attack|stroke|سكتة)/i.test(text)) return "Cardiac/Stroke Emergency";
  if (/(accident|collision|crash|حادث|اصطدام)/i.test(text)) return "Road Traffic Accident";
  return "Medical Emergency";
};

const inferDispatchRecommendation = (params: {
  analysisInput: string;
  isEmergency: boolean;
  intent: string;
  confidence: number;
  keywords: string[];
}): DispatchRecommendation => {
  const text = `${params.analysisInput} ${params.keywords.join(" ")}`.trim();
  const patientCount = inferPatientCount(text);
  const emergencyType = inferEmergencyTypeFromText(text);

  let priority: DispatchPriority = "MEDIUM";
  if (params.isEmergency && /(not breathing|لا يتنفس|cardiac|stroke|جلطة|سكتة|unconscious|فاقد الوعي)/i.test(text)) {
    priority = "CRITICAL";
  } else if (params.isEmergency || params.intent === "emergency" || params.confidence >= 0.85) {
    priority = "HIGH";
  } else if (params.confidence < 0.55) {
    priority = "LOW";
  }

  let requiredVolunteers = 1;
  if (priority === "CRITICAL") {
    requiredVolunteers = 2;
  } else if (priority === "HIGH") {
    requiredVolunteers = 1;
  }

  if (patientCount >= 2) {
    requiredVolunteers = Math.max(requiredVolunteers, Math.min(6, Math.ceil(patientCount / 2) + 1));
  }

  const rationale =
    `Detected ${patientCount} patient(s). Priority ${priority}. ` +
    `Recommended volunteers: ${requiredVolunteers} based on severity and possible multi-patient load.`;

  return {
    patientCount,
    requiredVolunteers,
    priority,
    emergencyType,
    rationale
  };
};

const estimateEtaMinutesFromDistance = (distanceKm?: number | null): number | undefined => {
  if (distanceKm === undefined || distanceKm === null || Number.isNaN(distanceKm)) {
    return undefined;
  }

  const minutes = Math.ceil((distanceKm / 35) * 60);
  return Math.max(1, Math.min(60, minutes));
};

const toPercentage = (value: number): number => Number(clampRange(value, 0, 1).toFixed(2));

const toAbsoluteConfidencePercent = (value: number): number =>
  Math.round(clampRange(value, 0, 1) * 100);

const confidenceBandFromPercent = (confidencePercent: number): DecisionMode => {
  if (confidencePercent > 85) {
    return "AUTO";
  }
  if (confidencePercent >= 60) {
    return "OPERATOR_REVIEW";
  }
  return "OPERATOR_CONFIRMATION_REQUIRED";
};

const toDispatchPriorityFromDecision = (level: EmergencyLevel, score: number): DispatchPriority => {
  if (level === "HIGH") {
    return score >= 80 ? "CRITICAL" : "HIGH";
  }
  if (level === "MEDIUM") {
    return "MEDIUM";
  }
  return "LOW";
};

const toEmergencyLevelFromScore = (score: number): EmergencyLevel => {
  if (score >= 60) {
    return "HIGH";
  }
  if (score >= 30) {
    return "MEDIUM";
  }
  return "LOW";
};

const hasPanicSignals = (text: string): boolean =>
  /\b(help|hurry|quick|please now|he is dying|panic|screaming|crying|urgent)\b|(?:الحق|ساعدوني|سريع|بسرعة|كارثة|بيموت|صرخ|بكاء|خوف شديد|هلع)/i.test(
    text
  );

const estimateSpeechSpeedWpm = (text: string, durationMs?: number): number | null => {
  if (!durationMs || durationMs <= 0) {
    return null;
  }

  const words = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;

  if (words === 0) {
    return null;
  }

  return Math.round((words / durationMs) * 60_000);
};

const speechSpeedCategory = (wpm: number | null): AudioIntelligenceSnapshot["speechSpeedCategory"] => {
  if (wpm === null) {
    return "unknown";
  }
  if (wpm >= 150) {
    return "fast";
  }
  if (wpm <= 90) {
    return "slow";
  }
  return "normal";
};

const countTurnsBySpeaker = (turns: VoiceConversationTurn[]): { patient: number; callCenter: number } =>
  turns.reduce(
    (acc, turn) => {
      if (turn.speaker === "PATIENT") {
        acc.patient += 1;
      } else if (turn.speaker === "CALL_CENTER") {
        acc.callCenter += 1;
      }
      return acc;
    },
    { patient: 0, callCenter: 0 }
  );

const buildDecisionEngineResult = (params: {
  transcription: string;
  patientTranscript: string;
  callCenterTranscript: string;
  conversationTurns: VoiceConversationTurn[];
  conversationMethod: "ai" | "heuristic";
  assistantIntent: string;
  assistantConfidence: number;
  assistantKeywords: string[];
  criticalFacts: CriticalCaseFacts;
  dispatchRecommendation: DispatchRecommendation;
  previousCase?: EmergencyCaseRow | null;
  durationMs?: number;
}): DecisionEngineResult => {
  const patientText = normalizeText(params.patientTranscript || params.transcription);
  const callCenterText = normalizeText(params.callCenterTranscript || "");
  const currentText = normalizeText(`${patientText} ${callCenterText}`.trim());
  const previousText = normalizeText(
    `${params.previousCase?.transcription_text ?? ""} ${params.previousCase?.voice_description ?? ""}`.trim()
  );
  const combinedText = normalizeText(`${previousText} ${currentText}`.trim());

  const scoreSignals: DecisionScoreSignal[] = [];
  const pushSignal = (code: string, score: number, evidence: string): void => {
    scoreSignals.push({
      code,
      score,
      evidence: clampSummary(evidence, 140)
    });
  };

  if (params.criticalFacts.breathingStatus === "not_breathing") {
    pushSignal("NO_BREATHING", 40, "Breathing was identified as not_breathing.");
  } else if (params.criticalFacts.breathingStatus === "distressed") {
    pushSignal("BREATHING_DISTRESS", 20, "Respiratory distress indicators were detected.");
  }

  if (params.criticalFacts.consciousnessStatus === "unconscious") {
    pushSignal("UNCONSCIOUS", 30, "Caller narrative indicates unconscious / unresponsive patient.");
  } else if (params.criticalFacts.consciousnessStatus === "reduced") {
    pushSignal("REDUCED_CONSCIOUSNESS", 15, "Reduced consciousness indicators were detected.");
  }

  if (params.criticalFacts.bleedingStatus === "severe") {
    pushSignal("SEVERE_BLEEDING", 20, "Severe bleeding signs were detected.");
  } else if (params.criticalFacts.bleedingStatus === "minor") {
    pushSignal("BLEEDING", 8, "Bleeding mention detected.");
  }

  if (params.criticalFacts.hasChestPain) {
    pushSignal("CHEST_PAIN", 15, "Potential cardiac symptom (chest pain) detected.");
  }
  if (params.criticalFacts.hasSeizure) {
    pushSignal("SEIZURE", 15, "Seizure indicators detected.");
  }
  if (params.criticalFacts.hasTrauma) {
    pushSignal("TRAUMA", 10, "Trauma/accident indicators detected.");
  }
  if (params.assistantIntent === "emergency") {
    pushSignal("AI_INTENT_EMERGENCY", 8, "AI intent classifier marked this segment as emergency.");
  }
  if (params.dispatchRecommendation.patientCount >= 2) {
    pushSignal("MULTI_PATIENT", 10, `Multiple possible patients detected (${params.dispatchRecommendation.patientCount}).`);
  }

  const panicDetected = hasPanicSignals(currentText);
  if (panicDetected) {
    pushSignal("PANIC_VOICE", 10, "High-stress / panic language was detected.");
  }

  const speechSpeedWpm = estimateSpeechSpeedWpm(patientText || currentText, params.durationMs);
  const speechCategory = speechSpeedCategory(speechSpeedWpm);
  if (speechCategory === "fast") {
    pushSignal("FAST_SPEECH", 10, `Fast speech detected (${speechSpeedWpm} WPM).`);
  }

  const turns = params.conversationTurns;
  const lowConfidenceTurns = turns.filter((turn) => turn.confidence < 0.42).length;
  const averageSpeakerConfidence =
    turns.length > 0
      ? Number(
          (
            turns.reduce((sum, turn) => sum + clampRange(turn.confidence, 0, 1), 0) /
            Math.max(1, turns.length)
          ).toFixed(2)
        )
      : 0.45;
  const uncertaintyRatio = turns.length > 0 ? Number((lowConfidenceTurns / turns.length).toFixed(2)) : 0.6;

  const turnCountBySpeaker = countTurnsBySpeaker(turns);
  const temporalEscalationDetected =
    /(stopped breathing|not breathing now|he stopped breathing|لا يتنفس الآن|بطل يتنفس|انقطع النفس)/i.test(currentText) &&
    !/(not breathing|لا يتنفس|انقطاع تنفس)/i.test(previousText);

  if (temporalEscalationDetected) {
    pushSignal("TEMPORAL_ESCALATION", 25, "Call context escalated to breathing loss during later segment.");
  }

  const previousCaseWasSevere =
    params.previousCase?.priority === "HIGH" ||
    params.previousCase?.priority === "CRITICAL" ||
    /(not breathing|unconscious|severe bleeding|لا يتنفس|فاقد الوعي|نزيف شديد)/i.test(previousText);
  if (previousCaseWasSevere) {
    pushSignal("HISTORICAL_SEVERITY", 15, "Previous segments already contained high-risk signs.");
  }

  const rawScore = scoreSignals.reduce((sum, signal) => sum + signal.score, 0);
  let score = Math.min(100, rawScore);
  let emergencyLevel = toEmergencyLevelFromScore(score);

  const hardCriticalSignalDetected =
    params.criticalFacts.breathingStatus === "not_breathing" ||
    params.criticalFacts.consciousnessStatus === "unconscious" ||
    params.criticalFacts.bleedingStatus === "severe" ||
    temporalEscalationDetected;

  if (hardCriticalSignalDetected && emergencyLevel !== "HIGH") {
    emergencyLevel = "HIGH";
    score = Math.max(score, 60);
  }

  if (previousCaseWasSevere && emergencyLevel === "LOW") {
    emergencyLevel = "MEDIUM";
    score = Math.max(score, 35);
  }

  const assistantConfidencePercent = toAbsoluteConfidencePercent(params.assistantConfidence);
  const ruleConfidencePercent = Math.min(95, Math.max(45, Math.round(score * 0.9 + (hardCriticalSignalDetected ? 10 : 0))));
  let confidencePercent = Math.max(assistantConfidencePercent, ruleConfidencePercent);
  if (params.conversationMethod === "heuristic") {
    confidencePercent -= 8;
  }
  if (uncertaintyRatio > 0.45) {
    confidencePercent -= 6;
  }
  confidencePercent = Math.max(35, Math.min(98, confidencePercent));
  const confidenceBand = confidenceBandFromPercent(confidencePercent);

  let recommendedAction: DecisionAction;
  if (emergencyLevel === "HIGH") {
    recommendedAction = "DISPATCH";
  } else if (emergencyLevel === "MEDIUM") {
    recommendedAction = confidencePercent >= 60 ? "DISPATCH" : "ASK_FOR_MORE_INFO";
  } else {
    recommendedAction = confidencePercent >= 60 ? "MONITOR" : "ASK_FOR_MORE_INFO";
  }

  if (hardCriticalSignalDetected && recommendedAction !== "DISPATCH") {
    recommendedAction = "DISPATCH";
  }

  const operatorAlert =
    confidenceBand === "AUTO"
      ? "Decision confidence is high (>85%). Auto-action is allowed."
      : confidenceBand === "OPERATOR_REVIEW"
        ? "Decision confidence is moderate (60-85%). Operator review is required before final confirmation."
        : "Decision confidence is low (<60%). Operator confirmation is required immediately.";

  const escalationReason =
    temporalEscalationDetected
      ? "Call severity escalated during later segment (temporal escalation)."
      : hardCriticalSignalDetected
        ? "Critical life-threatening signal detected."
        : undefined;

  const keywords = Array.from(
    new Set([
      ...params.assistantKeywords.map((keyword) => keyword.trim()).filter(Boolean),
      ...collectRapidKeywords(combinedText)
    ])
  ).slice(0, 12);

  return {
    emergencyLevel,
    recommendedAction,
    confidence: toPercentage(confidencePercent / 100),
    confidenceBand,
    score,
    scoreSignals,
    operatorAlert,
    escalationReason,
    audioIntelligence: {
      panicDetected,
      speechSpeedWpm,
      speechSpeedCategory: speechCategory,
      speakerSeparation: {
        method: params.conversationMethod,
        averageConfidence: averageSpeakerConfidence,
        lowConfidenceTurns,
        uncertaintyRatio
      },
      keywords,
      temporalEscalationDetected:
        temporalEscalationDetected || turnCountBySpeaker.patient === 0 || turnCountBySpeaker.callCenter === 0
    }
  };
};

const applyDecisionToDispatchRecommendation = (params: {
  baseline: DispatchRecommendation;
  decision: DecisionEngineResult;
  caseUpdateSuggestion: CaseUpdateSuggestion;
  criticalFacts: CriticalCaseFacts;
}): DispatchRecommendation => {
  const priority = toDispatchPriorityFromDecision(params.decision.emergencyLevel, params.decision.score);
  const patientCount = Math.max(
    1,
    Math.min(20, Math.round(Math.max(params.baseline.patientCount, params.caseUpdateSuggestion.patientCount)))
  );
  const targetVolunteers =
    params.decision.recommendedAction === "DISPATCH"
      ? 5
      : Math.max(1, Math.min(6, Math.round(params.baseline.requiredVolunteers)));
  const emergencyType = params.caseUpdateSuggestion.emergencyType || params.baseline.emergencyType;
  const rationaleParts = [
    `Decision score ${params.decision.score}/100`,
    `Emergency level ${params.decision.emergencyLevel}`,
    `Action ${params.decision.recommendedAction}`,
    `Confidence ${Math.round(params.decision.confidence * 100)}%`,
    params.decision.escalationReason ?? "",
    params.criticalFacts.summary
  ]
    .filter(Boolean)
    .map((item) => normalizeText(String(item)));

  return {
    patientCount,
    requiredVolunteers: targetVolunteers,
    priority,
    emergencyType,
    rationale: clampSummary(rationaleParts.join(" | "), 420)
  };
};

const toCasePayloadForRealtime = (row: EmergencyCaseRow) => ({
  id: row.id,
  caseNumber: row.case_number,
  reportingUserId: row.reporting_user_id,
  emergencyType: row.emergency_type,
  priority: row.priority,
  status: row.status,
  voiceDescription: row.voice_description,
  transcriptionText: row.transcription_text,
  aiAnalysis: row.ai_analysis,
  possibleCondition: row.possible_condition,
  riskLevel: row.risk_level,
  address: row.address_text,
  location: {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude)
  },
  etaMinutes: row.eta_minutes,
  ambulanceEtaMinutes: row.ambulance_eta_minutes,
  volunteerEtaMinutes: row.volunteer_eta_minutes,
  startedAt: row.started_at,
  closedAt: row.closed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toVolunteerAssignmentPayload = (assignment: VolunteerAssignmentRow) => ({
  id: assignment.id,
  caseId: assignment.case_id,
  volunteerId: assignment.volunteer_id,
  status: assignment.status,
  distanceKm: assignment.distance_km ? Number(assignment.distance_km) : null,
  etaMinutes: assignment.eta_minutes,
  assignedBy: assignment.assigned_by,
  assignedAt: assignment.assigned_at,
  respondedAt: assignment.responded_at,
  arrivedAt: assignment.arrived_at
});

const scoreVolunteerSkillMatch = (specialty: string, text: string): number => {
  const normalizedSpecialty = specialty.toLowerCase();
  const normalizedText = text.toLowerCase();

  const rules: Array<{ pattern: RegExp; matches: string[]; score: number }> = [
    { pattern: /(cardiac|heart|chest pain|stroke|جلطة|قلب|صدر)/i, matches: ["cardiac", "heart", "aed"], score: 18 },
    {
      pattern: /(bleeding|hemorrhage|trauma|accident|نزيف|حادث|إصابة)/i,
      matches: ["trauma", "bleeding", "emergency", "first aid"],
      score: 14
    },
    { pattern: /(breathing|respiratory|اختناق|تنفس)/i, matches: ["respiratory", "oxygen", "emergency"], score: 14 },
    { pattern: /(seizure|convulsion|تشنج)/i, matches: ["neurology", "advanced", "emergency"], score: 10 }
  ];

  let total = 0;
  for (const rule of rules) {
    if (rule.pattern.test(normalizedText) && rule.matches.some((token) => normalizedSpecialty.includes(token))) {
      total += rule.score;
    }
  }

  return Math.min(30, total);
};

const selectVolunteersForSmartDispatch = (params: {
  volunteers: VolunteerNearbyRow[];
  emergencyType: string;
  keywordContext: string;
  limit: number;
}): VolunteerNearbyRow[] => {
  const ranked = [...params.volunteers]
    .map((volunteer) => {
      const distanceKmRaw = Number(volunteer.distance_km);
      const distanceKm = Number.isFinite(distanceKmRaw) ? distanceKmRaw : 999;
      const etaMinutes = estimateEtaMinutesFromDistance(distanceKm) ?? 60;
      const skillScore = scoreVolunteerSkillMatch(volunteer.specialty, `${params.emergencyType} ${params.keywordContext}`);
      const availabilityScore = volunteer.availability === "AVAILABLE" ? 20 : 0;
      const distanceScore = Math.max(0, 25 - distanceKm);
      const etaScore = Math.max(0, 20 - etaMinutes);
      const totalScore = skillScore + availabilityScore + distanceScore + etaScore;

      return {
        volunteer,
        totalScore
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, params.limit);

  return ranked.map((item) => item.volunteer);
};

const autoDispatchToNearestVolunteers = async (params: {
  emergencyId: string;
  actorUserId: string;
  caseRow: EmergencyCaseRow;
  decision: DecisionEngineResult;
  dispatchRecommendation: DispatchRecommendation;
  caseUpdateSuggestion: CaseUpdateSuggestion;
  summaryLanguage: "ar" | "en";
  volunteerSummary: string;
  keywordContext: string;
}): Promise<AutoDispatchExecutionResult> => {
  if (params.decision.recommendedAction !== "DISPATCH") {
    return {
      actionTaken: false,
      requestedTarget: 5,
      activeAssignments: 0,
      createdAssignments: 0,
      skippedReason: "Decision engine action is not DISPATCH.",
      assignedVolunteers: [],
      caseAfterDispatch: params.caseRow
    };
  }

  const latitude = Number(params.caseRow.latitude);
  const longitude = Number(params.caseRow.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      actionTaken: false,
      requestedTarget: 5,
      activeAssignments: 0,
      createdAssignments: 0,
      skippedReason: "Case location is missing; cannot run smart volunteer dispatch.",
      assignedVolunteers: [],
      caseAfterDispatch: params.caseRow
    };
  }

  const existingAssignments = await emergencyRepository.listVolunteerAssignmentsByCase(params.emergencyId);
  const activeAssignments = existingAssignments.filter((assignment) =>
    ["PENDING", "ACCEPTED", "ARRIVED"].includes(assignment.status)
  );
  const existingVolunteerIds = new Set(existingAssignments.map((assignment) => assignment.volunteer_id));
  const targetCount = 5;
  const neededAssignments = Math.max(0, targetCount - activeAssignments.length);

  if (neededAssignments === 0) {
    return {
      actionTaken: false,
      requestedTarget: targetCount,
      activeAssignments: activeAssignments.length,
      createdAssignments: 0,
      skippedReason: "Already has enough active volunteer assignments.",
      assignedVolunteers: [],
      caseAfterDispatch: params.caseRow
    };
  }

  const nearbyCandidates = await emergencyRepository.listNearbyVolunteers({
    latitude,
    longitude,
    radiusKm: 35,
    limit: 50
  });
  const availableCandidates = nearbyCandidates.filter((candidate) => !existingVolunteerIds.has(candidate.volunteer_id));

  if (availableCandidates.length === 0) {
    return {
      actionTaken: false,
      requestedTarget: targetCount,
      activeAssignments: activeAssignments.length,
      createdAssignments: 0,
      skippedReason: "No new available volunteers near this case.",
      assignedVolunteers: [],
      caseAfterDispatch: params.caseRow
    };
  }

  const selectedVolunteers = selectVolunteersForSmartDispatch({
    volunteers: availableCandidates,
    emergencyType: params.caseUpdateSuggestion.emergencyType || params.dispatchRecommendation.emergencyType,
    keywordContext: params.keywordContext,
    limit: neededAssignments
  });

  const assignedVolunteers: AssignedVolunteerDispatchInfo[] = [];
  for (const volunteer of selectedVolunteers) {
    const distanceKm = Number(volunteer.distance_km);
    const safeDistance = Number.isFinite(distanceKm) ? distanceKm : undefined;
    const etaMinutes = estimateEtaMinutesFromDistance(safeDistance);
    const assignment = await emergencyRepository.assignVolunteer({
      caseId: params.emergencyId,
      volunteerId: volunteer.volunteer_id,
      assignedByUserId: params.actorUserId,
      etaMinutes,
      distanceKm: safeDistance
    });

    assignedVolunteers.push({
      assignment,
      volunteer,
      etaMinutes,
      distanceKm: safeDistance
    });
  }

  let caseAfterDispatch = params.caseRow;
  if (assignedVolunteers.length > 0) {
    const fastestEta = assignedVolunteers
      .map((item) => item.etaMinutes)
      .filter((eta): eta is number => typeof eta === "number")
      .sort((a, b) => a - b)[0];

    const statusUpdatedCase = await emergencyRepository.updateCaseStatus({
      caseId: params.emergencyId,
      status: "VOLUNTEERS_NOTIFIED",
      volunteerEtaMinutes: fastestEta
    });
    if (statusUpdatedCase) {
      caseAfterDispatch = statusUpdatedCase;
    }

    await pushNotificationService.sendEmergencyAlert({
      targets: assignedVolunteers.map((item) => ({
        volunteerId: item.volunteer.volunteer_id,
        userId: item.volunteer.user_id
      })),
      payload: {
        emergencyId: params.emergencyId,
        location: {
          latitude,
          longitude
        },
        type: params.caseUpdateSuggestion.emergencyType || params.dispatchRecommendation.emergencyType,
        severity: params.caseUpdateSuggestion.priority || params.dispatchRecommendation.priority,
        summary: clampSummary(params.volunteerSummary, 220),
        language: params.summaryLanguage
      }
    });
  }

  return {
    actionTaken: assignedVolunteers.length > 0,
    requestedTarget: targetCount,
    activeAssignments: activeAssignments.length,
    createdAssignments: assignedVolunteers.length,
    assignedVolunteers,
    caseAfterDispatch
  };
};

const detectTextLanguage = (text: string): "ar" | "en" => /[\u0600-\u06FF]/.test(text) ? "ar" : "en";

const collectRapidKeywords = (text: string): string[] => {
  const rules: Array<{ keyword: string; pattern: RegExp }> = [
    { keyword: "not_breathing", pattern: /(not breathing|no breathing|لا يتنفس|اختناق)/i },
    { keyword: "breathing_difficulty", pattern: /(breathing trouble|difficulty breathing|shortness of breath|ضيق تنفس)/i },
    { keyword: "chest_pain", pattern: /(chest pain|ألم صدر|جلطة|heart attack)/i },
    { keyword: "unconscious", pattern: /(unconscious|not responsive|فاقد الوعي|لا يستجيب)/i },
    { keyword: "severe_bleeding", pattern: /(severe bleeding|نزيف شديد)/i },
    { keyword: "seizure", pattern: /(seizure|convulsion|تشنج)/i },
    { keyword: "accident", pattern: /(accident|collision|crash|حادث|اصطدام)/i },
    { keyword: "stroke", pattern: /(stroke|سكتة|جلطة دماغية)/i }
  ];

  const found: string[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      found.push(rule.keyword);
    }
  }
  return found.slice(0, 8);
};

const buildVoiceAssistantFallback = (transcription: string): VoiceAssistantResult => {
  const language = detectTextLanguage(transcription);
  const keywords = collectRapidKeywords(transcription);
  const isEmergency = keywords.length > 0;

  const response =
    language === "ar"
      ? isEmergency
        ? "تم رصد مؤشرات طارئة من المكالمة. ابدأ الإرسال الفوري لفرق الاستجابة وتحقق من التنفس والوعي والموقع الدقيق."
        : "تم تحليل المقطع. يرجى تأكيد نوع الحالة، عدد المصابين، والموقع بدقة قبل الإرسال."
      : isEmergency
        ? "Emergency indicators were detected from the call. Dispatch responders immediately and confirm breathing, consciousness, and exact location."
        : "Segment analyzed. Please confirm incident type, patient count, and exact location before dispatch.";

  const triagePayload: MedicalTriagePayload = {
    decisionSummary: isEmergency
      ? "Voice fallback path: rapid keyword-style indicators suggested possible urgency; full AI triage not run."
      : "Voice fallback path: segment processed without full AI triage; dispatcher should confirm details.",
    type: isEmergency ? "voice_emergency_indicators" : "voice_segment_review",
    emergency: isEmergency,
    severity: isEmergency ? "high" : "medium",
    response
  };

  return assistantResultFromTriage(triagePayload, transcription);
};

const inferBreathingStatus = (text: string): CriticalCaseFacts["breathingStatus"] => {
  if (/(not breathing|no breathing|لا يتنفس|ما بيتنفس|انقطاع تنفس)/i.test(text)) {
    return "not_breathing";
  }
  if (/(breathing difficulty|shortness of breath|respiratory distress|ضيق تنفس|صعوبة تنفس)/i.test(text)) {
    return "distressed";
  }
  if (/(is breathing|breathing now|يتنفس|يوجد تنفس)/i.test(text)) {
    return "normal";
  }
  return "unknown";
};

const inferConsciousnessStatus = (text: string): CriticalCaseFacts["consciousnessStatus"] => {
  if (/(unconscious|not responsive|فاقد الوعي|لا يستجيب|مغمى عليه)/i.test(text)) {
    return "unconscious";
  }
  if (/(drowsy|confused|altered mental|مشوش|دوخة شديدة|شبه فاقد)/i.test(text)) {
    return "reduced";
  }
  if (/(awake|alert|واعي|منتبه)/i.test(text)) {
    return "alert";
  }
  return "unknown";
};

const inferBleedingStatus = (text: string): CriticalCaseFacts["bleedingStatus"] => {
  if (/(severe bleeding|heavy bleeding|hemorrhage|نزيف شديد|نزيف غزير)/i.test(text)) {
    return "severe";
  }
  if (/(bleeding|جرح ينزف|نزيف)/i.test(text)) {
    return "minor";
  }
  if (/(no bleeding|without bleeding|لا يوجد نزيف)/i.test(text)) {
    return "none";
  }
  return "unknown";
};

const buildCriticalCaseFacts = (params: {
  transcription: string;
  conversationSummary: string;
  patientTranscript?: string;
  callCenterTranscript?: string;
  dispatchRecommendation: DispatchRecommendation;
  caseUpdateSuggestion: CaseUpdateSuggestion;
}): CriticalCaseFacts => {
  const clinicalSource = `${params.patientTranscript || ""}\n${params.transcription}`.trim();
  const operationalSource = `${params.callCenterTranscript || ""}\n${params.conversationSummary}`.trim();
  const combined = `${clinicalSource}\n${operationalSource}`.trim();
  const hasChestPain = /(chest pain|ألم صدر|جلطة|heart attack)/i.test(combined);
  const hasSeizure = /(seizure|convulsion|تشنج)/i.test(combined);
  const hasTrauma = /(accident|collision|crash|fall|حادث|اصطدام|سقوط|إصابة)/i.test(combined);

  return {
    patientCount: params.caseUpdateSuggestion.patientCount,
    requiredVolunteers: params.caseUpdateSuggestion.requiredVolunteers,
    priority: params.caseUpdateSuggestion.priority,
    emergencyType: params.caseUpdateSuggestion.emergencyType,
    possibleCondition: params.caseUpdateSuggestion.possibleCondition,
    riskLevel: params.caseUpdateSuggestion.riskLevel,
    address: params.caseUpdateSuggestion.address,
    breathingStatus: inferBreathingStatus(clinicalSource || combined),
    consciousnessStatus: inferConsciousnessStatus(clinicalSource || combined),
    bleedingStatus: inferBleedingStatus(clinicalSource || combined),
    hasChestPain,
    hasSeizure,
    hasTrauma,
    summary:
      params.caseUpdateSuggestion.summary ||
      params.dispatchRecommendation.rationale ||
      params.patientTranscript ||
      params.conversationSummary ||
      params.transcription
  };
};

const formatCriticalValue = (
  value: string | undefined,
  language: "ar" | "en",
  kind: "breathing" | "consciousness" | "bleeding"
): string => {
  const normalized = String(value || "unknown").toLowerCase();

  if (language === "ar") {
    if (kind === "breathing") {
      if (normalized === "not_breathing") return "لا يتنفس";
      if (normalized === "distressed") return "صعوبة تنفس";
      if (normalized === "normal") return "تنفس طبيعي";
      return "غير واضح";
    }

    if (kind === "consciousness") {
      if (normalized === "unconscious") return "فاقد الوعي";
      if (normalized === "reduced") return "وعي منخفض";
      if (normalized === "alert") return "واعي";
      return "غير واضح";
    }

    if (normalized === "severe") return "نزيف شديد";
    if (normalized === "minor") return "نزيف خفيف";
    if (normalized === "none") return "لا يوجد نزيف";
    return "غير واضح";
  }

  if (kind === "breathing") {
    if (normalized === "not_breathing") return "Not breathing";
    if (normalized === "distressed") return "Breathing difficulty";
    if (normalized === "normal") return "Breathing normal";
    return "Unknown";
  }

  if (kind === "consciousness") {
    if (normalized === "unconscious") return "Unconscious";
    if (normalized === "reduced") return "Reduced consciousness";
    if (normalized === "alert") return "Alert";
    return "Unknown";
  }

  if (normalized === "severe") return "Severe bleeding";
  if (normalized === "minor") return "Minor bleeding";
  if (normalized === "none") return "No bleeding";
  return "Unknown";
};

const buildVolunteerDispatchSummary = (params: {
  language: "ar" | "en";
  caseUpdateSuggestion: CaseUpdateSuggestion;
  dispatchRecommendation: DispatchRecommendation;
  criticalFacts: CriticalCaseFacts;
  patientTranscript: string;
  conversationSummary: string;
  decision: DecisionEngineResult;
}): string => {
  const language = params.language;
  const priority = params.caseUpdateSuggestion.priority || params.dispatchRecommendation.priority || "MEDIUM";
  const emergencyType =
    params.caseUpdateSuggestion.emergencyType || params.dispatchRecommendation.emergencyType || "Medical Emergency";
  const patientCount = params.caseUpdateSuggestion.patientCount || params.dispatchRecommendation.patientCount || 1;
  const requiredVolunteers =
    params.caseUpdateSuggestion.requiredVolunteers || params.dispatchRecommendation.requiredVolunteers || 1;
  const address = params.caseUpdateSuggestion.address || params.criticalFacts.address || (language === "ar" ? "غير محدد" : "Not provided");
  const breathing = formatCriticalValue(params.criticalFacts.breathingStatus, language, "breathing");
  const consciousness = formatCriticalValue(params.criticalFacts.consciousnessStatus, language, "consciousness");
  const bleeding = formatCriticalValue(params.criticalFacts.bleedingStatus, language, "bleeding");
  const patientNarrative = clampSummary(
    normalizeText(params.patientTranscript || params.criticalFacts.summary || params.conversationSummary),
    240
  );

  if (language === "ar") {
    return [
      "تنبيه طارئ جديد للمتطوع",
      `الأولوية: ${priority}`,
      `نوع الحالة: ${emergencyType}`,
      `مستوى الطوارئ: ${params.decision.emergencyLevel}`,
      `الإجراء الموصى به: ${params.decision.recommendedAction}`,
      `عدد المصابين المتوقع: ${patientCount}`,
      `الوصف الأساسي من المريض: ${patientNarrative || "لا يوجد وصف كافٍ بعد."}`,
      `الموقع: ${address}`,
      `حالة المصاب: تنفس (${breathing})، وعي (${consciousness})، نزيف (${bleeding})`,
      `المطلوب حالياً: ${requiredVolunteers} متطوع/متطوعة`
    ].join("\n");
  }

  return [
    "New emergency alert for volunteer",
    `Priority: ${priority}`,
    `Emergency type: ${emergencyType}`,
    `Emergency level: ${params.decision.emergencyLevel}`,
    `Recommended action: ${params.decision.recommendedAction}`,
    `Estimated patients: ${patientCount}`,
    `Patient core narrative: ${patientNarrative || "No clear patient narrative yet."}`,
    `Location: ${address}`,
    `Patient condition: breathing (${breathing}), consciousness (${consciousness}), bleeding (${bleeding})`,
    `Current responder need: ${requiredVolunteers} volunteer(s)`
  ].join("\n");
};

const buildDispatcherDetailedSummary = (params: {
  language: "ar" | "en";
  patientTranscript: string;
  callCenterTranscript: string;
  conversationSummary: string;
  assistantResponse: string;
  dispatchRecommendation: DispatchRecommendation;
  caseUpdateSuggestion: CaseUpdateSuggestion;
  criticalFacts: CriticalCaseFacts;
  speakerMethod: "ai" | "heuristic";
  decision: DecisionEngineResult;
}): string => {
  const breathing = formatCriticalValue(params.criticalFacts.breathingStatus, params.language, "breathing");
  const consciousness = formatCriticalValue(params.criticalFacts.consciousnessStatus, params.language, "consciousness");
  const bleeding = formatCriticalValue(params.criticalFacts.bleedingStatus, params.language, "bleeding");
  const patientNarrative = clampSummary(normalizeText(params.patientTranscript || "N/A"), 700);
  const callCenterNarrative = clampSummary(normalizeText(params.callCenterTranscript || "N/A"), 700);
  const summary = clampSummary(
    normalizeText(params.caseUpdateSuggestion.summary || params.conversationSummary || params.criticalFacts.summary || "N/A"),
    700
  );

  if (params.language === "ar") {
    return clampSummary(
      [
        "ملف تحليل مركز الطوارئ (تفصيلي):",
        `طريقة فصل المتحدثين: ${params.speakerMethod}`,
        `الأولوية: ${params.caseUpdateSuggestion.priority}`,
        `نوع الحالة: ${params.caseUpdateSuggestion.emergencyType}`,
        `مستوى الطوارئ: ${params.decision.emergencyLevel}`,
        `الإجراء المقترح: ${params.decision.recommendedAction}`,
        `درجة الطوارئ: ${params.decision.score}/100`,
        `ثقة القرار: ${Math.round(params.decision.confidence * 100)}% (${params.decision.confidenceBand})`,
        `تنبيه المشغّل: ${params.decision.operatorAlert}`,
        `عدد المصابين: ${params.caseUpdateSuggestion.patientCount}`,
        `المتطوعون المقترحون: ${params.caseUpdateSuggestion.requiredVolunteers}`,
        `العنوان: ${params.caseUpdateSuggestion.address || params.criticalFacts.address || "غير محدد"}`,
        `الحالة الحرجة: تنفس (${breathing})، وعي (${consciousness})، نزيف (${bleeding})`,
        `تحليل الصوت: هلع=${params.decision.audioIntelligence.panicDetected ? "نعم" : "لا"}, سرعة=${params.decision.audioIntelligence.speechSpeedWpm ?? "غير متاح"} كلمة/دقيقة, طريقة الفصل=${params.decision.audioIntelligence.speakerSeparation.method}, جودة الفصل=${Math.round(params.decision.audioIntelligence.speakerSeparation.averageConfidence * 100)}%`,
        `ألم صدر=${params.criticalFacts.hasChestPain ? "نعم" : "لا"}, تشنج=${params.criticalFacts.hasSeizure ? "نعم" : "لا"}, إصابة/حادث=${params.criticalFacts.hasTrauma ? "نعم" : "لا"}`,
        `نص المريض: ${patientNarrative}`,
        `نص مركز الاتصال: ${callCenterNarrative}`,
        `ملخص المكالمة: ${summary}`,
        `توصية المساعد الذكي: ${clampSummary(normalizeText(params.assistantResponse || "N/A"), 500)}`,
        `مبرر الإرسال: ${clampSummary(normalizeText(params.dispatchRecommendation.rationale || "N/A"), 400)}`
      ].join("\n"),
      1800
    );
  }

  return clampSummary(
    [
      "Dispatcher Detailed AI Analysis:",
      `Speaker separation method: ${params.speakerMethod}`,
      `Priority: ${params.caseUpdateSuggestion.priority}`,
      `Emergency type: ${params.caseUpdateSuggestion.emergencyType}`,
      `Emergency level: ${params.decision.emergencyLevel}`,
      `Recommended action: ${params.decision.recommendedAction}`,
      `Decision score: ${params.decision.score}/100`,
      `Decision confidence: ${Math.round(params.decision.confidence * 100)}% (${params.decision.confidenceBand})`,
      `Operator alert: ${params.decision.operatorAlert}`,
      `Estimated patients: ${params.caseUpdateSuggestion.patientCount}`,
      `Recommended volunteers: ${params.caseUpdateSuggestion.requiredVolunteers}`,
      `Address: ${params.caseUpdateSuggestion.address || params.criticalFacts.address || "Not provided"}`,
      `Critical status: breathing (${breathing}), consciousness (${consciousness}), bleeding (${bleeding})`,
      `Audio intelligence: panic=${params.decision.audioIntelligence.panicDetected ? "yes" : "no"}, speed=${params.decision.audioIntelligence.speechSpeedWpm ?? "n/a"} wpm, diarization=${params.decision.audioIntelligence.speakerSeparation.method}, quality=${Math.round(params.decision.audioIntelligence.speakerSeparation.averageConfidence * 100)}%`,
      `Chest pain=${params.criticalFacts.hasChestPain ? "yes" : "no"}, seizure=${params.criticalFacts.hasSeizure ? "yes" : "no"}, trauma/accident=${params.criticalFacts.hasTrauma ? "yes" : "no"}`,
      `Patient transcript: ${patientNarrative}`,
      `Call-center transcript: ${callCenterNarrative}`,
      `Call summary: ${summary}`,
      `AI first-aid guidance: ${clampSummary(normalizeText(params.assistantResponse || "N/A"), 500)}`,
      `Dispatch rationale: ${clampSummary(normalizeText(params.dispatchRecommendation.rationale || "N/A"), 400)}`
    ].join("\n"),
    1800
  );
};

const toDispatchPriority = (value: unknown): DispatchPriority | null => {
  if (value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH" || normalized === "CRITICAL") {
    return normalized;
  }

  return null;
};

const clampRange = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const toFiniteNumber = (value: unknown): number | null => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
};

const toPositiveInt = (value: unknown, min: number, max: number): number | null => {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return null;
  }

  return Math.round(clampRange(numeric, min, max));
};

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

const isPlaceholderAddress = (value: string): boolean =>
  /(not set|unknown|not provided|pending location|n\/a|غير محدد|غير معروف|غير متوفر|غير متاحة)/i.test(value);

const clampSummary = (value: string, maxLength: number = 500): string => {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

const extractCoordinatesFromText = (text: string): { latitude: number; longitude: number } | null => {
  const pairMatch = text.match(/(-?\d{1,2}(?:\.\d+)?)\s*[,،]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!pairMatch) {
    return null;
  }

  const latitude = Number(pairMatch[1]);
  const longitude = Number(pairMatch[2]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6))
  };
};

const KNOWN_LOCATION_HINTS: Array<{
  address: string;
  latitude: number;
  longitude: number;
  pattern: RegExp;
}> = [
  {
    address: "Ramallah",
    latitude: 31.9038,
    longitude: 35.2034,
    pattern: /(رام الله|راملله|\bramallah\b)/i
  },
  {
    address: "Al-Bireh",
    latitude: 31.9108,
    longitude: 35.2166,
    pattern: /(البيرة|البيره|\bal[\s-]?bireh\b|\bbireh\b)/i
  },
  {
    address: "Jerusalem",
    latitude: 31.7683,
    longitude: 35.2137,
    pattern: /(القدس|\bjerusalem\b)/i
  },
  {
    address: "Hebron",
    latitude: 31.5326,
    longitude: 35.0998,
    pattern: /(الخليل|\bhebron\b)/i
  },
  {
    address: "Nablus",
    latitude: 32.2211,
    longitude: 35.2544,
    pattern: /(نابلس|\bnablus\b)/i
  },
  {
    address: "Bethlehem",
    latitude: 31.7054,
    longitude: 35.2024,
    pattern: /(بيت لحم|\bbethlehem\b)/i
  },
  {
    address: "Jenin",
    latitude: 32.4596,
    longitude: 35.2982,
    pattern: /(جنين|\bjenin\b)/i
  }
];

const extractAddressFromText = (
  text: string
): { address: string; latitude?: number; longitude?: number } | null => {
  const fromKnown = KNOWN_LOCATION_HINTS.find((item) => item.pattern.test(text));
  if (fromKnown) {
    return {
      address: fromKnown.address,
      latitude: fromKnown.latitude,
      longitude: fromKnown.longitude
    };
  }

  const locationMatch = text.match(
    /(?:\b(?:location|address|at|in|near)\b|موقعي|الموقع|العنوان|في|عند)\s*[:\-]?\s*([A-Za-z\u0600-\u06FF0-9][A-Za-z\u0600-\u06FF0-9\s\-]{2,80}?)(?=$|[,.!?؟\n])/i
  );

  if (!locationMatch || typeof locationMatch[1] !== "string") {
    return null;
  }

  const address = normalizeText(locationMatch[1]);
  if (address.length < 3) {
    return null;
  }

  if (/^(happened|unknown|emergency|incident|case)$/i.test(address)) {
    return null;
  }

  return { address };
};

const parseCaseContext = (value: unknown): CaseContextInput | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as {
    emergencyType?: unknown;
    priority?: unknown;
    address?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  };

  const emergencyType = typeof raw.emergencyType === "string" ? raw.emergencyType.trim() : "";
  const address = typeof raw.address === "string" ? raw.address.trim() : "";
  const priority = toDispatchPriority(raw.priority);

  const latitude = typeof raw.latitude === "number" && Number.isFinite(raw.latitude) ? raw.latitude : undefined;
  const longitude = typeof raw.longitude === "number" && Number.isFinite(raw.longitude) ? raw.longitude : undefined;

  if (!emergencyType && !address && !priority && latitude === undefined && longitude === undefined) {
    return null;
  }

  return {
    emergencyType: emergencyType || undefined,
    priority: priority ?? undefined,
    address: address && !isPlaceholderAddress(address) ? address : undefined,
    latitude,
    longitude
  };
};

const parseAICaseFieldExtraction = (value: unknown): AICaseFieldExtraction => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const raw = value as {
    emergencyType?: unknown;
    priority?: unknown;
    address?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    locationConfidence?: unknown;
    possibleCondition?: unknown;
    patientCount?: unknown;
    requiredVolunteers?: unknown;
    summary?: unknown;
  };

  const emergencyType =
    typeof raw.emergencyType === "string" && raw.emergencyType.trim().length > 0
      ? normalizeText(raw.emergencyType)
      : undefined;
  const priority = toDispatchPriority(raw.priority) ?? undefined;
  const address =
    typeof raw.address === "string" && raw.address.trim().length > 0 && !isPlaceholderAddress(raw.address)
      ? normalizeText(raw.address)
      : undefined;
  const latitude = toFiniteNumber(raw.latitude);
  const longitude = toFiniteNumber(raw.longitude);
  const locationConfidenceRaw = toFiniteNumber(raw.locationConfidence);
  const locationConfidence =
    locationConfidenceRaw !== null ? Number(clampRange(locationConfidenceRaw, 0, 1).toFixed(2)) : undefined;
  const possibleCondition =
    typeof raw.possibleCondition === "string" && raw.possibleCondition.trim().length > 0
      ? normalizeText(raw.possibleCondition)
      : undefined;
  const patientCount = toPositiveInt(raw.patientCount, 1, 20) ?? undefined;
  const requiredVolunteers = toPositiveInt(raw.requiredVolunteers, 1, 6) ?? undefined;
  const summary =
    typeof raw.summary === "string" && raw.summary.trim().length > 0
      ? normalizeText(raw.summary)
      : undefined;

  const hasCoordinates =
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  return {
    emergencyType,
    priority,
    address,
    latitude: hasCoordinates && latitude !== null ? Number(latitude.toFixed(6)) : undefined,
    longitude: hasCoordinates && longitude !== null ? Number(longitude.toFixed(6)) : undefined,
    locationConfidence,
    possibleCondition,
    patientCount,
    requiredVolunteers,
    summary
  };
};

const inferCaseFieldsWithAI = async (params: {
  transcription: string;
  callSummary: string;
  dispatchRecommendation: DispatchRecommendation;
  caseContext?: CaseContextInput | null;
}): Promise<AICaseFieldExtraction | null> => {
  if (!transcriptionClient) {
    return null;
  }

  try {
    const completion = await transcriptionClient.chat.completions.create({
      model: env.openaiVoiceAnalysisModel || env.openaiModel || "gpt-4.1-mini",
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract emergency case fields from call transcript. Return strict JSON only with keys: emergencyType, priority, address, latitude, longitude, locationConfidence, possibleCondition, patientCount, requiredVolunteers, summary. Use priority only from LOW/MEDIUM/HIGH/CRITICAL. locationConfidence is 0..1. Do not invent address/coordinates. If unknown, keep them null or omit."
        },
        {
          role: "user",
          content:
            `Current case context: ${JSON.stringify(params.caseContext ?? {})}\n` +
            `Current dispatch baseline: ${JSON.stringify(params.dispatchRecommendation)}\n` +
            "Transcript:\n" +
            params.transcription +
            "\nCall summary:\n" +
            params.callSummary
        }
      ]
    });

    const rawContent = completion.choices?.[0]?.message?.content;
    if (typeof rawContent !== "string" || !rawContent.trim()) {
      return null;
    }

    const parsed = JSON.parse(extractJsonObject(rawContent)) as unknown;
    return parseAICaseFieldExtraction(parsed);
  } catch (error) {
    console.error("Case field extraction fallback:", error);
    return null;
  }
};

const inferCaseUpdateSuggestion = async (params: {
  transcription: string;
  callSummary: string;
  dispatchRecommendation: DispatchRecommendation;
  keywords: string[];
  caseContext?: CaseContextInput | null;
  aiExtraction?: AICaseFieldExtraction | null;
}): Promise<CaseUpdateSuggestion> => {
  const combinedText = `${params.transcription}\n${params.callSummary}`.trim();
  const coordinatesFromText = extractCoordinatesFromText(combinedText);
  const addressFromText = extractAddressFromText(combinedText);
  const context = params.caseContext ?? null;
  const hasPrecomputedExtraction = Object.prototype.hasOwnProperty.call(params, "aiExtraction");
  const aiExtraction = hasPrecomputedExtraction
    ? params.aiExtraction ?? null
    : await withStageTimeout(
        "voice.case_fields",
        inferCaseFieldsWithAI({
          transcription: params.transcription,
          callSummary: params.callSummary,
          dispatchRecommendation: params.dispatchRecommendation,
          caseContext: context
        }),
        env.aiVoiceFieldExtractionTimeoutMs
      ).catch((error) => {
        console.warn("Case field extraction timed out/fell back:", error instanceof Error ? error.message : String(error));
        return null;
      });

  const emergencyType = normalizeText(
    aiExtraction?.emergencyType ||
      params.dispatchRecommendation.emergencyType ||
      inferEmergencyTypeFromText(combinedText) ||
      context?.emergencyType ||
      "Medical Emergency"
  );
  const priority = aiExtraction?.priority || params.dispatchRecommendation.priority || context?.priority || "MEDIUM";

  const summarySource = params.callSummary.trim() || params.transcription;
  const summary = clampSummary(aiExtraction?.summary || summarySource, 500);

  const candidateLatitude =
    aiExtraction?.latitude ?? coordinatesFromText?.latitude ?? addressFromText?.latitude;
  const candidateLongitude =
    aiExtraction?.longitude ?? coordinatesFromText?.longitude ?? addressFromText?.longitude;

  const hasValidCoordinates =
    typeof candidateLatitude === "number" &&
    Number.isFinite(candidateLatitude) &&
    typeof candidateLongitude === "number" &&
    Number.isFinite(candidateLongitude);

  const heuristicAddress = addressFromText?.address;
  const aiAddress = aiExtraction?.address;
  const inferredAddressConfidence = aiExtraction?.locationConfidence ?? (heuristicAddress ? 0.72 : 0.45);

  const contextAddress =
    context?.address && !isPlaceholderAddress(context.address) ? context.address : undefined;
  const address =
    (aiAddress && inferredAddressConfidence >= 0.5 ? aiAddress : undefined) ||
    heuristicAddress ||
    contextAddress;

  const patientCount = clampRange(
    aiExtraction?.patientCount ?? params.dispatchRecommendation.patientCount,
    1,
    20
  );
  const requiredVolunteers = clampRange(
    aiExtraction?.requiredVolunteers ?? params.dispatchRecommendation.requiredVolunteers,
    1,
    6
  );

  return {
    emergencyType,
    priority,
    address,
    latitude: hasValidCoordinates ? Number(candidateLatitude.toFixed(6)) : undefined,
    longitude: hasValidCoordinates ? Number(candidateLongitude.toFixed(6)) : undefined,
    locationConfidence: Number(clampRange(inferredAddressConfidence, 0, 1).toFixed(2)),
    possibleCondition: aiExtraction?.possibleCondition || params.keywords[0] || undefined,
    riskLevel: priority,
    patientCount: Math.round(patientCount),
    requiredVolunteers: Math.round(requiredVolunteers),
    summary
  };
};

export const aiAssistantController = {
  /**
   * POST /api/v1/ai/voice
   * Accepts base64 audio payload and returns transcription + emergency analysis.
   * NOTE: Current transcription is a safe placeholder until full STT is wired.
   */
  async voice(req: Request, res: Response): Promise<void> {
    try {
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const audio = (body as { audio?: unknown }).audio;
      const requestedMimeType =
        typeof (body as { mimeType?: unknown }).mimeType === "string"
          ? (body as { mimeType?: string }).mimeType
          : undefined;
      const transcriptHint =
        typeof (body as { transcriptHint?: unknown }).transcriptHint === "string"
          ? (body as { transcriptHint?: string }).transcriptHint?.trim() || ""
          : "";
      const languageHintRaw =
        typeof (body as { languageHint?: unknown }).languageHint === "string"
          ? (body as { languageHint?: string }).languageHint?.trim().toLowerCase()
          : undefined;
      const languageHint = languageHintRaw === "ar" || languageHintRaw === "en" ? languageHintRaw : undefined;
      const durationMsRaw =
        typeof (body as { durationMs?: unknown }).durationMs === "number"
          ? (body as { durationMs?: number }).durationMs
          : undefined;
      const durationMs =
        typeof durationMsRaw === "number" && Number.isFinite(durationMsRaw) && durationMsRaw > 0
          ? Math.round(durationMsRaw)
          : undefined;
      const caseContext = parseCaseContext((body as { caseContext?: unknown }).caseContext);
      const emergencyIdRawValue = (body as { emergencyId?: unknown }).emergencyId;
      const emergencyIdRaw = typeof emergencyIdRawValue === "string" ? emergencyIdRawValue.trim() : "";
      const emergencyId = UUID_PATTERN.test(emergencyIdRaw) ? emergencyIdRaw : undefined;
      const segmentTimestampRawValue = (body as { segmentTimestamp?: unknown }).segmentTimestamp;
      const segmentTimestampRaw = typeof segmentTimestampRawValue === "string" ? segmentTimestampRawValue.trim() : "";
      const segmentTimestamp =
        segmentTimestampRaw && !Number.isNaN(Date.parse(segmentTimestampRaw))
          ? new Date(segmentTimestampRaw).toISOString()
          : new Date().toISOString();

      if (typeof audio !== "string" || audio.trim().length === 0) {
        res.status(400).json({ error: "audio is required and must be a base64 string" });
        return;
      }

      const normalizedAudio = normalizeIncomingAudio(audio, requestedMimeType);
      if (!normalizedAudio.base64) {
        res.status(400).json({ error: "audio must be a non-empty base64 payload" });
        return;
      }

      let audioBuffer: Buffer;
      try {
        audioBuffer = Buffer.from(normalizedAudio.base64, "base64");
      } catch {
        res.status(400).json({ error: "audio must be valid base64" });
        return;
      }

      const byteLength = audioBuffer.byteLength;
      if (byteLength === 0) {
        res.status(400).json({ error: "audio payload is empty" });
        return;
      }

      if (byteLength > MAX_VOICE_BYTES) {
        res.status(413).json({ error: "audio payload is too large. Please keep recording under ~12MB." });
        return;
      }

      const processingStartedAt = Date.now();
      const audioHash = crypto.createHash("sha256").update(audioBuffer).digest("hex");

      let modelTranscription = "";
      let usedTranscriptionModel = false;
      let transcriptionMs = 0;
      const transcriptionStartedAt = Date.now();
      try {
        const transcribed = await transcribeAudio({
          audioBuffer,
          mimeType: normalizedAudio.mimeType,
          languageHint
        });
        modelTranscription = transcribed.text;
        usedTranscriptionModel = transcribed.usedTranscriptionModel;
      } catch (sttError) {
        console.error("Voice transcription failed:", sttError);
      } finally {
        transcriptionMs = Date.now() - transcriptionStartedAt;
      }

      // Prefer model transcription when available; fallback to browser hint only if model is unavailable/empty.
      const transcription = modelTranscription.trim() || transcriptHint.trim();

      if (!transcription) {
        res.status(422).json({
          error: transcriptionClient
            ? "Could not transcribe clear speech. Please speak closer to the microphone and try again."
            : "Voice transcription is unavailable. Add OPENAI_API_KEY or send transcriptHint."
        });
        return;
      }

      let conversationFallbackUsed = false;
      let assistantFallbackUsed = false;
      let caseFieldFallbackUsed = false;

      const conversationStartedAt = Date.now();
      const conversationPromise = withStageTimeout(
        "voice.conversation",
        inferConversationTurns({
          transcription,
          languageHint
        }),
        env.aiVoiceConversationTimeoutMs
      ).catch((error) => {
        conversationFallbackUsed = true;
        console.warn("Conversation inference timed out/fell back:", error instanceof Error ? error.message : String(error));
        return {
          turns: buildHeuristicConversationTurns(transcription),
          callSummary: transcription,
          inferenceMethod: "heuristic" as const
        };
      });

      const assistantStartedAt = Date.now();
      const assistantPromise = withStageTimeout(
        "voice.assistant",
        AIAssistantService.getResponse(transcription, {
          history: [],
          modelOverride: env.openaiVoiceAnalysisModel
        }),
        env.aiVoiceAssistantTimeoutMs
      ).catch((error) => {
        assistantFallbackUsed = true;
        console.warn("Assistant inference timed out/fell back:", error instanceof Error ? error.message : String(error));
        return buildVoiceAssistantFallback(transcription);
      });

      const [conversation, assistantResult] = await Promise.all([conversationPromise, assistantPromise]);
      const conversationMs = Date.now() - conversationStartedAt;
      const assistantMs = Date.now() - assistantStartedAt;

      const patientTranscript = conversation.turns
        .filter((turn) => turn.speaker === "PATIENT")
        .map((turn) => turn.text)
        .join(" ")
        .trim();
      const callCenterTranscript = conversation.turns
        .filter((turn) => turn.speaker === "CALL_CENTER")
        .map((turn) => turn.text)
        .join(" ")
        .trim();

      const linkedCaseBeforeDecision = emergencyId ? await emergencyRepository.findCaseById(emergencyId) : null;

      const analysisInput = patientTranscript || transcription;
      let dispatchRecommendation = inferDispatchRecommendation({
        analysisInput,
        isEmergency: assistantResult.isEmergency,
        intent: assistantResult.analysis.intent,
        confidence: assistantResult.analysis.confidence,
        keywords: assistantResult.analysis.keywords
      });
      const caseFieldStartedAt = Date.now();
      const aiExtraction = await withStageTimeout(
        "voice.case_fields",
        inferCaseFieldsWithAI({
          transcription,
          callSummary: conversation.callSummary,
          dispatchRecommendation,
          caseContext
        }),
        env.aiVoiceFieldExtractionTimeoutMs
      ).catch((error) => {
        caseFieldFallbackUsed = true;
        console.warn("Case field extraction timed out/fell back:", error instanceof Error ? error.message : String(error));
        return null;
      });
      const caseFieldExtractionMs = Date.now() - caseFieldStartedAt;

      let caseUpdateSuggestion = await inferCaseUpdateSuggestion({
        transcription,
        callSummary: conversation.callSummary,
        dispatchRecommendation,
        keywords: assistantResult.analysis.keywords,
        caseContext,
        aiExtraction
      });
      let criticalFacts = buildCriticalCaseFacts({
        transcription,
        conversationSummary: conversation.callSummary,
        patientTranscript,
        callCenterTranscript,
        dispatchRecommendation,
        caseUpdateSuggestion
      });
      const decision = buildDecisionEngineResult({
        transcription,
        patientTranscript,
        callCenterTranscript,
        conversationTurns: conversation.turns,
        conversationMethod: conversation.inferenceMethod,
        assistantIntent: assistantResult.analysis.intent,
        assistantConfidence: assistantResult.analysis.confidence,
        assistantKeywords: assistantResult.analysis.keywords,
        criticalFacts,
        dispatchRecommendation,
        previousCase: linkedCaseBeforeDecision,
        durationMs
      });

      dispatchRecommendation = applyDecisionToDispatchRecommendation({
        baseline: dispatchRecommendation,
        decision,
        caseUpdateSuggestion,
        criticalFacts
      });

      caseUpdateSuggestion = {
        ...caseUpdateSuggestion,
        priority: dispatchRecommendation.priority,
        riskLevel: dispatchRecommendation.priority,
        requiredVolunteers: dispatchRecommendation.requiredVolunteers,
        patientCount: dispatchRecommendation.patientCount,
        emergencyType: dispatchRecommendation.emergencyType
      };

      criticalFacts = {
        ...criticalFacts,
        priority: dispatchRecommendation.priority,
        riskLevel: dispatchRecommendation.priority,
        requiredVolunteers: dispatchRecommendation.requiredVolunteers,
        patientCount: dispatchRecommendation.patientCount,
        emergencyType: dispatchRecommendation.emergencyType
      };
      const summaryLanguage: "ar" | "en" =
        assistantResult.responseLanguage === "ar" || detectTextLanguage(patientTranscript || transcription) === "ar"
          ? "ar"
          : "en";
      const volunteerSummary = buildVolunteerDispatchSummary({
        language: summaryLanguage,
        caseUpdateSuggestion,
        dispatchRecommendation,
        criticalFacts,
        patientTranscript,
        conversationSummary: conversation.callSummary,
        decision
      });
      const dispatcherDetails = buildDispatcherDetailedSummary({
        language: summaryLanguage,
        patientTranscript,
        callCenterTranscript,
        conversationSummary: conversation.callSummary,
        assistantResponse: assistantResult.response,
        dispatchRecommendation,
        caseUpdateSuggestion,
        criticalFacts,
        speakerMethod: conversation.inferenceMethod,
        decision
      });

      let autoDispatchResult: AutoDispatchExecutionResult | null = null;
      let emergencyCaseSnapshot: ReturnType<typeof toCasePayloadForRealtime> | null = null;

      if (emergencyId) {
        const linkedCase = linkedCaseBeforeDecision ?? (await emergencyRepository.findCaseById(emergencyId));
        if (linkedCase) {
          const linkedEmergencyType = caseUpdateSuggestion.emergencyType || linkedCase.emergency_type;
          const linkedPriority = caseUpdateSuggestion.priority || linkedCase.priority;
          const linkedAddress = caseUpdateSuggestion.address || linkedCase.address_text;

          const transcriptionForCase = appendAndTrim(linkedCase.transcription_text, transcription, 3800);
          const summaryForCase = clampSummary(volunteerSummary, 1800);
          const aiAnalysisForCase = appendAndTrim(linkedCase.ai_analysis, dispatcherDetails, 1800);

          const caseAfterDetailsUpdate =
            (await emergencyRepository.updateCaseDetails({
              caseId: emergencyId,
              emergencyType: linkedEmergencyType,
              priority: linkedPriority,
              address: linkedAddress,
              ...(typeof caseUpdateSuggestion.latitude === "number" &&
              typeof caseUpdateSuggestion.longitude === "number"
                ? {
                    latitude: caseUpdateSuggestion.latitude,
                    longitude: caseUpdateSuggestion.longitude
                  }
                : {}),
              voiceDescription: summaryForCase,
              transcriptionText: transcriptionForCase,
              aiAnalysis: aiAnalysisForCase,
              possibleCondition: caseUpdateSuggestion.possibleCondition,
              riskLevel: caseUpdateSuggestion.riskLevel
            })) ?? linkedCase;

          const dispatchActorUserId = req.authUser?.userId ?? linkedCase.reporting_user_id;
          autoDispatchResult = await autoDispatchToNearestVolunteers({
            emergencyId,
            actorUserId: dispatchActorUserId,
            caseRow: caseAfterDetailsUpdate,
            decision,
            dispatchRecommendation,
            caseUpdateSuggestion,
            summaryLanguage,
            volunteerSummary,
            keywordContext: `${assistantResult.analysis.keywords.join(" ")} ${decision.audioIntelligence.keywords.join(" ")}`
          });

          const caseAfterDispatch = autoDispatchResult.caseAfterDispatch ?? caseAfterDetailsUpdate;
          emergencyCaseSnapshot = toCasePayloadForRealtime(caseAfterDispatch);

          const update = await emergencyRepository.createEmergencyUpdate({
            caseId: emergencyId,
            authorUserId: dispatchActorUserId,
            updateType: "VOICE_SEGMENT",
            message: "Voice segment analyzed and decision engine executed",
            payload: {
              emergencyId,
              transcript: transcription,
              audioMeta: {
                bytes: byteLength,
                mimeType: normalizedAudio.mimeType,
                sha256: audioHash
              },
              timestamp: segmentTimestamp,
              analysis: {
                isEmergency: decision.emergencyLevel !== "LOW",
                intent: assistantResult.analysis.intent,
                confidence: decision.confidence,
                emergencyLevel: decision.emergencyLevel,
                recommendedAction: decision.recommendedAction
              },
              speakerSegmentation: {
                method: conversation.inferenceMethod,
                patientTranscript,
                callCenterTranscript
              },
              decision,
              dispatchRecommendation,
              caseUpdateSuggestion,
              criticalFacts,
              volunteerSummary,
              dispatcherDetails,
              autoDispatch: {
                actionTaken: autoDispatchResult.actionTaken,
                requestedTarget: autoDispatchResult.requestedTarget,
                activeAssignments: autoDispatchResult.activeAssignments,
                createdAssignments: autoDispatchResult.createdAssignments,
                skippedReason: autoDispatchResult.skippedReason
              }
            }
          });

          emitEmergencyUpdate(emergencyId, {
            caseId: emergencyId,
            update: {
              id: update.id,
              updateType: update.update_type,
              message: update.message,
              createdAt: update.created_at
            },
            case: emergencyCaseSnapshot,
            decision,
            autoDispatch: {
              actionTaken: autoDispatchResult.actionTaken,
              requestedTarget: autoDispatchResult.requestedTarget,
              activeAssignments: autoDispatchResult.activeAssignments,
              createdAssignments: autoDispatchResult.createdAssignments,
              skippedReason: autoDispatchResult.skippedReason
            },
            source: "ai_voice_segment"
          });

          if (autoDispatchResult.assignedVolunteers.length > 0) {
            for (const assignmentInfo of autoDispatchResult.assignedVolunteers) {
              emitVolunteerAssigned(emergencyId, {
                caseId: emergencyId,
                assignment: toVolunteerAssignmentPayload(assignmentInfo.assignment),
                case: emergencyCaseSnapshot
              });
            }

            emitStatusChanged(emergencyId, {
              caseId: emergencyId,
              status: emergencyCaseSnapshot.status,
              actorUserId: dispatchActorUserId,
              actorRole: req.authUser?.role ?? "DISPATCHER",
              updatedAt: emergencyCaseSnapshot.updatedAt
            });
          }
        }
      }

      res.json({
        success: true,
        data: {
          emergencyId: emergencyId ?? null,
          segmentTimestamp,
          transcription,
          emergencyCase: emergencyCaseSnapshot,
          conversation: {
            turns: conversation.turns,
            patientTranscript: patientTranscript || transcription,
            callCenterTranscript,
            callSummary: conversation.callSummary
          },
          assistantResponse: assistantResult.response,
          analysis: {
            isEmergency: decision.emergencyLevel !== "LOW",
            intent: assistantResult.analysis.intent,
            confidence: decision.confidence,
            responseLanguage: assistantResult.responseLanguage,
            keywords: decision.audioIntelligence.keywords,
            needsFollowUp: assistantResult.needsFollowUp,
            followUpQuestions: assistantResult.followUpQuestions,
            sources: assistantResult.sources,
            emergencyLevel: decision.emergencyLevel,
            recommendedAction: decision.recommendedAction,
            confidenceBand: decision.confidenceBand,
            operatorAlert: decision.operatorAlert
          },
          decision,
          dispatchRecommendation,
          caseUpdateSuggestion,
          criticalFacts,
          volunteerSummary,
          dispatcherDetails,
          autoDispatch: autoDispatchResult
            ? {
                actionTaken: autoDispatchResult.actionTaken,
                requestedTarget: autoDispatchResult.requestedTarget,
                activeAssignments: autoDispatchResult.activeAssignments,
                createdAssignments: autoDispatchResult.createdAssignments,
                skippedReason: autoDispatchResult.skippedReason
              }
            : null,
          processing: {
            usedTranscriptionModel,
            bytes: byteLength,
            durationMs,
            audioSeconds: durationMs ? Number((durationMs / 1000).toFixed(1)) : undefined,
            mimeType: normalizedAudio.mimeType,
            speakerSeparationMethod: conversation.inferenceMethod,
            fallbackUsed: {
              conversation: conversationFallbackUsed,
              assistant: assistantFallbackUsed,
              caseFieldExtraction: caseFieldFallbackUsed
            },
            timingsMs: {
              transcription: transcriptionMs,
              conversation: conversationMs,
              assistant: assistantMs,
              caseFieldExtraction: caseFieldExtractionMs,
              total: Date.now() - processingStartedAt
            }
          }
        }
      });
    } catch (error) {
      console.error("Error in voice:", error);
      res.status(500).json({ error: "Failed to process voice audio" });
    }
  },

  /**
   * POST /api/v1/ai/chat
   * Chat with explicit conversation messages array
   */
  async chat(req: Request, res: Response): Promise<void> {
    let cleanMessages: AssistantChatMessage[] = [];
    try {
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      cleanMessages = sanitizeMessages((body as { messages?: unknown }).messages);

      if (cleanMessages.length === 0) {
        res.status(400).json({
          error: "messages is required and must be a non-empty array of { role, content }"
        });
        return;
      }

      const hasUserMessage = cleanMessages.some((message) => message.role === "user");
      if (!hasUserMessage) {
        res.status(400).json({
          error: "messages must include at least one user message"
        });
        return;
      }

      const assistantResult = await AIAssistantService.getResponseFromMessages(cleanMessages);

      res.json({
        success: true,
        data: buildChatDataCore(assistantResult)
      });
    } catch (error) {
      console.error("Error in chat:", error);
      const fallback = buildControllerChatFallback(cleanMessages);

      res.status(200).json({
        success: true,
        data: {
          ...buildChatDataCore(fallback),
          degraded: true
        }
      });
    }
  },

  /**
   * POST /api/v1/ai/chat
   * Authenticated chat with persistent conversation memory
   */
  async sendMessage(req: Request, res: Response): Promise<void> {
    let userMessage = "";
    try {
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const message = (body as { message?: unknown }).message;
      const userId = req.authUser?.userId;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        res.status(400).json({ error: "Message is required" });
        return;
      }
      userMessage = message.trim();

      const requestedConversationId =
        typeof (body as { conversationId?: unknown }).conversationId === "string" &&
        (body as { conversationId: string }).conversationId.trim().length > 0
          ? (body as { conversationId: string }).conversationId.trim()
          : undefined;

      let conversationId = requestedConversationId;
      if (conversationId) {
        const existing = await ConversationMemoryService.getConversationById(userId, conversationId);
        if (!existing) {
          conversationId = undefined;
        }
      }

      if (!conversationId) {
        const created = await ConversationMemoryService.createConversation(userId, buildConversationTitle(message));
        conversationId = created.id;
      }

      const historyRows = await ConversationMemoryService.getConversationHistory(userId, 30, conversationId);
      const history = historyRows.map((row) => ({
        role: row.role,
        content: row.content
      }));

      const assistantResult = await AIAssistantService.getResponse(userMessage, {
        userId,
        history
      });

      const userMsg = await ConversationMemoryService.saveMessage(userId, "user", userMessage, {
        language: assistantResult.language,
        intent: assistantResult.analysis.intent,
        isEmergency: assistantResult.isEmergency,
        conversationId
      });

      const assistantMsg = await ConversationMemoryService.saveMessage(
        userId,
        "assistant",
        assistantResult.response,
        {
          language: assistantResult.responseLanguage,
          intent: assistantResult.analysis.intent,
          isEmergency: assistantResult.isEmergency,
          conversationId
        }
      );

      await ConversationMemoryService.updateConversation(conversationId, assistantResult.response, 2);

      res.json({
        success: true,
        data: {
          conversationId,
          userMessage: userMsg,
          assistantMessage: assistantMsg,
          type: assistantResult.triage.type,
          emergency: assistantResult.triage.emergency,
          severity: assistantResult.triage.severity,
          decisionSummary: assistantResult.triage.decisionSummary,
          response: assistantResult.response,
          analysis: {
            intent: assistantResult.analysis.intent,
            confidence: assistantResult.analysis.confidence,
            keywords: assistantResult.analysis.keywords,
            entities: assistantResult.analysis.entities,
            isEmergency: assistantResult.isEmergency,
            preprocessed: assistantResult.preprocessed,
            language: assistantResult.language,
            responseLanguage: assistantResult.responseLanguage,
            needsFollowUp: assistantResult.needsFollowUp,
            followUpQuestions: assistantResult.followUpQuestions,
            sources: assistantResult.sources
          }
        }
      });
    } catch (error) {
      console.error("Error in sendMessage:", error);
      if (userMessage.trim().length > 0) {
        const fallback = await AIAssistantService.getResponseFromMessages([{ role: "user", content: userMessage }]);
        res.status(200).json({
          success: true,
          data: {
            conversationId: null,
            userMessage: {
              role: "user",
              content: userMessage
            },
            assistantMessage: {
              role: "assistant",
              content: fallback.response
            },
            type: fallback.triage.type,
            emergency: fallback.triage.emergency,
            severity: fallback.triage.severity,
            decisionSummary: fallback.triage.decisionSummary,
            response: fallback.response,
            analysis: {
              intent: fallback.analysis.intent,
              confidence: fallback.analysis.confidence,
              keywords: fallback.analysis.keywords,
              entities: fallback.analysis.entities,
              isEmergency: fallback.isEmergency,
              preprocessed: fallback.preprocessed,
              language: fallback.language,
              responseLanguage: fallback.responseLanguage,
              needsFollowUp: fallback.needsFollowUp,
              followUpQuestions: fallback.followUpQuestions,
              sources: fallback.sources
            },
            degraded: true,
            memoryUnavailable: true
          }
        });
        return;
      }

      res.status(500).json({ error: "Failed to process message" });
    }
  },

  /**
   * POST /api/v1/ai/chat/public
   * Public chat for demo/mobile clients without auth
   */
  async sendPublicMessage(req: Request, res: Response): Promise<void> {
    let cleanMessages: AssistantChatMessage[] = [];
    try {
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const messages = (body as { messages?: unknown }).messages;
      const message = (body as { message?: unknown }).message;
      const history = (body as { history?: unknown }).history;

      const cleanMessagesFromArray = sanitizeMessages(messages);
      cleanMessages =
        cleanMessagesFromArray.length > 0
          ? cleanMessagesFromArray
          : [
              ...sanitizePublicHistory(history),
              ...(typeof message === "string" && message.trim().length > 0
                ? [{ role: "user" as const, content: message.trim() }]
                : [])
            ].slice(-40);

      if (cleanMessages.length === 0) {
        res.status(400).json({
          error: "messages is required and must be a non-empty array of { role, content }"
        });
        return;
      }

      const assistantResult = await AIAssistantService.getResponseFromMessages(cleanMessages);

      res.json({
        success: true,
        data: buildChatDataCore(assistantResult)
      });
    } catch (error) {
      console.error("Error in sendPublicMessage:", error);
      const fallback = buildControllerChatFallback(cleanMessages);

      res.status(200).json({
        success: true,
        data: {
          ...buildChatDataCore(fallback),
          degraded: true
        }
      });
    }
  },

  /**
   * GET /api/v1/ai/conversations
   */
  async getConversations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const conversations = await ConversationMemoryService.getConversationThreads(userId);

      res.json({
        success: true,
        data: conversations
      });
    } catch (error) {
      console.error("Error in getConversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  },

  /**
   * GET /api/v1/ai/conversations/:conversationId
   */
  async getConversationHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;
      const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : undefined;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!conversationId) {
        res.status(400).json({ error: "Conversation ID is required" });
        return;
      }

      const messages = await ConversationMemoryService.getConversationHistory(userId, 50, conversationId);

      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      console.error("Error in getConversationHistory:", error);
      res.status(500).json({ error: "Failed to fetch conversation history" });
    }
  },

  /**
   * POST /api/v1/ai/conversations
   */
  async createConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const title = (body as { title?: unknown }).title;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!title || typeof title !== "string") {
        res.status(400).json({ error: "Title is required" });
        return;
      }

      const conversation = await ConversationMemoryService.createConversation(userId, title);

      res.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      console.error("Error in createConversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  },

  /**
   * GET /api/v1/ai/stats
   */
  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const stats = await ConversationMemoryService.getUserStats(userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error("Error in getUserStats:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  },

  /**
   * GET /api/v1/ai/search
   */
  async searchMessages(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;
      const { q } = req.query;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!q || typeof q !== "string") {
        res.status(400).json({ error: "Search query is required" });
        return;
      }

      const messages = await ConversationMemoryService.searchMessages(userId, q);

      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      console.error("Error in searchMessages:", error);
      res.status(500).json({ error: "Failed to search messages" });
    }
  }
};

export default aiAssistantController;
