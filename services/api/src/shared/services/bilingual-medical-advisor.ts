/**
 * Bilingual Medical Advisor Service
 * Advanced context-aware medical guidance in Arabic and English
 * Handles MSA, dialects, and natural language processing
 */

import { detectLanguage } from "./arabic";
import { correctText } from "./spell-correction";
import AIAssistantService from "./ai-assistant";

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
}

export interface MedicalResource {
  title: string;
  url: string;
  source: string;
  language: "ar" | "en" | "both";
}

const EMERGENCY_KEYWORDS = {
  ar: [
    "لا أتنفس",
    "صعوبة في التنفس",
    "ألم صدر شديد",
    "نزيف غزير",
    "فاقد الوعي",
    "غيبوبة",
    "جلطة",
    "سكتة دماغية",
    "إغماءة",
    "تسمم",
    "جراحة",
    "حادث خطير",
    "نزيف في الدماغ",
    "نوبة قلبية",
  ],
  en: [
    "cant breathe",
    "difficulty breathing",
    "severe chest pain",
    "heavy bleeding",
    "unconscious",
    "coma",
    "stroke",
    "heart attack",
    "seizure",
    "poisoning",
    "accident",
    "critical",
    "emergency",
    "severe injury",
  ],
};

const MEDICAL_RESOURCES: MedicalResource[] = [
  // Arabic resources
  {
    title: "منظمة الصحة العالمية - التثقيف الصحي",
    url: "https://www.who.int/ar",
    source: "WHO",
    language: "ar",
  },
  {
    title: "وزارة الصحة السعودية",
    url: "https://www.moh.gov.sa/Ministry/MediaCenter/Pages/default.aspx",
    source: "Saudi MOH",
    language: "ar",
  },
  {
    title: "ويكيبيديا - معلومات طبية",
    url: "https://ar.wikipedia.org/wiki",
    source: "Wikipedia",
    language: "ar",
  },
  // English resources
  {
    title: "Mayo Clinic Health Information",
    url: "https://www.mayoclinic.org/symptoms",
    source: "Mayo Clinic",
    language: "en",
  },
  {
    title: "NHS UK - Health Information",
    url: "https://www.nhs.uk",
    source: "NHS",
    language: "en",
  },
  {
    title: "CDC Health Topics",
    url: "https://www.cdc.gov/DiseasesConditions/",
    source: "CDC",
    language: "en",
  },
  {
    title: "WebMD Medical Reference",
    url: "https://www.webmd.com/",
    source: "WebMD",
    language: "en",
  },
];

/**
 * Follow-up questions to clarify medical information
 */
const FOLLOW_UP_QUESTIONS = {
  ar: {
    symptoms: [
      "منذ كم يوم تشعر بهذه الأعراض؟",
      "هل تزداد الأعراض سوءاً أم تتحسن؟",
      "هل هناك أعراض أخرى بجانب ما ذكرته؟",
      "هل هذه الأعراض مستمرة أم متقطعة؟",
      "كم عمرك إن سمحت؟",
    ],
    severity: [
      "كم درجة شدة الألم على مقياس من 1 إلى 10؟",
      "هل تؤثر هذه الأعراض على حياتك اليومية؟",
      "هل يمكنك القيام بنشاطاتك العادية معها؟",
    ],
    history: [
      "هل سبق وعانيت من هذه المشكلة من قبل؟",
      "هل لديك أي أمراض مزمنة أخرى؟",
      "هل تتناول أي أدوية بشكل منتظم؟",
      "هل لديك حساسية من أي أدوية؟",
    ],
    environment: [
      "هل يوجد شيء محدد يزيد من الأعراض؟",
      "هل يوجد شيء يخفف من الأعراض؟",
      "هل هناك أشخاص حولك يعانون من أعراض مشابهة؟",
    ],
  },
  en: {
    symptoms: [
      "How long have you been experiencing these symptoms?",
      "Are the symptoms getting worse or improving?",
      "Are there any other symptoms besides what you mentioned?",
      "Are these symptoms constant or intermittent?",
      "What is your age if you don't mind me asking?",
    ],
    severity: [
      "On a scale of 1 to 10, how severe is the pain?",
      "Do these symptoms affect your daily activities?",
      "Can you perform your normal activities with these symptoms?",
    ],
    history: [
      "Have you experienced this problem before?",
      "Do you have any other chronic health conditions?",
      "Are you taking any regular medications?",
      "Are you allergic to any medications?",
    ],
    environment: [
      "Is there anything specific that worsens the symptoms?",
      "Is there anything that relieves the symptoms?",
      "Are there people around you with similar symptoms?",
    ],
  },
};

/**
 * Medical response templates for consistency
 */
