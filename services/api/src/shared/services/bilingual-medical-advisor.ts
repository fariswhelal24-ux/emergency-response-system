/**
 * Bilingual medical advice: delegates triage and instructions to OpenAI (medical-triage).
 */

import { detectLanguage } from "./arabic";
import { correctText } from "./spell-correction";
import { runMedicalTriage, type MedicalTriagePayload, type TriageChatMessage } from "./medical-triage";

export interface MedicalContext {
  symptoms: string[];
  duration?: string;
  severity?: "mild" | "moderate" | "severe";
  age?: number;
  relevantHistory?: string[];
  currentMedications?: string[];
  allergies?: string[];
}

export interface MedicalAdvice {
  response: string;
  followUpQuestions: string[];
  resources: MedicalResource[];
  context: MedicalContext;
  isEmergency: boolean;
  confidence: number;
  language: "ar" | "en";
  triage: MedicalTriagePayload;
}

export interface MedicalResource {
  title: string;
  url: string;
  source: string;
  language: "ar" | "en" | "both";
}

const MEDICAL_RESOURCES: MedicalResource[] = [
  {
    title: "منظمة الصحة العالمية - التثقيف الصحي",
    url: "https://www.who.int/ar",
    source: "WHO",
    language: "ar"
  },
  {
    title: "وزارة الصحة السعودية",
    url: "https://www.moh.gov.sa/Ministry/MediaCenter/Pages/default.aspx",
    source: "Saudi MOH",
    language: "ar"
  },
  {
    title: "Mayo Clinic Health Information",
    url: "https://www.mayoclinic.org/symptoms",
    source: "Mayo Clinic",
    language: "en"
  },
  {
    title: "NHS UK - Health Information",
    url: "https://www.nhs.uk",
    source: "NHS",
    language: "en"
  },
  {
    title: "CDC Health Topics",
    url: "https://www.cdc.gov/DiseasesConditions/",
    source: "CDC",
    language: "en"
  }
];

const severityFromTriage = (s: MedicalTriagePayload["severity"]): MedicalContext["severity"] => {
  if (s === "low") {
    return "mild";
  }
  if (s === "high") {
    return "severe";
  }
  return "moderate";
};

const followUpsFromResponse = (text: string): string[] =>
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith("?") || line.endsWith("؟"))
    .slice(0, 3);

export class BilinguMedicalAdvisor {
  static async getMedicalAdvice(
    userInput: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
    userAge?: number
  ): Promise<MedicalAdvice> {
    const language = detectLanguage(userInput) as "ar" | "en";
    const corrected = correctText(userInput);
    const processedInput = corrected.corrected;

    const historyMessages: TriageChatMessage[] = conversationHistory
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content.trim() }))
      .filter((m) => m.content.length > 0)
      .slice(-20);

    const messages: TriageChatMessage[] = [...historyMessages, { role: "user", content: processedInput }];

    const triage = await runMedicalTriage(messages);

    const context: MedicalContext = {
      symptoms: [],
      age: userAge,
      severity: severityFromTriage(triage.severity)
    };

    const resources = MEDICAL_RESOURCES.filter(
      (resource) => resource.language === language || resource.language === "both"
    ).slice(0, 3);

    return {
      response: triage.response,
      followUpQuestions: followUpsFromResponse(triage.response),
      resources,
      context,
      isEmergency: triage.emergency,
      confidence: triage.emergency ? 0.9 : 0.75,
      language,
      triage
    };
  }

  static formatAdviceForDisplay(advice: MedicalAdvice): string {
    let formatted = advice.response;

    if (advice.followUpQuestions.length > 0) {
      formatted += "\n\n❓ **";
      formatted += advice.language === "ar" ? "أسئلة توضيحية:" : "Follow-up Questions:";
      formatted += "**\n";
      advice.followUpQuestions.forEach((q, i) => {
        formatted += `${i + 1}. ${q}\n`;
      });
    }

    if (advice.resources.length > 0) {
      formatted += "\n\n📚 **";
      formatted += advice.language === "ar" ? "مصادر موثوقة:" : "Helpful Resources:";
      formatted += "**\n";
      advice.resources.forEach((r) => {
        formatted += `- [${r.title}](${r.url}) (${r.source})\n`;
      });
    }

    return formatted;
  }
}

export default BilinguMedicalAdvisor;
