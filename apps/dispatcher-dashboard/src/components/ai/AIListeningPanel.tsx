import { useEffect, useRef, useState } from "react";

type VoiceApiResponse = {
  transcription?: string;
  transcript?: string;
  analysis?: unknown;
  isEmergency?: boolean;
  emergency?: boolean;
  data?: {
    transcription?: string;
    transcript?: string;
    analysis?: unknown;
    isEmergency?: boolean;
    emergency?: boolean;
  };
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

const readTranscript = (payload: VoiceApiResponse): string =>
  payload.data?.transcription ?? payload.data?.transcript ?? payload.transcription ?? payload.transcript ?? "";

const readEmergencyValue = (payload: VoiceApiResponse): boolean | null => {
  const explicitEmergency = payload.data?.isEmergency ?? payload.isEmergency ?? payload.data?.emergency ?? payload.emergency;
  if (typeof explicitEmergency === "boolean") {
    return explicitEmergency;
  }

  const analysisValue = payload.data?.analysis ?? payload.analysis;
  if (analysisValue && typeof analysisValue === "object") {
    const maybeEmergency = (analysisValue as { isEmergency?: unknown; emergency?: unknown }).isEmergency;
    if (typeof maybeEmergency === "boolean") {
      return maybeEmergency;
    }

    const maybeEmergencyAlt = (analysisValue as { isEmergency?: unknown; emergency?: unknown }).emergency;
    if (typeof maybeEmergencyAlt === "boolean") {
      return maybeEmergencyAlt;
    }
  }

  return null;
};

const formatAnalysis = (payload: VoiceApiResponse): string => {
  const emergency = readEmergencyValue(payload);
  const analysisValue = payload.data?.analysis ?? payload.analysis;

  if (typeof analysisValue === "string" && analysisValue.trim().length > 0) {
    if (emergency === null) {
      return analysisValue;
    }

    return `${analysisValue}\nEmergency: ${emergency ? "emergency" : "not emergency"}`;
  }

  if (analysisValue && typeof analysisValue === "object") {
    try {
      const serialized = JSON.stringify(analysisValue, null, 2);
      if (emergency === null) {
        return serialized;
      }

      return `${serialized}\nEmergency: ${emergency ? "emergency" : "not emergency"}`;
    } catch {
      // continue to fallback below
    }
  }

  if (emergency !== null) {
    return emergency ? "emergency" : "not emergency";
  }

  return "No analysis returned.";
};

export const AIListeningPanel = () => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState<"Idle" | "Listening..." | "Analyzing...">("Idle");

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleStopFinalize = async () => {
    const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];

    if (audioBlob.size === 0) {
      throw new Error("No audio captured. Please try again.");
    }

    const base64Audio = await blobToBase64(audioBlob);
    console.log("[AI Listening] base64Audio:", base64Audio);

    const response = await fetch("/api/v1/ai/voice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        audio: base64Audio
      })
    });

    if (!response.ok) {
      throw new Error(`Voice API failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as VoiceApiResponse;
    const nextTranscript = readTranscript(payload);
    const nextAnalysis = formatAnalysis(payload);

    setTranscript(nextTranscript || "No transcription returned.");
    setAnalysis(nextAnalysis);
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
    setTranscript("");
    setAnalysis("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        setStatusText("Analyzing...");
        setIsAnalyzing(true);

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
          });
      };

      recorder.start();
      setIsRecording(true);
      setStatusText("Listening...");
    } catch (reason: unknown) {
      const message =
        reason instanceof Error ? reason.message : "Microphone permission denied or unavailable.";
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

    void startListening();
  };

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        display: "grid",
        gap: 12
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, color: "#1f2937" }}>AI Listening</h3>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>
            Use microphone to record and analyze voice with AI.
          </p>
        </div>
        <strong style={{ color: isRecording ? "#b91c1c" : isAnalyzing ? "#b45309" : "#374151" }}>{statusText}</strong>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleToggleListening}
          disabled={isAnalyzing}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "10px 16px",
            background: isRecording ? "#991b1b" : "#b91c1c",
            color: "#fff",
            fontWeight: 700,
            cursor: isAnalyzing ? "not-allowed" : "pointer",
            opacity: isAnalyzing ? 0.6 : 1
          }}
        >
          {isRecording ? "🛑 Stop Listening" : "🎤 Start AI Listening"}
        </button>
      </div>

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
    </section>
  );
};