const RESPONSE_TEMPLATES = {
  ar: {
    header: "بناءً على ما وصفته، إليك بعض النصائح:",
    warning:
      "⚠️ **تنبيه مهم**: قد تحتاج إلى رعاية طبية فورية. يرجى الاتصال برقم الطوارئ أو التوجه إلى أقرب مستشفى.",
    recommendation: "التوصية الأساسية:",
    homecare: "العناية المنزلية:",
    when_doctor: "متى يجب عليك زيارة الطبيب:",
    prevention: "الوقاية:",
    medication_note: "ملاحظة حول الأدوية:",
    disclaimer:
      "**تنبيه قانوني**: هذه النصائح لأغراض تعليمية فقط وليست بديلاً عن استشارة الطبيب المتخصص.",
  },
  en: {
    header: "Based on what you've described, here are some suggestions:",
    warning:
      "⚠️ **Important Warning**: You may need immediate medical care. Please call emergency services or go to the nearest hospital.",
    recommendation: "Main Recommendation:",
    homecare: "Home Care Tips:",
    when_doctor: "When to See a Doctor:",
    prevention: "Prevention:",
    medication_note: "Medication Note:",
    disclaimer:
      "**Legal Notice**: This advice is for educational purposes only and is not a substitute for professional medical advice.",
  },
};

/**
 * Main Bilingual Medical Advisor Service
 */
export class BilinguMedicalAdvisor {
  /**
   * Get comprehensive medical advice based on user input
   */
  static async getMedicalAdvice(
    userInput: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
    userAge?: number
  ): Promise<MedicalAdvice> {
    // Detect language and preprocess
    const language = detectLanguage(userInput) as "ar" | "en";
    const corrected = correctText(userInput);
    const processedInput = corrected.corrected;

    // Extract context from current and past messages
    const context = this.extractMedicalContext(processedInput, conversationHistory, userAge);

    // Check for emergency
    const isEmergency = this.detectEmergency(processedInput, language);

    if (isEmergency) {
      const emergencyResponse = this.generateEmergencyResponse(language);
      return {
        response: emergencyResponse.response,
        followUpQuestions: [],
        resources: [],
        context,
        isEmergency: true,
        confidence: 1.0,
        language,
      };
    }

    // Get AI response
    const aiResponse = await this.getAIResponse(processedInput, language, conversationHistory);

    // Generate follow-up questions
    const followUpQuestions = this.generateFollowUpQuestions(context, language);

    // Find relevant resources
    const resources = this.getRelevantResources(context, language);

    // Format response
    const formattedResponse = this.formatResponse(aiResponse, language);

    return {
      response: formattedResponse,
      followUpQuestions,
      resources,
      context,
      isEmergency: false,
      confidence: 0.85,
      language,
    };
  }

  /**
   * Extract medical context from messages
   */
  private static extractMedicalContext(
    input: string,
    history: Array<{ role: string; content: string }>,
    age?: number
  ): MedicalContext {
    const symptoms: string[] = [];
    const medicationKeywords = ["دواء", "أخذ", "تناول", "medicine", "take", "taking"];
    const allergyKeywords = ["حساسية", "ساس", "allergy", "allergic"];

    // Extract from current input
    const symptomTerms = [
      "حمى",
      "صداع",
      "سعال",
      "ألم",
      "غثيان",
      "قيء",
      "fever",
      "headache",
      "cough",
      "pain",
      "nausea",
      "vomit",
    ];

    symptomTerms.forEach((term) => {
      if (input.toLowerCase().includes(term)) {
        symptoms.push(term);
      }
    });

    // Extract medications from history
    const currentMedications: string[] = [];
    history.forEach((msg) => {
      medicationKeywords.forEach((kw) => {
        if (msg.content.toLowerCase().includes(kw)) {
          currentMedications.push(msg.content);
        }
      });
    });

    return {
      symptoms,
      duration: this.extractDuration(input),
      severity: this.extractSeverity(input),
      age,
      relevantHistory: this.extractHistory(history),
      currentMedications,
      allergies: this.extractAllergies(input, history),
    };
  }

  /**
   * Extract symptom duration from text
   */
  private static extractDuration(text: string): string | undefined {
    const durationPatterns = [
      /(\d+)\s*(سنة|سنوات|سن|سنين|year|years|y)/i,
      /(\d+)\s*(شهر|أشهر|month|months)/i,
      /(\d+)\s*(أسبوع|أسابيع|week|weeks)/i,
      /(\d+)\s*(يوم|أيام|day|days|d)/i,
      /(\d+)\s*(ساعة|ساعات|hour|hours|h)/i,
    ];

    for (const pattern of durationPatterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }

    return undefined;
  }

