import OpenAI from "openai";

import { env } from "../../config/env";

type Language = "ar" | "en" | "mixed";
type ResponseLanguage = "ar" | "en";
type AssistantIntent = "medical_question" | "emergency" | "appointment" | "general" | "unclear";

interface ConversationContext {
  userId?: string;
  history: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

interface TrustedSource {
  title: string;
  url: string;
}

interface AssistantEntities {
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

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
}

type SymptomKey =
  | "fever"
  | "headache"
  | "cough"
  | "sore_throat"
  | "nausea"
  | "vomiting"
  | "diarrhea"
  | "stomach_pain"
  | "chest_pain"
  | "breathing"
  | "dizziness"
  | "fatigue"
  | "runny_nose";

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;
let openAICooldownUntil = 0;

const VALID_INTENTS: AssistantIntent[] = [
  "medical_question",
  "emergency",
  "appointment",
  "general",
  "unclear"
];

const EMERGENCY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "not_breathing", pattern: /\b(not breathing|can't breathe|cannot breathe|stopped breathing)\b/i },
  { label: "unconscious", pattern: /\b(unconscious|not responsive|passed out|fainted)\b/i },
  { label: "chest_pain", pattern: /\b(severe chest pain|crushing chest pain|heart attack)\b/i },
  { label: "stroke", pattern: /\b(stroke|face drooping|slurred speech)\b/i },
  { label: "seizure", pattern: /\b(seizure|convulsion)\b/i },
  { label: "bleeding", pattern: /\b(severe bleeding|won't stop bleeding|hemorrhage)\b/i },
  { label: "overdose", pattern: /\b(overdose|poisoning|poisoned)\b/i },
  { label: "suicide", pattern: /\b(suicide|kill myself|self-harm)\b/i },
  { label: "arabic_breathing", pattern: /(لا يتنفس|ما\s*بتنفس|لا\s*يتنفس\s*أبد|اختناق)/i },
  { label: "arabic_unconscious", pattern: /(فاقد\s*الوعي|غير\s*واعي|لا\s*يستجيب|مغمى\s*عليه)/i },
  { label: "arabic_chest", pattern: /(ألم\s*صدر\s*شديد|نوبة\s*قلبية|جلطة\s*قلبية)/i },
  { label: "arabic_stroke", pattern: /(جلطة|سكتة\s*دماغية|انحراف\s*الفم|تلعثم)/i },
  { label: "arabic_bleeding", pattern: /(نزيف\s*شديد|النزيف\s*لا\s*يتوقف)/i },
  { label: "arabic_overdose", pattern: /(تسمم|جرعة\s*زائدة)/i },
  { label: "arabic_suicide", pattern: /(انتحار|إيذاء\s*النفس)/i }
];

const GREETING_PATTERNS = /^\s*(مرحبا|اهلا|أهلا|السلام عليكم|هاي|hello|hi|hey)/i;
const THANKS_PATTERNS = /\b(شكرا|شكراً|يسلمو|مشكور|thank you|thanks)\b/i;
const VAGUE_HELP_PATTERNS =
  /^(اعراض شو|شو الاعراض|شو الأعراض|شو عندك|ماذا تقصد|شو يعني|ساعدني|help|what symptoms|symptoms\??|what do you mean)\s*\??$/i;
const QUESTION_PATTERNS =
  /[?؟]|^\s*(what|why|how|when|should|can|is|are|do|does|where|who|هل|كيف|ليش|لماذا|متى|شو|ماذا|وين|مين)\b/i;
const GENERIC_RESPONSE_PATTERNS = [
  /how can i help you today/i,
  /كيف يمكنني مساعدتك اليوم/i,
  /i can help with safe first-aid guidance/i,
  /سأساعدك بخطوات أولية آمنة/i,
  /please describe your symptoms/i,
  /يرجى وصف الأعراض/i
];

const SYMPTOM_PATTERNS: Array<{ key: SymptomKey; pattern: RegExp; ar: string; en: string }> = [
  { key: "fever", pattern: /(حمى|حرارة|سخونة|fever|temperature)/i, ar: "حرارة", en: "fever" },
  { key: "headache", pattern: /(صداع|وجع راس|headache)/i, ar: "صداع", en: "headache" },
  { key: "cough", pattern: /(سعال|كحة|cough)/i, ar: "كحة", en: "cough" },
  { key: "sore_throat", pattern: /(التهاب حلق|وجع حلق|sore throat|throat pain)/i, ar: "ألم حلق", en: "sore throat" },
  { key: "nausea", pattern: /(غثيان|nausea)/i, ar: "غثيان", en: "nausea" },
  { key: "vomiting", pattern: /(قيء|استفراغ|vomit|vomiting)/i, ar: "استفراغ", en: "vomiting" },
  { key: "diarrhea", pattern: /(إسهال|اسهال|diarrhea)/i, ar: "إسهال", en: "diarrhea" },
  { key: "stomach_pain", pattern: /(ألم بطن|وجع بطن|مغص|stomach pain|abdominal pain)/i, ar: "ألم بطن", en: "stomach pain" },
  { key: "chest_pain", pattern: /(ألم صدر|وجع صدر|chest pain)/i, ar: "ألم صدر", en: "chest pain" },
  { key: "breathing", pattern: /(ضيق تنفس|صعوبة تنفس|breathing trouble|shortness of breath)/i, ar: "ضيق تنفس", en: "breathing trouble" },
  { key: "dizziness", pattern: /(دوخة|دوار|dizziness)/i, ar: "دوخة", en: "dizziness" },
  { key: "fatigue", pattern: /(تعب|إرهاق|fatigue|tired)/i, ar: "تعب", en: "fatigue" },
  { key: "runny_nose", pattern: /(رشح|زكام|سيلان|runny nose|cold)/i, ar: "رشح", en: "runny nose" }
];

const MEDICATION_PATTERNS = /(باراسيتامول|paracetamol|acetaminophen|ibuprofen|aspirin|amoxicillin|دواء|حبوب|medicine|medication)/i;
const IMPROVING_PATTERNS = /(تحسن|أفضل|خف|improv|better)/i;
const WORSENING_PATTERNS = /(أسوأ|زاد|تفاقم|worse|worsen)/i;

const isLanguage = (value: unknown): value is Language => value === "ar" || value === "en" || value === "mixed";
const isResponseLanguage = (value: unknown): value is ResponseLanguage => value === "ar" || value === "en";

const asStringArray = (value: unknown, limit: number = 10): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
};

const clampConfidence = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.6;
  }

