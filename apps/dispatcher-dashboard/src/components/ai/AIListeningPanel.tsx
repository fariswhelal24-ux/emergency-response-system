import { useEffect, useRef, useState } from "react";

import {
  analyzeVoice,
  closeEmergencyCase,
  updateEmergencyCase,
  type EmergencyCaseSnapshot,
  type VoiceAnalysisPayload
} from "../../services/api";
import type { ActiveCase } from "../../types";

type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & { isFinal?: boolean };

type SpeechRecognitionConstructor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResultLike>; resultIndex?: number }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

type LanguageMode = "auto" | "ar" | "en";
type NotificationLanguage = "ar" | "en";
type CasePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type SegmentLogItem = {
  id: number;
  time: string;
  summary: string;
};

type AIListeningPanelProps = {
  onCaseFlowUpdated?: (caseId?: string) => void;
  selectedCase?: ActiveCase;
};

const DEFAULT_CASE_SETUP = {
  emergencyType: "Medical Emergency",
  address: "Ramallah",
  latitude: 31.9038,
  longitude: 35.2034
};

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  const scopedWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return scopedWindow.SpeechRecognition || scopedWindow.webkitSpeechRecognition || null;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to convert audio to base64"));
        return;
      }

      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Unable to read recorded audio"));
    reader.readAsDataURL(blob);
  });

const formatPercent = (value: number | undefined): string => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
};

const resolveRecognitionLang = (mode: LanguageMode): string => {
  if (mode === "ar") return "ar-PS";
  if (mode === "en") return "en-US";
  return "ar-PS";
};

const clampInteger = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
};

const toCasePriority = (value: unknown): CasePriority => {
  if (value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL") {
    return value;
  }

  return "MEDIUM";
};