  /**
   * Extract severity level
   */
  private static extractSeverity(text: string): MedicalContext["severity"] {
    const severely = ["شديد", "حاد", "قوي", "جداً", "severe", "acute", "critical"];
    const mildly = ["خفيف", "طفيف", "بسيط", "mild", "light"];

    const lowerText = text.toLowerCase();

    if (severely.some((s) => lowerText.includes(s))) return "severe";
    if (mildly.some((s) => lowerText.includes(s))) return "mild";

    return "moderate";
  }

  /**
   * Extract medical history from conversation
   */
  private static extractHistory(history: Array<{ role: string; content: string }>): string[] {
    const historyItems: string[] = [];
    const historyKeywords = [
      "قبل",
      "سابق",
      "سابقاً",
      "previously",
      "before",
      "had",
      "كان لدي",
    ];

    history.forEach((msg) => {
      if (historyKeywords.some((kw) => msg.content.toLowerCase().includes(kw))) {
        historyItems.push(msg.content);
      }
    });

    return historyItems;
  }

  /**
   * Extract allergies
   */
  private static extractAllergies(
    text: string,
    history: Array<{ role: string; content: string }>
  ): string[] {
    const allergies: string[] = [];
    const allergyKeywords = ["حساسية", "allergy", "allergic"];

    const searchText = text + " " + history.map((h) => h.content).join(" ");

    allergyKeywords.forEach((kw) => {
      if (searchText.toLowerCase().includes(kw)) {
        allergies.push(kw);
      }
    });

    return allergies;
  }

  /**
   * Detect emergency situation
   */
  private static detectEmergency(input: string, language: "ar" | "en"): boolean {
    const keywords = EMERGENCY_KEYWORDS[language];
    const lowerInput = input.toLowerCase();

    return keywords.some((keyword) => lowerInput.includes(keyword.toLowerCase()));
  }

  /**
   * Generate emergency response
   */
  private static generateEmergencyResponse(language: "ar" | "en"): { response: string } {
    const templates = RESPONSE_TEMPLATES[language];

    if (language === "ar") {
      return {
        response: `${templates.warning}\n\n📞 أرقام الطوارئ:\n- السعودية: 997\n- مصر: 123\n- الإمارات: 998\n- الكويت: 112\n- قطر: 999\n\nيرجى عدم التأخير في طلب المساعدة الطبية الفورية.`,
      };
    }

    return {
      response: `${templates.warning}\n\n📞 Emergency Numbers:\n- US: 911\n- UK: 999\n- EU: 112\n- Australia: 000\n\nPlease do not delay in seeking immediate medical assistance.`,
    };
  }

  /**
   * Get AI response
   */
  private static async getAIResponse(
    input: string,
    language: "ar" | "en",
    history: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<string> {
    try {
      const { response } = await AIAssistantService.getResponse(input, {
        history: history.slice(-5), // Keep last 5 messages for context
      });

      return response;
    } catch (error) {
      console.error("Error getting AI response:", error);
      return "تحدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.";
    }
  }

  /**
   * Generate follow-up questions
   */
  private static generateFollowUpQuestions(context: MedicalContext, language: "ar" | "en"): string[] {
    const questions = FOLLOW_UP_QUESTIONS[language];
    const suggested: string[] = [];

    // Add symptom questions if symptoms are vague
    if (context.symptoms.length > 0 && !context.duration) {
      suggested.push(questions.symptoms[0]);
    }

    // Add severity question if not specified
    if (!context.severity) {
      suggested.push(questions.severity[0]);
    }

    // Add medication questions if not mentioned
    if (!context.currentMedications || context.currentMedications.length === 0) {
      suggested.push(questions.history[2]);
    }

    // Add allergy question if not mentioned
    if (!context.allergies || context.allergies.length === 0) {
      suggested.push(questions.history[3]);
    }

    // Add general follow-up
    if (suggested.length > 0) {
      suggested.push(questions.environment[0]);
    }

    return suggested.slice(0, 3); // Return max 3 questions
  }

  /**
   * Get relevant medical resources
   */
  private static getRelevantResources(context: MedicalContext, language: "ar" | "en"): MedicalResource[] {
    return MEDICAL_RESOURCES.filter(
      (resource) =>
        resource.language === language ||
        resource.language === "both"
    ).slice(0, 3); // Return max 3 resources
  }

  /**
   * Format response for display
   */
  private static formatResponse(response: string, language: "ar" | "en"): string {
    const templates = RESPONSE_TEMPLATES[language];

    // Add header if not present
    if (!response.includes("بناءً على") && !response.includes("Based on")) {
      response = `${templates.header}\n\n${response}`;
    }

    // Add disclaimer at the end
    response += `\n\n${templates.disclaimer}`;

    return response;
  }

  /**
   * Format advice for display
   */
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