  return Math.max(0, Math.min(1, numeric));
};

const normalizeSources = (value: unknown): TrustedSource[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const title = (item as { title?: unknown }).title;
      const url = (item as { url?: unknown }).url;

      if (typeof title !== "string" || typeof url !== "string") {
        return null;
      }

      const cleanTitle = title.trim();
      const cleanUrl = url.trim();
      if (!cleanTitle || !cleanUrl) {
        return null;
      }

      try {
        const parsed = new URL(cleanUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return null;
        }
      } catch {
        return null;
      }

      return {
        title: cleanTitle,
        url: cleanUrl
      };
    })
    .filter((source): source is TrustedSource => source !== null)
    .slice(0, 2);
};

const extractOpenAIError = (
  error: unknown
): {
  status?: number;
  code?: string;
  type?: string;
  message?: string;
} => {
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

const shouldBypassOpenAI = (): boolean => Date.now() < openAICooldownUntil;

const setOpenAICooldown = (milliseconds: number): void => {
  openAICooldownUntil = Date.now() + milliseconds;
};

const defaultAnalysis = (intent: AssistantIntent = "medical_question", keywords: string[] = []): AssistantAnalysis => ({
  intent,
  confidence: intent === "emergency" ? 0.92 : 0.6,
  keywords,
  entities: {
    symptoms: [],
    bodyParts: [],
    medicines: [],
    conditions: []
  }
});

const detectLanguageFromText = (text: string): Language => {
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasEnglish = /[A-Za-z]/.test(text);

  if (hasArabic && hasEnglish) {
    return "mixed";
  }

  return hasArabic ? "ar" : "en";
};

const detectEmergencySignals = (text: string): { isEmergency: boolean; labels: string[] } => {
  const labels = EMERGENCY_PATTERNS.filter((rule) => rule.pattern.test(text)).map((rule) => rule.label);

  return {
    isEmergency: labels.length > 0,
    labels
  };
};

const isGreeting = (text: string): boolean => GREETING_PATTERNS.test(text.trim());
const isThanks = (text: string): boolean => THANKS_PATTERNS.test(text.trim());
const isVagueHelpRequest = (text: string): boolean => VAGUE_HELP_PATTERNS.test(text.trim());
const isQuestion = (text: string): boolean => QUESTION_PATTERNS.test(text.trim());

const containsNoBreathing = (text: string): boolean =>
  /(not breathing|stopped breathing|isn't breathing|no breathing|لا يتنفس|ما بيتنفس|لا يوجد تنفس)/i.test(text);

const containsBreathing = (text: string): boolean =>
  /(breathing|is breathing|breathes|يتنفس|يتنفس بشكل|عنده تنفس|في تنفس)/i.test(text);

const containsUnconscious = (text: string): boolean =>
  /(unconscious|not responsive|passed out|fainted|فاقد الوعي|غير واعي|لا يستجيب|مغمى عليه)/i.test(text);

const extractSymptomsFromText = (text: string): SymptomKey[] => {
  const found = new Set<SymptomKey>();
  SYMPTOM_PATTERNS.forEach((item) => {
    if (item.pattern.test(text)) {
      found.add(item.key);
    }
  });
  return Array.from(found);
};

const formatSymptomList = (symptoms: SymptomKey[], language: ResponseLanguage): string => {
  const labels = symptoms
    .map((symptom) => SYMPTOM_PATTERNS.find((item) => item.key === symptom))
    .filter((item): item is (typeof SYMPTOM_PATTERNS)[number] => Boolean(item))
    .map((item) => (language === "ar" ? item.ar : item.en));

  if (labels.length === 0) {
    return language === "ar" ? "الأعراض" : "the symptoms";
  }

  return labels.join(language === "ar" ? "، " : ", ");
};

const extractDurationText = (text: string): string | undefined => {
  const match = text.match(/(\d+\s*(hour|hours|day|days|week|weeks|يوم|أيام|ساعة|ساعات|أسبوع|أسابيع)|منذ\s+\S+)/i);
  return match?.[0]?.trim();
};

const extractSeverityText = (text: string): string | undefined => {
  const numeric = text.match(/([1-9]|10)\s*(\/\s*10|من\s*10|out of 10)?/i);
  if (numeric) {
    return numeric[1];
  }

  const verbal = text.match(/(خفيف|متوسط|شديد|mild|moderate|severe)/i);
  return verbal?.[0]?.trim();
};

const extractMedicationText = (text: string): string | undefined => {
  const match = text.match(/(باراسيتامول|paracetamol|acetaminophen|ibuprofen|aspirin|amoxicillin)/i);
  return match?.[0]?.trim();
};

const isGenericResponse = (response: string, messageCount: number): boolean =>
  messageCount > 1 && GENERIC_RESPONSE_PATTERNS.some((pattern) => pattern.test(response.trim()));

const extractFollowUpQuestions = (response: string): string[] =>
  response
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.endsWith("?") || line.endsWith("؟"))
    .slice(0, 2);

const buildDirectFirstAidAnswer = (
  userMessage: string,
  language: ResponseLanguage
):
  | {
      response: string;
      followUpQuestions: string[];
      isEmergency: boolean;
      intent: AssistantIntent;
      keywords: string[];
    }
  | null => {
  const message = userMessage.trim();
  const lowerMessage = message.toLowerCase();
  const askingAboutCpr = /cpr|الإنعاش|الانعاش|انعاش/i.test(message);
  const breathing = containsBreathing(message);
  const notBreathing = containsNoBreathing(message);
  const unconscious = containsUnconscious(message);

  if (askingAboutCpr && breathing && !notBreathing) {
    return {
      response:
        language === "ar"
          ? "لا يُنصح بالإنعاش القلبي الرئوي إذا كان الشخص يتنفس، لأن الـ CPR يُستخدم عندما لا يوجد تنفس طبيعي أو لا توجد استجابة. القيام به دون حاجة قد يسبب أذى مثل كسور الأضلاع.\n\nبدلاً من ذلك:\n1. ضعه في وضعية التعافي إذا كان فاقد الوعي\n2. راقب التنفس باستمرار\n3. اتصل بالإسعاف إذا كان التنفس غير طبيعي أو الحالة غير مستقرة"
          : "CPR is not recommended if the person is breathing, because CPR is used when there is no normal breathing or no effective response. Doing CPR unnecessarily can cause harm such as rib fractures.\n\nInstead:\n1. Put the person in the recovery position if they are unconscious\n2. Monitor breathing closely\n3. Call emergency services if the breathing is abnormal or the condition is unstable",
      followUpQuestions: [
        language === "ar"
          ? "هل الشخص يتنفس بشكل طبيعي أم بشكل غير منتظم؟"
          : "Is the person breathing normally or irregularly?"
      ],
      isEmergency: false,
      intent: "medical_question",
      keywords: ["cpr", "breathing"]
    };
  }

  if (unconscious && breathing && !notBreathing) {
    return {
      response:
        language === "ar"
          ? "إذا كان الشخص فاقد الوعي لكنه يتنفس، لا تبدأ CPR.\n\nافعل التالي:\n1. اتصل بالإسعاف فوراً\n2. ضعه في وضعية التعافي على جانبه\n3. افتح مجرى الهواء بلطف وتأكد أن الفم والأنف غير مسدودين\n4. راقب التنفس باستمرار حتى وصول المساعدة"
          : "If the person is unconscious but breathing, do not start CPR.\n\nDo this:\n1. Call emergency services immediately\n2. Place the person in the recovery position on their side\n3. Gently open the airway and make sure the mouth and nose are not blocked\n4. Keep monitoring breathing until help arrives",
      followUpQuestions: [
        language === "ar" ? "هل يتنفس بشكل طبيعي أم يوجد صوت شخير أو انقطاع؟" : "Is the breathing normal, or is there snoring, gasping, or pauses?"
      ],
      isEmergency: true,
      intent: "emergency",
      keywords: ["unconscious", "breathing"]
    };
  }

  if (notBreathing) {
    return {
      response:
        language === "ar"
          ? "إذا كان الشخص لا يتنفس أو لا يتنفس بشكل طبيعي، هذه حالة طارئة.\n\nافعل التالي الآن:\n1. اتصل بالإسعاف فوراً\n2. ابدأ CPR إذا كان غير مستجيب\n3. اضغط في منتصف الصدر بسرعة وثبات\n4. إذا توفر AED استخدمه فوراً واتبع التعليمات الصوتية"
          : "If the person is not breathing or not breathing normally, this is an emergency.\n\nDo this now:\n1. Call emergency services immediately\n2. Start CPR if the person is unresponsive\n3. Push hard and fast in the center of the chest\n4. Use an AED immediately if one is available and follow its voice prompts",
      followUpQuestions: [
        language === "ar" ? "هل الشخص بالغ أم طفل؟" : "Is the person an adult or a child?"
      ],
      isEmergency: true,
      intent: "emergency",
      keywords: ["not_breathing", "cpr"]
    };
  }

  if (/recovery position|وضعية التعافي|وضعية الإفاقة|وضعية الافاقة/i.test(message)) {
    return {
      response:
        language === "ar"
          ? "وضعية التعافي تُستخدم للشخص فاقد الوعي لكنه يتنفس.\n\nالخطوات:\n1. مدد الذراع القريبة بزاوية\n2. ضع اليد الأخرى تحت الخد\n3. اثنِ الركبة البعيدة\n4. لف الشخص بلطف على جانبه\n5. أمل الرأس للخلف قليلًا للحفاظ على مجرى الهواء مفتوحًا"
          : "The recovery position is used for a person who is unconscious but breathing.\n\nSteps:\n1. Place the nearest arm at a right angle\n2. Put the other hand under the cheek\n3. Bend the far knee\n4. Gently roll the person onto their side\n5. Tilt the head slightly back to keep the airway open",
      followUpQuestions: [
        language === "ar" ? "هل الشخص فاقد الوعي لكنه يتنفس الآن؟" : "Is the person unconscious but breathing right now?"
      ],
      isEmergency: false,
      intent: "medical_question",
      keywords: ["recovery_position"]
    };
  }

  if (/severe bleeding|heavy bleeding|نزيف شديد|نزيف غزير/i.test(message)) {
    return {
      response:
        language === "ar"
          ? "في النزيف الشديد:\n1. اضغط مباشرة على مكان النزيف بقطعة قماش نظيفة أو بيدك إذا لزم\n2. لا ترفع القماش إذا ابتل؛ أضف طبقة أخرى فوقه\n3. اطلب الإسعاف فوراً إذا كان النزيف غزيراً أو لا يتوقف\n4. إذا أمكن، ارفع الطرف المصاب دون تأخير الضغط"
          : "For severe bleeding:\n1. Apply firm direct pressure to the wound with a clean cloth or your hand if needed\n2. Do not remove the cloth if it soaks through; add another layer on top\n3. Call emergency services immediately if the bleeding is heavy or does not stop\n4. If possible, raise the injured limb without delaying direct pressure",
      followUpQuestions: [
        language === "ar" ? "هل النزيف ما زال مستمراً رغم الضغط المباشر؟" : "Is the bleeding still continuing despite direct pressure?"
      ],
      isEmergency: true,
      intent: "emergency",
      keywords: ["bleeding"]
    };
  }

  if (/chest pain|ألم صدر/i.test(message) && (isQuestion(message) || lowerMessage.includes("what should i do") || /ماذا أفعل|شو أعمل/.test(message))) {
    return {
      response:
        language === "ar"
          ? "ألم الصدر قد يكون خطيراً إذا كان شديداً أو مع ضيق نفس أو تعرق أو دوخة.\n\nافعل التالي:\n1. اتصل بالإسعاف إذا كان الألم شديداً أو مستمراً\n2. أوقف أي مجهود واجلس في وضع مريح\n3. راقب التنفس والوعي\n4. لا تتجاهل الألم إذا كان جديداً أو مختلفاً"
          : "Chest pain can be serious, especially if it is severe or comes with shortness of breath, sweating, or dizziness.\n\nDo this:\n1. Call emergency services if the pain is severe or persistent\n2. Stop exertion and sit in a comfortable position\n3. Monitor breathing and consciousness\n4. Do not ignore pain that is new or different",
      followUpQuestions: [
        language === "ar" ? "هل الألم شديد أو ممتد للذراع أو الفك؟" : "Is the pain severe or spreading to the arm or jaw?"
      ],
      isEmergency: true,
      intent: "emergency",
      keywords: ["chest_pain"]
    };
  }

  return null;
};

const buildEmergencyFallback = (language: ResponseLanguage, userMessage: string) => {
  const normalized = userMessage.toLowerCase();
  const notBreathingCase = containsNoBreathing(normalized);
  const unconsciousButBreathingCase = containsUnconscious(normalized) && containsBreathing(normalized) && !notBreathingCase;

  if (language === "ar") {
    return {
      response: notBreathingCase
        ? "هذه حالة طارئة مهددة للحياة. اتصل بالإسعاف فوراً الآن. إذا كان الشخص لا يتنفس ولا يستجيب، ابدأ الإنعاش القلبي الرئوي فوراً."
        : unconsciousButBreathingCase
          ? "هذه حالة طارئة خطيرة. اتصل بالإسعاف فوراً الآن. إذا كان الشخص فاقد الوعي لكنه يتنفس، ضعه في وضعية التعافي وراقب التنفس باستمرار. لا تبدأ CPR ما دام يتنفس."
          : "قد تكون هذه حالة طارئة خطيرة. اتصل بالإسعاف فوراً الآن واتبع تعليماتهم حتى وصول الطاقم الطبي.",
      followUpQuestions: [
        "ما هو موقعك الدقيق الآن؟",
        "هل الشخص يتنفس حالياً؟",
        "هل يوجد نزيف شديد أو إصابة خطيرة؟"
      ],
      sources: [
        {
          title: "WHO Emergency Care",
          url: "https://www.who.int/health-topics/emergency-care"
        }
      ]
    };
  }

  return {
    response: notBreathingCase
      ? "This is a life-threatening emergency. Call emergency services NOW. Start CPR immediately if the person is not breathing and unresponsive."
      : unconsciousButBreathingCase
        ? "This is a serious emergency. Call emergency services immediately. If the person is unconscious but breathing, place them in the recovery position and keep monitoring breathing. Do not start CPR while they are breathing."
        : "This may be a serious emergency. Call emergency services immediately and follow dispatcher instructions.",
    followUpQuestions: [
      "What is your exact location right now?",
      "Is the person breathing now?",
      "Is there severe bleeding or major trauma?"
    ],
    sources: [
      {
        title: "WHO Emergency Care",
        url: "https://www.who.int/health-topics/emergency-care"
      }
    ]
  };
};

const buildNonEmergencyFallback = (language: ResponseLanguage) => {
  if (language === "ar") {
    return {
      response:
        "سأساعدك بخطوات أولية آمنة. هذه معلومات عامة وليست تشخيصاً. إذا ساءت الأعراض أو ظهرت علامات خطورة، اتصل بالإسعاف فوراً.",
      followUpQuestions: [
        "منذ متى بدأت الأعراض؟",
        "ما شدة الأعراض من 1 إلى 10؟",
        "هل يوجد ضيق تنفس أو ألم صدر أو إغماء؟"
      ],
      sources: [
        {
          title: "MedlinePlus",
          url: "https://medlineplus.gov"
        }
      ]
    };
  }

  return {
    response:
      "I can guide you with safe first-aid steps. This is general information, not a diagnosis. If symptoms worsen or danger signs appear, call emergency services immediately.",
    followUpQuestions: [
      "When did the symptoms start?",
      "How severe are symptoms on a 1-10 scale?",
      "Any chest pain, breathing trouble, or fainting?"
    ],
    sources: [
      {
        title: "MedlinePlus",
        url: "https://medlineplus.gov"
      }
    ]
  };
};

const buildRuleBasedFallback = (
  userMessage: string,
  context: Partial<ConversationContext>
): {
  response: string;
  language: Language;
  responseLanguage: ResponseLanguage;
  isEmergency: boolean;
  preprocessed: boolean;
  needsFollowUp: boolean;
  followUpQuestions: string[];
  sources: TrustedSource[];
  analysis: AssistantAnalysis;
} => {
  const historyText = (context.history || []).map((item) => item.content).join(" ");
  const combinedText = `${historyText} ${userMessage}`.trim();

  const language = detectLanguageFromText(combinedText || userMessage);
  const responseLanguage: ResponseLanguage = language === "ar" ? "ar" : "en";
  const emergencySignals = detectEmergencySignals(combinedText || userMessage);

  if (emergencySignals.isEmergency) {
    const emergencyFallback = buildEmergencyFallback(responseLanguage, userMessage);

    return {
      response: emergencyFallback.response,
      language,
      responseLanguage,
      isEmergency: true,
      preprocessed: true,
      needsFollowUp: true,
      followUpQuestions: emergencyFallback.followUpQuestions,
      sources: emergencyFallback.sources,
      analysis: defaultAnalysis("emergency", emergencySignals.labels)
    };
  }

  const nonEmergencyFallback = buildNonEmergencyFallback(responseLanguage);
  return {
    response: nonEmergencyFallback.response,
    language,
    responseLanguage,
    isEmergency: false,
    preprocessed: true,
    needsFollowUp: true,
    followUpQuestions: nonEmergencyFallback.followUpQuestions,
    sources: nonEmergencyFallback.sources,
    analysis: defaultAnalysis("medical_question")
  };
};

const buildContextualFallbackFromMessages = (
  messages: AssistantChatMessage[]
): {
  response: string;
  language: Language;
  responseLanguage: ResponseLanguage;
  isEmergency: boolean;
  preprocessed: boolean;
  needsFollowUp: boolean;
  followUpQuestions: string[];
  sources: TrustedSource[];
  analysis: AssistantAnalysis;
} => {
  const cleaned = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content.trim()
    }))
    .filter((message) => message.content.length > 0)
    .slice(-40);

  const userMessages = cleaned.filter((message) => message.role === "user").map((message) => message.content);
  const lastUserMessage = userMessages[userMessages.length - 1] || "";
  const previousUserContext = userMessages.slice(0, -1).join(" ");
  const allUserContext = `${previousUserContext} ${lastUserMessage}`.trim();
  const knownSymptoms = extractSymptomsFromText(allUserContext);
  const currentSymptoms = extractSymptomsFromText(lastUserMessage);
  const durationText = extractDurationText(allUserContext);
  const severityText = extractSeverityText(allUserContext);
  const medicationText = extractMedicationText(allUserContext);
  const hasRelevantPreviousContext = previousUserContext.trim().length > 0 && extractSymptomsFromText(previousUserContext).length > 0;

  const language = detectLanguageFromText(allUserContext || lastUserMessage || "help");
  const responseLanguage: ResponseLanguage = language === "ar" ? "ar" : "en";
  const emergencySignals = detectEmergencySignals(allUserContext || lastUserMessage);
  const directAnswer = buildDirectFirstAidAnswer(lastUserMessage, responseLanguage);

  if (directAnswer) {
    return {
      response: directAnswer.response,
      language,
      responseLanguage,
      isEmergency: directAnswer.isEmergency,
      preprocessed: true,
      needsFollowUp: directAnswer.followUpQuestions.length > 0,
      followUpQuestions: directAnswer.followUpQuestions,
      sources: [],
      analysis: defaultAnalysis(directAnswer.intent, directAnswer.keywords)
    };
  }

  if (emergencySignals.isEmergency) {
    const emergencyFallback = buildEmergencyFallback(responseLanguage, lastUserMessage || allUserContext);
    return {
      response: emergencyFallback.response,
      language,
      responseLanguage,
      isEmergency: true,
      preprocessed: true,
      needsFollowUp: true,
      followUpQuestions: emergencyFallback.followUpQuestions,
      sources: emergencyFallback.sources,
      analysis: defaultAnalysis("emergency", emergencySignals.labels)
    };
  }

  if (isThanks(lastUserMessage)) {
    return {
      response:
        responseLanguage === "ar"
          ? "على الرحب والسعة. إذا أردت، كمل معي واكتب الأعراض الأساسية أو أي تغير جديد حصل عليك."
          : "You're welcome. If you want, continue by telling me the main symptoms or any new change you noticed.",
      language,
      responseLanguage,
      isEmergency: false,
      preprocessed: true,
      needsFollowUp: false,
      followUpQuestions: [],
      sources: [],
      analysis: defaultAnalysis("general")
    };
  }

  if (isGreeting(lastUserMessage) && knownSymptoms.length === 0) {
    return {
      response:
        responseLanguage === "ar"
          ? "مرحبا، أنا معك. احكيلي باختصار شو المشكلة الطبية أو شو الأعراض اللي عندك الآن، مثل حرارة، كحة، صداع، غثيان، ألم، أو ضيق نفس."
          : "Hello, I'm here with you. Tell me briefly what medical problem or symptoms you have right now, like fever, cough, headache, nausea, pain, or breathing trouble.",
      language,
      responseLanguage,
      isEmergency: false,
      preprocessed: true,
      needsFollowUp: true,
      followUpQuestions: [],
      sources: [],
      analysis: defaultAnalysis("general")
    };
  }

  if (isVagueHelpRequest(lastUserMessage) && knownSymptoms.length === 0) {
    return {
      response:
        responseLanguage === "ar"
          ? "احكيلي شو اللي مضايقك الآن تحديداً. اكتب الأعراض الأساسية مثل حرارة، صداع، كحة، ألم بطن، غثيان، أو ضيق نفس، وأنا سأكمل معك خطوة بخطوة."
          : "Tell me exactly what is bothering you right now. Write the main symptoms such as fever, headache, cough, stomach pain, nausea, or breathing trouble, and I'll continue with you step by step.",
      language,
      responseLanguage,
      isEmergency: false,
      preprocessed: true,
      needsFollowUp: false,
      followUpQuestions: [],
      sources: [],
      analysis: defaultAnalysis("general")
    };
  }

  if (knownSymptoms.length === 0) {
    return {
      response:
        responseLanguage === "ar"
          ? "لم أفهم الأعراض بعد بشكل كافٍ. اكتب لي العرض الأساسي بكلمة أو جملة قصيرة مثل: عندي حرارة، صداع، كحة، غثيان، ألم بطن، أو ضيق نفس."
          : "I still do not clearly understand the symptoms. Write the main symptom in one short sentence, for example: I have fever, headache, cough, nausea, stomach pain, or breathing trouble.",
      language,
      responseLanguage,
      isEmergency: false,
      preprocessed: true,
      needsFollowUp: false,
      followUpQuestions: [],
      sources: [],
      analysis: defaultAnalysis("unclear")
    };
  }

  const hasDuration =
    /\b\d+\s*(hour|hours|day|days|week|weeks)\b|since|for\s+\d+|منذ|يوم|أيام|ساعة|ساعات|أسبوع|أسابيع/i.test(
      allUserContext
    );
  const hasSeverity =
    /\b(10|[1-9])\s*\/\s*10\b|severity|شدة|مقياس|درجة/i.test(allUserContext);
  const hasMedication = /\b(paracetamol|acetaminophen|ibuprofen|aspirin|medicine|medication|دواء|باراسيتامول)\b/i.test(
    allUserContext
  );
  const hasRedFlags =
    /chest pain|shortness of breath|faint|unconscious|seizure|نزيف|ضيق تنفس|ألم صدر|إغماء|تشنج|فاقد الوعي/i.test(
      allUserContext
    );
  const questionInput = isQuestion(lastUserMessage);
  const asksWhatToDo = /what should i do|what can i do|what do i do|ماذا أفعل|شو أعمل|شو اعمل|كيف أتصرف/i.test(
    lastUserMessage
  );

  const followUpQuestions: string[] =
    responseLanguage === "ar"
      ? [
          ...(!hasDuration ? ["متى بدأت هذه الأعراض بالضبط؟"] : []),
          ...(!hasSeverity ? ["ما الشدة الآن من 1 إلى 10؟"] : []),
          ...(!hasMedication ? ["هل أخذت دواء لها أو عندك حساسية دوائية؟"] : []),
          ...(!hasRedFlags ? ["هل يوجد الآن ضيق تنفس أو ألم صدر أو دوخة شديدة؟"] : [])
        ].slice(0, questionInput ? 2 : 2)
      : [
          ...(!hasDuration ? ["Please confirm exactly when each symptom started."] : []),
          ...(!hasSeverity ? ["What is the current severity from 1 to 10?"] : []),
          ...(!hasMedication ? ["Did you take any medication, and do you have drug allergies?"] : []),
          ...(!hasRedFlags ? ["Any chest pain, breathing trouble, or severe dizziness right now?"] : [])
        ].slice(0, questionInput ? 2 : 2);

  const symptomSummary = formatSymptomList(knownSymptoms, responseLanguage);
  const responsePrefix =
    responseLanguage === "ar"
      ? hasRelevantPreviousContext
        ? `فهمت من كلامك السابق أن عندك ${formatSymptomList(extractSymptomsFromText(previousUserContext), "ar")}. `
        : ""
      : hasRelevantPreviousContext
        ? `I remember you mentioned ${formatSymptomList(extractSymptomsFromText(previousUserContext), "en")} earlier. `
        : "";

  let guidanceBody =
    responseLanguage === "ar"
      ? asksWhatToDo
        ? `هذه الخطوات المناسبة الآن لحالة ${symptomSummary}:\n`
        : `بالنسبة إلى ${symptomSummary}: `
      : asksWhatToDo
        ? `These are the right steps now for ${symptomSummary}:\n`
        : `For ${symptomSummary}: `;

  if (knownSymptoms.includes("fever") || knownSymptoms.includes("headache")) {
    guidanceBody +=
      responseLanguage === "ar"
        ? asksWhatToDo
          ? "1. ارتح واشرب سوائل\n2. راقب الحرارة كل عدة ساعات\n"
          : "اهتم بالراحة، اشرب سوائل، وراقب الحرارة. "
        : asksWhatToDo
          ? "1. Rest and drink fluids\n2. Monitor the temperature every few hours\n"
          : "Focus on rest, fluids, and monitoring the temperature. ";
  }

  if (knownSymptoms.includes("nausea") || knownSymptoms.includes("vomiting")) {
    guidanceBody +=
      responseLanguage === "ar"
        ? asksWhatToDo
          ? "3. خذ رشفات ماء أو محلول أملاح بكميات صغيرة ومتكررة\n"
          : "خذ رشفات ماء أو محلول أملاح بكميات صغيرة ومتكررة. "
        : asksWhatToDo
          ? "3. Take small frequent sips of water or oral rehydration solution\n"
          : "Take small frequent sips of water or oral rehydration solution. ";
  }

  if (knownSymptoms.includes("cough") || knownSymptoms.includes("sore_throat")) {
    guidanceBody +=
      responseLanguage === "ar"
        ? asksWhatToDo
          ? "4. جرب سوائل دافئة وراحة وتجنب المجهود\n"
          : "السوائل الدافئة والراحة قد تساعد مؤقتاً. "
        : asksWhatToDo
          ? "4. Try warm fluids, rest, and avoid exertion\n"
          : "Warm fluids and rest may help temporarily. ";
  }

  if (knownSymptoms.includes("stomach_pain") || knownSymptoms.includes("diarrhea")) {
    guidanceBody +=
      responseLanguage === "ar"
        ? asksWhatToDo
          ? "5. تجنب الأكل الثقيل حالياً وركز على السوائل\n"
          : "تجنب الأكل الثقيل حالياً وركز على السوائل. "
        : asksWhatToDo
          ? "5. Avoid heavy food for now and focus on hydration\n"
          : "Avoid heavy food for now and focus on hydration. ";
  }

  if (medicationText && (currentSymptoms.includes("nausea") || currentSymptoms.includes("vomiting"))) {
    guidanceBody +=
      responseLanguage === "ar"
        ? `بما أنك ذكرت ${medicationText} مع غثيان أو استفراغ، خذه مع الطعام فقط إذا كان مناسباً لك، وأوقفه واطلب تقييماً طبياً إذا زادت الأعراض أو ظهر طفح أو ضيق نفس. `
        : `Since you mentioned ${medicationText} with nausea or vomiting, take it only with food if appropriate for you, and stop it and seek medical evaluation if symptoms worsen or you develop rash or breathing trouble. `;
  }

  if (IMPROVING_PATTERNS.test(lastUserMessage)) {
    guidanceBody +=
      responseLanguage === "ar"
        ? "كون بعض الأعراض تحسنت فهذا مطمئن جزئياً، لكن راقب أي عرض جديد. "
        : "Since some symptoms improved, that is somewhat reassuring, but keep watching for any new symptom. ";
  }

  if (WORSENING_PATTERNS.test(lastUserMessage)) {
    guidanceBody +=
      responseLanguage === "ar"
        ? "بما أن الوضع يزداد سوءاً، إذا استمر التدهور فاطلب تقييماً طبياً اليوم. "
        : "Because the situation is getting worse, seek medical evaluation today if the worsening continues. ";
  }

  if (durationText) {
    guidanceBody +=
      responseLanguage === "ar"
        ? `ذكرت أن المدة تقريباً ${durationText}. `
        : `You mentioned the duration is about ${durationText}. `;
  }

  if (severityText) {
    guidanceBody +=
      responseLanguage === "ar"
        ? `والشدة الحالية تبدو ${severityText}. `
        : `The current severity sounds like ${severityText}. `;
  }

  guidanceBody +=
    responseLanguage === "ar"
      ? "إذا ظهر ألم صدر شديد أو ضيق نفس واضح أو إغماء، اتصل بالإسعاف فوراً."
      : "If severe chest pain, clear breathing trouble, or fainting appears, call emergency services immediately.";

  return {
    response: `${responsePrefix}${guidanceBody}`.trim(),
    language,
    responseLanguage,
    isEmergency: false,
    preprocessed: true,
    needsFollowUp: followUpQuestions.length > 0,
    followUpQuestions,
    sources: [
      {
        title: "MedlinePlus",
        url: "https://medlineplus.gov"
      }
    ],
    analysis: defaultAnalysis("medical_question")
  };
};