const formatCriticalStatus = (
  value: string | undefined,
  language: NotificationLanguage,
  kind: "breathing" | "consciousness" | "bleeding"
): string => {
  const normalized = String(value || "unknown").toLowerCase();

  if (language === "ar") {
    if (kind === "breathing") {
      if (normalized === "not_breathing") return "لا يتنفس";
      if (normalized === "distressed") return "ضيق/صعوبة تنفس";
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
    if (normalized === "distressed") return "Breathing distress";
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

const formatAnalysis = (payload: VoiceAnalysisPayload): string => {
  const decision = payload.decision;
  const emergencyLevel = decision?.emergencyLevel ?? payload.analysis.emergencyLevel ?? (payload.analysis.isEmergency ? "HIGH" : "LOW");
  const recommendedAction =
    decision?.recommendedAction ?? payload.analysis.recommendedAction ?? (payload.analysis.isEmergency ? "DISPATCH" : "ASK_FOR_MORE_INFO");
  const confidenceBand = decision?.confidenceBand ?? payload.analysis.confidenceBand;
  const operatorAlert = decision?.operatorAlert ?? payload.analysis.operatorAlert;
  const lines: string[] = [
    `Emergency Level: ${emergencyLevel}`,
    `Recommended Action: ${recommendedAction}`,
    `Intent: ${payload.analysis.intent || "unknown"}`,
    `Confidence: ${formatPercent(payload.analysis.confidence)}`,
    `Language: ${payload.analysis.responseLanguage || "auto"}`
  ];

  if (decision) {
    lines.push(`Decision Score: ${decision.score}/100`);
  }
  if (confidenceBand) {
    lines.push(`Confidence Band: ${confidenceBand}`);
  }
  if (operatorAlert) {
    lines.push(`Operator Alert: ${operatorAlert}`);
  }

  if (payload.analysis.keywords && payload.analysis.keywords.length > 0) {
    lines.push(`Keywords: ${payload.analysis.keywords.join(", ")}`);
  }

  if (payload.analysis.followUpQuestions && payload.analysis.followUpQuestions.length > 0) {
    lines.push("Follow-up questions:");
    payload.analysis.followUpQuestions.slice(0, 3).forEach((question, index) => {
      lines.push(`${index + 1}. ${question}`);
    });
  }

  if (payload.dispatchRecommendation) {
    lines.push(
      `Recommended volunteers: ${payload.dispatchRecommendation.requiredVolunteers} (patients: ${payload.dispatchRecommendation.patientCount})`
    );
    lines.push(`Dispatch priority: ${payload.dispatchRecommendation.priority}`);
  }

  if (payload.autoDispatch) {
    lines.push(
      `Auto-dispatch: created ${payload.autoDispatch.createdAssignments}/${payload.autoDispatch.requestedTarget}, active now ${payload.autoDispatch.activeAssignments}`
    );
    if (payload.autoDispatch.skippedReason) {
      lines.push(`Auto-dispatch note: ${payload.autoDispatch.skippedReason}`);
    }
  }

  if (payload.criticalFacts) {
    lines.push(`Critical patient count: ${payload.criticalFacts.patientCount ?? "N/A"}`);
    lines.push(`Possible condition: ${payload.criticalFacts.possibleCondition ?? "N/A"}`);
    lines.push(`Breathing status: ${payload.criticalFacts.breathingStatus ?? "unknown"}`);
    lines.push(`Consciousness: ${payload.criticalFacts.consciousnessStatus ?? "unknown"}`);
    lines.push(`Bleeding: ${payload.criticalFacts.bleedingStatus ?? "unknown"}`);
  }

  if (payload.processing?.audioSeconds) {
    lines.push(`Audio length: ${payload.processing.audioSeconds.toFixed(1)}s`);
  }

  if (payload.processing?.speakerSeparationMethod) {
    lines.push(`Speaker separation: ${payload.processing.speakerSeparationMethod.toUpperCase()}`);
  }

  if (payload.processing?.timingsMs) {
    lines.push(
      `Pipeline timings (ms): total=${payload.processing.timingsMs.total ?? "N/A"}, stt=${payload.processing.timingsMs.transcription ?? "N/A"}, diarization=${payload.processing.timingsMs.conversation ?? "N/A"}, assistant=${payload.processing.timingsMs.assistant ?? "N/A"}, fields=${payload.processing.timingsMs.caseFieldExtraction ?? "N/A"}`
    );
  }

  return lines.join("\n");
};

const formatConversation = (payload: VoiceAnalysisPayload): string => {
  const turns = payload.conversation?.turns ?? [];
  if (turns.length === 0) {
    return "";
  }

  return turns
    .map((turn, index) => {
      const speaker = turn.speaker === "PATIENT" ? "Patient" : "Call Center";
      const confidenceSuffix =
        typeof turn.confidence === "number" ? ` (${formatPercent(turn.confidence)})` : "";
      return `${index + 1}. ${speaker}${confidenceSuffix}: ${turn.text}`;
    })
    .join("\n");
};

const detectNotificationLanguage = (payload: VoiceAnalysisPayload): NotificationLanguage => {
  const patientSpeech = (payload.conversation?.turns ?? [])
    .filter((turn) => turn.speaker === "PATIENT")
    .map((turn) => turn.text)
    .join(" ");

  if (patientSpeech.trim()) {
    return /[\u0600-\u06FF]/.test(patientSpeech) ? "ar" : "en";
  }

  const responseLanguage = String(payload.analysis.responseLanguage || "").toLowerCase();
  if (responseLanguage.startsWith("ar")) {
    return "ar";
  }

  if (responseLanguage.startsWith("en")) {
    return "en";
  }

  const transcription = `${payload.transcription} ${payload.conversation?.callSummary ?? ""}`;
  const hasArabicText = /[\u0600-\u06FF]/.test(transcription);
  return hasArabicText ? "ar" : "en";
};

const summarizeForVolunteer = (payload: VoiceAnalysisPayload, language: NotificationLanguage): string => {
  if (payload.volunteerSummary?.trim()) {
    return payload.volunteerSummary.trim();
  }

  const recommendation = payload.dispatchRecommendation;
  const facts = payload.criticalFacts;
  const address =
    payload.caseUpdateSuggestion?.address ||
    facts?.address ||
    (language === "ar" ? "غير متوفر" : "N/A");
  const possibleCondition =
    payload.caseUpdateSuggestion?.possibleCondition ||
    facts?.possibleCondition ||
    (language === "ar" ? "غير محدد" : "Not specified");
  const breathing = formatCriticalStatus(facts?.breathingStatus, language, "breathing");
  const consciousness = formatCriticalStatus(facts?.consciousnessStatus, language, "consciousness");
  const bleeding = formatCriticalStatus(facts?.bleedingStatus, language, "bleeding");
  const patientSpeech = (payload.conversation?.turns ?? [])
    .filter((turn) => turn.speaker === "PATIENT")
    .map((turn) => turn.text)
    .join(" ");
  const conciseNarrative = compactText(
    patientSpeech || facts?.summary || payload.caseUpdateSuggestion?.summary || payload.conversation?.callSummary || payload.transcription
  );

  if (language === "ar") {
    return [
      "تنبيه حالة طارئة للمتطوع",
      `الأولوية: ${recommendation?.priority ?? "MEDIUM"}`,
      `نوع الحالة: ${possibleCondition || recommendation?.emergencyType || "حالة طبية طارئة"}`,
      `عدد المصابين المتوقع: ${recommendation?.patientCount ?? 1}`,
      `حالة المصاب: تنفس (${breathing})، وعي (${consciousness})، نزيف (${bleeding})`,
      `الوصف الأساسي: ${conciseNarrative || "لا يوجد وصف كافٍ بعد."}`,
      `الموقع: ${address}`,
      `المطلوب: ${recommendation?.requiredVolunteers ?? 1} متطوع/متطوعة`
    ].join("\n");
  }

  return [
    "Volunteer Emergency Alert",
    `Priority: ${recommendation?.priority ?? "MEDIUM"}`,
    `Emergency Type: ${possibleCondition || recommendation?.emergencyType || "Medical Emergency"}`,
    `Estimated Patients: ${recommendation?.patientCount ?? 1}`,
    `Patient Status: breathing (${breathing}), consciousness (${consciousness}), bleeding (${bleeding})`,
    `Core Narrative: ${conciseNarrative || "No clear narrative yet."}`,
    `Location: ${address}`,
    `Required Responders: ${recommendation?.requiredVolunteers ?? 1}`
  ].join("\n");
};

const renderCaseChip = (activeCase: EmergencyCaseSnapshot | null) => {
  if (!activeCase) {
    return "No active case yet.";
  }

  return `${activeCase.caseNumber} • ${activeCase.status} • ${activeCase.priority}`;
};

const safeTailText = (value: string, maxLength: number): string => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(normalized.length - maxLength);
};

const compactText = (value: string): string => value.replace(/\s+/g, " ").trim();

export const AIListeningPanel = ({ onCaseFlowUpdated, selectedCase }: AIListeningPanelProps) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recorderMimeTypeRef = useRef<string>("audio/webm");
  const recordingStartedAtRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(null);
  const transcriptHintRef = useRef<string>("");
  const transcriptInterimRef = useRef<string>("");
  const transcriptSegmentsRef = useRef<string[]>([]);
  const conversationSegmentsRef = useRef<string[]>([]);
  const analysisSegmentsRef = useRef<string[]>([]);
  const summarySegmentsRef = useRef<string[]>([]);
  const segmentCountRef = useRef(0);
  const caseSessionIdRef = useRef<string>("");

  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isClosingCase, setIsClosingCase] = useState(false);
  const [isSavingCaseInfo, setIsSavingCaseInfo] = useState(false);

  const [transcript, setTranscript] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [conversation, setConversation] = useState("");
  const [guidance, setGuidance] = useState("");
  const [isEmergency, setIsEmergency] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [languageMode, setLanguageMode] = useState<LanguageMode>("auto");
  const [statusText, setStatusText] = useState<"Idle" | "Listening..." | "Analyzing...">("Idle");
  const [conversationFinished, setConversationFinished] = useState(false);

  const [activeCase, setActiveCase] = useState<EmergencyCaseSnapshot | null>(null);
  const [voicePayload, setVoicePayload] = useState<VoiceAnalysisPayload | null>(null);
  const [dispatchPriority, setDispatchPriority] = useState<CasePriority>("MEDIUM");
  const [estimatedPatients, setEstimatedPatients] = useState(1);
  const [requiredVolunteers, setRequiredVolunteers] = useState(1);
  const [editEmergencyType, setEditEmergencyType] = useState<string>(DEFAULT_CASE_SETUP.emergencyType);
  const [editAddress, setEditAddress] = useState<string>(DEFAULT_CASE_SETUP.address);
  const [editPriority, setEditPriority] = useState<CasePriority>("MEDIUM");
  const [segmentCount, setSegmentCount] = useState(0);
  const [segmentLog, setSegmentLog] = useState<SegmentLogItem[]>([]);

  const resetVoiceSessionState = (options?: { keepWorkflowStatus?: boolean }) => {
    setVoicePayload(null);
    setTranscript("");
    setAnalysis("");
    setConversation("");
    setGuidance("");
    setIsEmergency(null);
    setConversationFinished(false);
    setSegmentCount(0);
    setSegmentLog([]);

    transcriptHintRef.current = "";
    transcriptInterimRef.current = "";
    transcriptSegmentsRef.current = [];
    conversationSegmentsRef.current = [];
    analysisSegmentsRef.current = [];
    summarySegmentsRef.current = [];
    segmentCountRef.current = 0;

    if (!options?.keepWorkflowStatus) {
      setWorkflowStatus("");
    }
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedCase) {
      caseSessionIdRef.current = "";
      setActiveCase(null);
      setEditEmergencyType(DEFAULT_CASE_SETUP.emergencyType);
      setEditAddress(DEFAULT_CASE_SETUP.address);
      setEditPriority("MEDIUM");
      setDispatchPriority("MEDIUM");
      setEstimatedPatients(1);
      setRequiredVolunteers(1);
      setStatusText("Idle");
      resetVoiceSessionState({ keepWorkflowStatus: true });
      setWorkflowStatus("No active case selected. Waiting for the next emergency call.");
      return;
    }

    const fallbackIso = new Date().toISOString();
    const selectedSnapshot: EmergencyCaseSnapshot = {
      id: selectedCase.id,
      caseNumber: selectedCase.caseNumber,
      emergencyType: selectedCase.emergencyType,
      priority: selectedCase.priority,
      status: selectedCase.status,
      address: selectedCase.address,
      location: selectedCase.location,
      createdAt: selectedCase.createdAt,
      updatedAt: fallbackIso,
      closedAt: null
    };

    setActiveCase((current) => {
      if (current?.id === selectedCase.id) {
        return {
          ...current,
          caseNumber: selectedCase.caseNumber,
          emergencyType: selectedCase.emergencyType,
          priority: selectedCase.priority,
          status: selectedCase.status,
          address: selectedCase.address,
          location: selectedCase.location
        };
      }

      return selectedSnapshot;
    });

    setEditEmergencyType(selectedCase.emergencyType || DEFAULT_CASE_SETUP.emergencyType);
    setEditAddress(selectedCase.address || DEFAULT_CASE_SETUP.address);
    setEditPriority(toCasePriority(selectedCase.priority));
    setDispatchPriority(toCasePriority(selectedCase.priority));
  }, [selectedCase]);

  useEffect(() => {
    if (!activeCase?.id) {
      caseSessionIdRef.current = "";
      return;
    }

    if (caseSessionIdRef.current === activeCase.id) {
      return;
    }

    caseSessionIdRef.current = activeCase.id;
    resetVoiceSessionState({ keepWorkflowStatus: true });
    setWorkflowStatus(
      `Case ${activeCase.caseNumber} selected. You can record multiple segments (stop/resume) and they will stay in this same case.`
    );
  }, [activeCase?.id, activeCase?.caseNumber]);

  const handleStopFinalize = async () => {
    const audioBlob = new Blob(chunksRef.current, { type: recorderMimeTypeRef.current || "audio/webm" });
    chunksRef.current = [];

    if (audioBlob.size === 0) {
      throw new Error("No audio captured. Please try again.");
    }

    const base64Audio = await blobToBase64(audioBlob);
    const durationMs = recordingStartedAtRef.current ? Date.now() - recordingStartedAtRef.current : undefined;
    const transcriptHint = compactText(`${transcriptHintRef.current} ${transcriptInterimRef.current}`);

    const payload = await analyzeVoice({
      audio: base64Audio,
      mimeType: audioBlob.type || recorderMimeTypeRef.current || "audio/webm",
      durationMs,
      emergencyId: activeCase?.id,
      segmentTimestamp: new Date().toISOString(),
      transcriptHint: transcriptHint || undefined,
      languageHint: languageMode === "auto" ? undefined : languageMode,
      caseContext: activeCase
        ? {
            emergencyType: compactText(editEmergencyType) || activeCase.emergencyType,
            priority: editPriority,
            address: compactText(editAddress) || activeCase.address,
            latitude: activeCase.location.latitude,
            longitude: activeCase.location.longitude
          }
        : undefined
    });

    const segmentNumber = segmentCountRef.current + 1;
    segmentCountRef.current = segmentNumber;
    setSegmentCount(segmentNumber);

    const segmentTime = new Date().toLocaleTimeString();
    const segmentTranscript = payload.transcription || "No transcription returned.";
    const segmentConversation = formatConversation(payload);
    const segmentSummary = compactText(
      payload.caseUpdateSuggestion?.summary || payload.conversation?.callSummary || segmentTranscript
    );
    const segmentAnalysisLines = [formatAnalysis(payload)];

    if (payload.caseUpdateSuggestion?.address) {
      segmentAnalysisLines.push(`Suggested address: ${payload.caseUpdateSuggestion.address}`);
    }

    if (payload.caseUpdateSuggestion?.emergencyType) {
      segmentAnalysisLines.push(`Suggested case type: ${payload.caseUpdateSuggestion.emergencyType}`);
    }

    if (
      typeof payload.caseUpdateSuggestion?.latitude === "number" &&
      typeof payload.caseUpdateSuggestion?.longitude === "number"
    ) {
      segmentAnalysisLines.push(
        `Suggested coordinates: ${payload.caseUpdateSuggestion.latitude}, ${payload.caseUpdateSuggestion.longitude}`
      );
    }

    if (typeof payload.caseUpdateSuggestion?.locationConfidence === "number") {
      segmentAnalysisLines.push(
        `Location confidence: ${Math.round(payload.caseUpdateSuggestion.locationConfidence * 100)}%`
      );
    }

    transcriptSegmentsRef.current = [
      ...transcriptSegmentsRef.current,
      `[Segment ${segmentNumber} • ${segmentTime}]\n${segmentTranscript}`
    ];
    conversationSegmentsRef.current = [
      ...conversationSegmentsRef.current,
      `[Segment ${segmentNumber} • ${segmentTime}]\n${segmentConversation || "No separated conversation for this segment."}`
    ];
    analysisSegmentsRef.current = [
      ...analysisSegmentsRef.current,
      `[Segment ${segmentNumber} • ${segmentTime}]\n${segmentAnalysisLines.join("\n")}`
    ];
    summarySegmentsRef.current = [...summarySegmentsRef.current, segmentSummary];

    transcriptHintRef.current = safeTailText(
      compactText(`${transcriptHintRef.current} ${segmentTranscript}`),
      4000
    );
    transcriptInterimRef.current = "";

    setVoicePayload(payload);
    setTranscript(transcriptSegmentsRef.current.join("\n\n"));
    setConversation(conversationSegmentsRef.current.join("\n\n"));
    setAnalysis(analysisSegmentsRef.current.join("\n\n----------------\n\n"));
    setGuidance(payload.assistantResponse || "No first-aid guidance returned.");
    setIsEmergency(payload.analysis.isEmergency);
    setSegmentLog((current) =>
      [
        ...current,
        {
          id: segmentNumber,
          time: segmentTime,
          summary: segmentSummary
        }
      ].slice(-12)
    );

    const nextPriority = toCasePriority(
      payload.caseUpdateSuggestion?.priority ?? payload.dispatchRecommendation?.priority ?? dispatchPriority
    );
    const nextPatients = clampInteger(
      payload.caseUpdateSuggestion?.patientCount ?? payload.dispatchRecommendation?.patientCount ?? estimatedPatients,
      1,
      20
    );
    const nextVolunteers = clampInteger(
      payload.caseUpdateSuggestion?.requiredVolunteers ??
        payload.dispatchRecommendation?.requiredVolunteers ??
        requiredVolunteers,
      1,
      6
    );

    setDispatchPriority(nextPriority);
    setEstimatedPatients(nextPatients);
    setRequiredVolunteers(nextVolunteers);
    const autoDispatchMessage = payload.autoDispatch
      ? payload.autoDispatch.actionTaken
        ? ` Auto-dispatch sent ${payload.autoDispatch.createdAssignments} volunteer request(s).`
        : payload.autoDispatch.skippedReason
          ? ` Auto-dispatch note: ${payload.autoDispatch.skippedReason}`
          : ""
      : "";
    setWorkflowStatus(`Segment ${segmentNumber} analyzed. Case details were updated automatically.${autoDispatchMessage}`);

    if (!activeCase) {
      return;
    }

    const suggestedEmergencyType =
      compactText(payload.caseUpdateSuggestion?.emergencyType || payload.dispatchRecommendation?.emergencyType || "") ||
      activeCase.emergencyType;
    const suggestedAddress = compactText(payload.caseUpdateSuggestion?.address || editAddress) || activeCase.address;
    const fullTranscriptForCase = safeTailText(compactText(transcriptSegmentsRef.current.join(" ")), 1900);
    const volunteerSummaryForCase = safeTailText(
      compactText(
        payload.volunteerSummary ||
          summarizeForVolunteer(payload, detectNotificationLanguage(payload))
      ),
      1400
    );
    const aiAnalysisForCase = safeTailText(
      compactText(
        payload.dispatcherDetails ||
          [
            `segments=${segmentNumber}`,
            `intent=${payload.analysis.intent}`,
            `confidence=${payload.analysis.confidence}`,
            payload.dispatchRecommendation?.rationale || "",
            segmentSummary
          ]
            .filter(Boolean)
            .join("; ")
      ),
      1900
    );

    setEditEmergencyType(suggestedEmergencyType);
    setEditAddress(suggestedAddress);
    setEditPriority(nextPriority);

    try {
      const updateInput: Parameters<typeof updateEmergencyCase>[1] = {
        emergencyType: suggestedEmergencyType,
        priority: nextPriority,
        address: suggestedAddress,
        voiceDescription: volunteerSummaryForCase,
        transcriptionText: fullTranscriptForCase,
        aiAnalysis: aiAnalysisForCase,
        possibleCondition: payload.caseUpdateSuggestion?.possibleCondition ?? payload.analysis.keywords?.[0],
        riskLevel: payload.caseUpdateSuggestion?.riskLevel ?? nextPriority
      };

      if (
        typeof payload.caseUpdateSuggestion?.latitude === "number" &&
        Number.isFinite(payload.caseUpdateSuggestion.latitude) &&
        typeof payload.caseUpdateSuggestion?.longitude === "number" &&
        Number.isFinite(payload.caseUpdateSuggestion.longitude)
      ) {
        updateInput.latitude = payload.caseUpdateSuggestion.latitude;
        updateInput.longitude = payload.caseUpdateSuggestion.longitude;
      }

      const updatedCase = await updateEmergencyCase(activeCase.id, updateInput);

      setActiveCase(updatedCase);
      await onCaseFlowUpdated?.(updatedCase.id);
      setWorkflowStatus(`Segment ${segmentNumber} saved and merged into ${updatedCase.caseNumber}.`);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "Failed to update case with analysis.";
      setError(message);
    }
  };

  const stopListening = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
    setIsRecording(false);
  };

  const startListening = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone recording is not supported in this browser.");
      return;
    }

    setError("");
    setWorkflowStatus(
      segmentCountRef.current > 0
        ? `Listening resumed for same case (segment ${segmentCountRef.current + 1}).`
        : "Listening started for this case."
    );
    setConversationFinished(false);
    transcriptInterimRef.current = "";
    transcriptHintRef.current = safeTailText(compactText(transcriptSegmentsRef.current.join(" ")), 3500);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
      const chosenMimeType =
        preferredMimeTypes.find((item) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(item)) ||
        "";
      const recorder = chosenMimeType ? new MediaRecorder(stream, { mimeType: chosenMimeType }) : new MediaRecorder(stream);
      const SpeechRecognitionCtor = getSpeechRecognitionConstructor();

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorderMimeTypeRef.current = chosenMimeType || "audio/webm";

      if (SpeechRecognitionCtor) {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = resolveRecognitionLang(languageMode);
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          const transcripts: string[] = [];
          const interim: string[] = [];
          const startIndex = typeof event.resultIndex === "number" ? event.resultIndex : 0;
          for (let i = startIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const candidate = result?.[0]?.transcript;
            if (!candidate) {
              continue;
            }

            const clean = candidate.trim();
            if (!clean) {
              continue;
            }

            if (result?.isFinal) {
              transcripts.push(clean);
            } else {
              interim.push(clean);
            }
          }

          if (transcripts.length > 0) {
            const next = `${transcriptHintRef.current} ${transcripts.join(" ")}`.trim();
            transcriptHintRef.current = safeTailText(next, 4000);
            transcriptInterimRef.current = "";
            return;
          }

          transcriptInterimRef.current = interim.join(" ").trim();
        };
        recognition.onerror = () => {
          // Optional helper only.
        };
        speechRecognitionRef.current = recognition;
        recognition.start();
      }

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          if (event.data.type) {
            recorderMimeTypeRef.current = event.data.type;
          }
        }
      };

      recorder.onstop = () => {
        setStatusText("Analyzing...");
        setIsAnalyzing(true);

        if (speechRecognitionRef.current) {
          speechRecognitionRef.current.stop();
        }

        void handleStopFinalize()
          .catch((reason: unknown) => {
            const message = reason instanceof Error ? reason.message : "Unable to analyze recording";
            setError(message);
          })
          .finally(() => {
            setIsAnalyzing(false);
            setStatusText("Idle");

            if (mediaStreamRef.current) {
              mediaStreamRef.current.getTracks().forEach((track) => track.stop());
              mediaStreamRef.current = null;
            }

            speechRecognitionRef.current = null;
            recordingStartedAtRef.current = null;
          });
      };

      recorder.start();
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
      setStatusText("Listening...");
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "Microphone permission denied or unavailable.";
      setError(message);
      setStatusText("Idle");
      setIsRecording(false);
    }
  };

  const handleToggleListening = () => {
    if (isRecording) {
      stopListening();
      return;
    }

    if (!activeCase) {
      setError("Waiting for call_started event. Case is created automatically from /emergency/init.");
      return;
    }

    void startListening();
  };

  const handleCloseCase = async () => {
    if (!activeCase) {
      setError("No active case selected to close.");
      return;
    }

    if (!conversationFinished) {
      setError("Mark that conversation is finished before closing the case.");
      return;
    }

    setError("");
    setIsClosingCase(true);

    try {
      const closed = await closeEmergencyCase({
        caseId: activeCase.id,
        finalOutcome: "Voice conversation finished and case closed by dispatcher.",
        notes: guidance || "Closed from AI listening workflow.",
        interventions: "Voice triage + automatic volunteer dispatch"
      });

      caseSessionIdRef.current = "";
      setActiveCase(null);
      setEditEmergencyType(DEFAULT_CASE_SETUP.emergencyType);
      setEditAddress(DEFAULT_CASE_SETUP.address);
      setEditPriority("MEDIUM");
      setDispatchPriority("MEDIUM");
      setEstimatedPatients(1);
      setRequiredVolunteers(1);
      setStatusText("Idle");
      resetVoiceSessionState({ keepWorkflowStatus: true });
      setWorkflowStatus(`Case ${closed.caseNumber} closed successfully. Panel reset and ready for next case.`);
      setError("");
      onCaseFlowUpdated?.();
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "Failed to close case.";
      setError(message);
    } finally {
      setIsClosingCase(false);
    }
  };

  const handleSaveCaseInfo = async () => {
    if (!activeCase) {
      setError("Select a case from table first.");
      return;
    }

    const nextType = editEmergencyType.trim();
    const nextAddress = editAddress.trim();
    if (!nextType || !nextAddress) {
      setError("Emergency type and address are required.");
      return;
    }

    setError("");
    setIsSavingCaseInfo(true);

    try {
      const updated = await updateEmergencyCase(activeCase.id, {
        emergencyType: nextType,
        priority: editPriority,
        address: nextAddress
      });

      setActiveCase(updated);
      setDispatchPriority(toCasePriority(updated.priority));
      setWorkflowStatus(`Case ${updated.caseNumber} updated successfully.`);
      onCaseFlowUpdated?.(updated.id);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "Failed to update case info.";
      setError(message);
    } finally {
      setIsSavingCaseInfo(false);
    }
  };

  const isBusy = isAnalyzing || isClosingCase || isSavingCaseInfo;
  const hasCase = Boolean(activeCase);
  const hasVoiceAnalysis = Boolean(voicePayload);
  const canCloseCase = Boolean(activeCase) && conversationFinished;

  return (
    <section id="ai-listening-panel" className="ai-voice-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, color: "#1f2937" }}>AI Listening</h3>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>
            Case is auto-created from call start. Record in multiple segments (stop/resume); all segments stay linked to the same `emergencyId`.
          </p>
        </div>
        <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
          <strong style={{ color: isRecording ? "#b91c1c" : isAnalyzing ? "#b45309" : "#374151" }}>{statusText}</strong>
          {isEmergency !== null ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 999,
                background: isEmergency ? "#fee2e2" : "#dcfce7",
                color: isEmergency ? "#b91c1c" : "#166534",
                border: `1px solid ${isEmergency ? "#fecaca" : "#bbf7d0"}`
              }}
            >
              {isEmergency ? "Emergency Detected" : "No Immediate Emergency"}
            </span>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 8
        }}
      >
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: hasCase ? "#ecfdf5" : "#f8fafc",
            color: hasCase ? "#166534" : "#475569",
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 700
          }}
        >
          1. Case: {hasCase ? "Ready" : "Pending"}
        </div>
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: hasVoiceAnalysis ? "#eff6ff" : "#f8fafc",
            color: hasVoiceAnalysis ? "#1d4ed8" : "#475569",
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 700
          }}
        >
          2. Analysis: {hasVoiceAnalysis ? "Done" : "Pending"}
        </div>
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #e2e8f0",
            background: canCloseCase ? "#fef3c7" : "#f8fafc",
            color: canCloseCase ? "#92400e" : "#475569",
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 700
          }}
        >
          3. Close: {canCloseCase ? "Ready" : "Pending"}
        </div>
      </div>

      <div
        style={{
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          padding: 12,
          display: "grid",
          gap: 10
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: "#4b5563", fontWeight: 700 }}>Step 1: Auto-linked Case</p>
        <p style={{ margin: 0, fontSize: 13, color: "#334155" }}>
          Case is created automatically when citizen starts call (`/emergency/init`). All voice segments are linked to the same `emergencyId`.
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "#334155" }}>{renderCaseChip(activeCase)}</p>

        {activeCase ? (
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", fontWeight: 700 }}>
              Quick Case Settings (edit what happened)
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569" }}>
                Emergency Type
                <input
                  value={editEmergencyType}
                  onChange={(event) => setEditEmergencyType(event.target.value)}
                  placeholder="Emergency type / نوع الحالة"
                  dir="auto"
                  style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "8px 10px", fontSize: 14 }}
                />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569" }}>
                Address
                <input
                  value={editAddress}
                  onChange={(event) => setEditAddress(event.target.value)}
                  placeholder="Address / الموقع"
                  dir="auto"
                  style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "8px 10px", fontSize: 14 }}
                />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569" }}>
                Priority
                <select
                  value={editPriority}
                  onChange={(event) => setEditPriority(event.target.value as CasePriority)}
                  style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "8px 10px", background: "#fff", fontSize: 14 }}
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => void handleSaveCaseInfo()}
                disabled={isBusy}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 12px",
                  background: "#0f766e",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: isBusy ? "not-allowed" : "pointer",
                  opacity: isBusy ? 0.6 : 1
                }}
              >
                {isSavingCaseInfo ? "Saving..." : "Save Changes"}
              </button>
              <span style={{ fontSize: 12, color: "#64748b" }}>
                Update this first when details change, then continue with listening (dispatch is automatic).
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Step 2: Listen</span>
        <span style={{ fontSize: 12, color: "#334155" }}>Segments in this case: {segmentCount}</span>
        <select
          value={languageMode}
          onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}
          disabled={isRecording || isBusy}
          style={{
            borderRadius: 10,
            border: "1px solid #d1d5db",
            padding: "8px 10px",
            background: "#fff",
            color: "#111827"
          }}
        >
          <option value="auto">Auto language</option>
          <option value="ar">Arabic</option>
          <option value="en">English</option>
        </select>

        <button
          type="button"
          onClick={handleToggleListening}
          disabled={isBusy || (!activeCase && !isRecording)}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "10px 16px",
            background: isRecording ? "#991b1b" : "#b91c1c",
            color: "#fff",
            fontWeight: 700,
            cursor: isBusy || (!activeCase && !isRecording) ? "not-allowed" : "pointer",
            opacity: isBusy || (!activeCase && !isRecording) ? 0.6 : 1
          }}
        >
          {isRecording ? "Stop Listening" : segmentCount > 0 ? "Resume AI Listening" : "Start AI Listening"}
        </button>
      </div>

      {segmentLog.length > 0 ? (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #dbeafe",
            background: "#eff6ff",
            padding: "10px 12px",
            display: "grid",
            gap: 6
          }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#1e3a8a" }}>
            Segment Timeline (same case memory)
          </p>
          {segmentLog.map((item) => (
            <p key={item.id} style={{ margin: 0, fontSize: 12, color: "#1f2937" }}>
              #{item.id} at {item.time}: {item.summary.length > 120 ? `${item.summary.slice(0, 117)}...` : item.summary}
            </p>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Step 3: Auto-Dispatch & Close</span>
        <span style={{ fontSize: 12, color: "#1d4ed8" }}>
          Volunteers are dispatched automatically by the decision engine (nearest 5 when action = DISPATCH).
        </span>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151" }}>
          <input
            type="checkbox"
            checked={conversationFinished}
            onChange={(event) => setConversationFinished(event.target.checked)}
            disabled={isBusy}
          />
          Conversation finished
        </label>

        <button
          type="button"
          onClick={() => void handleCloseCase()}
          disabled={!activeCase || !conversationFinished || isBusy}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "9px 14px",
            background: "#7f1d1d",
            color: "#fff",
            fontWeight: 700,
            cursor: !activeCase || !conversationFinished || isBusy ? "not-allowed" : "pointer",
            opacity: !activeCase || !conversationFinished || isBusy ? 0.6 : 1
          }}
        >
          {isClosingCase ? "Closing Case..." : "Finish Conversation And Close Case"}
        </button>
      </div>

      {workflowStatus ? (
        <div
          style={{
            borderRadius: 10,
            background: "#ecfeff",
            color: "#0f172a",
            border: "1px solid #bae6fd",
            padding: "10px 12px",
            fontSize: 13
          }}
        >
          {workflowStatus}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            borderRadius: 10,
            background: "#fef2f2",
            color: "#991b1b",
            border: "1px solid #fecaca",
            padding: "10px 12px",
            fontSize: 13
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          padding: 12
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: "#4b5563", fontWeight: 700 }}>Transcription</p>
        <pre
          style={{
            margin: "8px 0 0",
            fontFamily: "inherit",
            fontSize: 14,
            color: "#111827",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {transcript || "No transcript yet."}
        </pre>
      </div>

      <div
        style={{
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          padding: 12
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: "#4b5563", fontWeight: 700 }}>
          Conversation (Patient vs Call Center)
        </p>
        <pre
          style={{
            margin: "8px 0 0",
            fontFamily: "inherit",
            fontSize: 14,
            color: "#111827",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {conversation || "No separated conversation yet."}
        </pre>
      </div>

      <div
        style={{
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          padding: 12
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: "#4b5563", fontWeight: 700 }}>Analysis</p>
        <pre
          style={{
            margin: "8px 0 0",
            fontFamily: "inherit",
            fontSize: 14,
            color: "#111827",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {analysis || "No analysis yet."}
        </pre>
      </div>

      <div
        style={{
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          padding: 12
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: "#4b5563", fontWeight: 700 }}>First-Aid Guidance</p>
        <pre
          style={{
            margin: "8px 0 0",
            fontFamily: "inherit",
            fontSize: 14,
            color: "#111827",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {guidance || "No guidance yet."}
        </pre>
      </div>
    </section>
  );
};