export class AIAssistantService {
  static async getResponseFromMessages(
    messages: AssistantChatMessage[]
  ): Promise<{
    response: string;
    language: Language;
    responseLanguage: ResponseLanguage;
    isEmergency: boolean;
    preprocessed: boolean;
    needsFollowUp: boolean;
    followUpQuestions: string[];
    sources: TrustedSource[];
    analysis: AssistantAnalysis;
  }> {
    const sanitized = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role,
        content: message.content.trim()
      }))
      .filter((message) => message.content.length > 0)
      .slice(-40);

    const lastUser = [...sanitized].reverse().find((message) => message.role === "user")?.content ?? "";
    const fallback = buildContextualFallbackFromMessages(sanitized);

    if (!client || shouldBypassOpenAI()) {
      return fallback;
    }

    const systemPrompt = `You are a real first-aid and medical assistant with strong GPT-4-level reasoning quality.

Think carefully before answering, but return only the final answer.

Behavior rules:
- Detect whether the user is speaking Arabic or English and reply in the same language.
- Never repeat a welcome message after the first interaction.
- If the user asks a question, answer it directly first.
- Ask at most 1-2 smart follow-up questions only when necessary.
- If the input is unclear, ask a specific clarification question instead of giving a generic reply.
- Keep the response calm, clear, structured, and step-by-step when useful.
- Avoid generic template phrasing. Be specific to the exact scenario and details already mentioned in the conversation.

Emergency rules:
- If the person is breathing, do NOT recommend CPR.
- If the person is unconscious but breathing, tell the user to place them in the recovery position, monitor breathing, and call emergency services.
- If the person is not breathing normally and unresponsive, tell the user to call emergency services and start CPR.
- For severe bleeding, chest pain, breathing difficulty, or unconsciousness, clearly warn about emergency services while still giving safe first-aid steps.`;

    try {
      const modelResponse = await client.chat.completions.create({
        model: env.openaiModel || "gpt-4.1",
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          ...sanitized
        ]
      });

      const responseText = modelResponse.choices[0]?.message?.content?.trim();
      if (!responseText) {
        return fallback;
      }

      if (isGenericResponse(responseText, sanitized.length)) {
        return fallback;
      }

      const fullConversationText = sanitized.map((message) => message.content).join(" ");
      const detectedLanguage = detectLanguageFromText(lastUser || fullConversationText || responseText);
      const responseLanguage: ResponseLanguage =
        /[\u0600-\u06FF]/.test(responseText) ? "ar" : detectedLanguage === "ar" ? "ar" : "en";
      const emergencySignals = detectEmergencySignals(`${fullConversationText}\n${responseText}`);
      const followUpQuestions = extractFollowUpQuestions(responseText);

      let response = responseText;
      if (emergencySignals.isEmergency && !/call emergency services|اتصل بالإسعاف|اتصل بالطوارئ/i.test(response)) {
        response +=
          responseLanguage === "ar"
            ? "\n\nهذه حالة طارئة محتملة. اتصل بالإسعاف فوراً الآن."
            : "\n\nThis may be an emergency. Call emergency services immediately.";
      }

      return {
        response,
        language: detectedLanguage,
        responseLanguage,
        isEmergency: emergencySignals.isEmergency,
        preprocessed: false,
        needsFollowUp: followUpQuestions.length > 0,
        followUpQuestions,
        sources: [],
        analysis: defaultAnalysis(emergencySignals.isEmergency ? "emergency" : "medical_question", emergencySignals.labels)
      };
    } catch (error) {
      const details = extractOpenAIError(error);
      if (
        details.status === 429 ||
        details.code === "insufficient_quota" ||
        details.type === "insufficient_quota"
      ) {
        const cooldownMs =
          details.code === "insufficient_quota" || details.type === "insufficient_quota"
            ? 60 * 60 * 1000
            : 2 * 60 * 1000;
        setOpenAICooldown(cooldownMs);
      } else if (details.status === 401 || details.code === "invalid_api_key") {
        setOpenAICooldown(60 * 60 * 1000);
      }

      console.error("AI assistant model call failed:", details);
      return fallback;
    }
  }

  static async getResponse(
    userMessage: string,
    context: Partial<ConversationContext> = {}
  ): Promise<{
    response: string;
    language: Language;
    responseLanguage: ResponseLanguage;
    isEmergency: boolean;
    preprocessed: boolean;
    needsFollowUp: boolean;
    followUpQuestions: string[];
    sources: TrustedSource[];
    analysis: AssistantAnalysis;
  }> {
    const history = context.history || [];

    if (!client) {
      return buildContextualFallbackFromMessages([
        ...history,
        {
          role: "user",
          content: userMessage
        }
      ]);
    }

    if (shouldBypassOpenAI()) {
      return buildContextualFallbackFromMessages([
        ...history,
        {
          role: "user",
          content: userMessage
        }
      ]);
    }

    try {
      const systemPrompt = `You are an expert AI first-aid and medical assistant with GPT-4-level reasoning quality.

Think carefully before answering, but return only the final JSON object.

Core behavior:
- Detect whether the user is speaking Arabic or English and reply in the same language.
- Never repeat a welcome message after the first interaction.
- If the user asks a question, answer it directly first.
- Ask at most 1-2 relevant follow-up questions only when necessary.
- If the input is unclear, ask a specific clarification question instead of giving generic text.
- Keep responses calm, practical, structured, and step-by-step when useful.
- Avoid generic template wording. Make the answer specific to the exact user question and the conversation context.
- Never provide a definitive diagnosis.

Safety rules:
- If the person is breathing, do NOT recommend CPR.
- If the person is unconscious but breathing, recommend the recovery position, breathing monitoring, and calling emergency services.
- If the person is not breathing normally and is unresponsive, advise calling emergency services and starting CPR.
- For severe bleeding, breathing difficulty, chest pain, or unconsciousness, clearly warn about emergency services while still giving safe first-aid steps.

Return ONLY valid JSON in this exact structure:
{
  "assistantResponse": "string",
  "analysis": {
    "inputLanguage": "ar" | "en" | "mixed",
    "responseLanguage": "ar" | "en",
    "isEmergency": boolean,
    "intent": "medical_question" | "emergency" | "appointment" | "general" | "unclear",
    "confidence": 0.0-1.0,
    "keywords": ["..."],
    "entities": {
      "symptoms": ["..."],
      "bodyParts": ["..."],
      "medicines": ["..."],
      "conditions": ["..."]
    },
    "needsFollowUp": boolean,
    "followUpQuestions": ["..."],
    "sources": [{"title":"...","url":"https://..."}]
  }
}`;

      const conversationMessages = history.slice(-30).map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content
      }));

      const modelResponse = await client.chat.completions.create({
        model: env.openaiModel || "gpt-4.1",
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          ...conversationMessages,
          {
            role: "user",
            content: userMessage
          }
        ]
      });

      const content = modelResponse.choices[0]?.message?.content?.trim();
      if (!content) {
        return buildContextualFallbackFromMessages([
          ...history,
          {
            role: "user",
            content: userMessage
          }
        ]);
      }

      const parsed = JSON.parse(content) as {
        assistantResponse?: unknown;
        analysis?: {
          inputLanguage?: unknown;
          responseLanguage?: unknown;
          isEmergency?: unknown;
          intent?: unknown;
          confidence?: unknown;
          keywords?: unknown;
          entities?: {
            symptoms?: unknown;
            bodyParts?: unknown;
            medicines?: unknown;
            conditions?: unknown;
          };
          needsFollowUp?: unknown;
          followUpQuestions?: unknown;
          sources?: unknown;
        };
      };

      const rawAnalysis = parsed.analysis ?? {};
      const analysis: AssistantAnalysis = {
        intent: VALID_INTENTS.includes(rawAnalysis.intent as AssistantIntent)
          ? (rawAnalysis.intent as AssistantIntent)
          : "medical_question",
        confidence: clampConfidence(rawAnalysis.confidence),
        keywords: asStringArray(rawAnalysis.keywords),
        entities: {
          symptoms: asStringArray(rawAnalysis.entities?.symptoms),
          bodyParts: asStringArray(rawAnalysis.entities?.bodyParts),
          medicines: asStringArray(rawAnalysis.entities?.medicines),
          conditions: asStringArray(rawAnalysis.entities?.conditions)
        }
      };

      const language = isLanguage(rawAnalysis.inputLanguage)
        ? rawAnalysis.inputLanguage
        : detectLanguageFromText(userMessage);

      const responseLanguage = isResponseLanguage(rawAnalysis.responseLanguage)
        ? rawAnalysis.responseLanguage
        : language === "ar"
          ? "ar"
          : "en";

      const emergencySignals = detectEmergencySignals(`${history.map((item) => item.content).join(" ")} ${userMessage}`);
      const modelEmergency = Boolean(rawAnalysis.isEmergency);
      const isEmergency = modelEmergency || emergencySignals.isEmergency;

      const followUpQuestions = asStringArray(rawAnalysis.followUpQuestions, 3);
      const sources = normalizeSources(rawAnalysis.sources);
      const assistantResponse = typeof parsed.assistantResponse === "string" ? parsed.assistantResponse.trim() : "";
      if (assistantResponse && isGenericResponse(assistantResponse, history.length + 1)) {
        return buildContextualFallbackFromMessages([
          ...history,
          {
            role: "user",
            content: userMessage
          }
        ]);
      }

      let response =
        assistantResponse ||
        (responseLanguage === "ar"
          ? "لم أتمكن من إنشاء رد واضح. يرجى إعادة صياغة سؤالك بتفاصيل أكثر."
          : "I could not generate a clear response. Please try again with more details.");

      if (isEmergency && !/call emergency services|اتصل بالإسعاف|اتصل بالطوارئ/i.test(response)) {
        response +=
          responseLanguage === "ar"
            ? "\n\nهذه حالة طارئة محتملة. اتصل بالإسعاف فوراً الآن."
            : "\n\nThis may be an emergency. Call emergency services immediately.";
      }

      return {
        response,
        language,
        responseLanguage,
        isEmergency,
        preprocessed: false,
        needsFollowUp: Boolean(rawAnalysis.needsFollowUp) || followUpQuestions.length > 0,
        followUpQuestions,
        sources,
        analysis
      };
    } catch (error) {
      const details = extractOpenAIError(error);
      if (
        details.status === 429 ||
        details.code === "insufficient_quota" ||
        details.type === "insufficient_quota"
      ) {
        const cooldownMs =
          details.code === "insufficient_quota" || details.type === "insufficient_quota"
            ? 60 * 60 * 1000
            : 2 * 60 * 1000;
        setOpenAICooldown(cooldownMs);
      } else if (details.status === 401 || details.code === "invalid_api_key") {
        setOpenAICooldown(60 * 60 * 1000);
      }

      console.error("AI assistant model call failed:", details);
      return buildContextualFallbackFromMessages([
        ...history,
        {
          role: "user",
          content: userMessage
        }
      ]);
    }
  }
}

export default AIAssistantService;
