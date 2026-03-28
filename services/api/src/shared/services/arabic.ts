/**
 * Arabic + bilingual text utilities for medical chat.
 * Supports MSA, common Arabic dialect spellings, and noisy casual text.
 */

const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670\u0640]/;
const ARABIC_DIACRITICS_GLOBAL = /[\u064B-\u0652\u0670\u0640]/g;
const ARABIC_LETTER_RANGE = /[\u0600-\u06FF]/;

const DIALECT_NORMALIZATION_RULES: Array<{ from: string; to: string }> = [
  // Levantine
  { from: "شو", to: "ماذا" },
  { from: "ايش", to: "ماذا" },
  { from: "ليش", to: "لماذا" },
  { from: "وين", to: "أين" },
  { from: "هلا", to: "مرحبا" },
  { from: "شو في", to: "ماذا يوجد" },

  // Egyptian
  { from: "مش", to: "ليس" },
  { from: "عايز", to: "أريد" },
  { from: "عاوزه", to: "أريد" },
  { from: "مفيش", to: "لا يوجد" },
  { from: "عندي سخونية", to: "لدي حمى" },

  // Gulf
  { from: "شنو", to: "ماذا" },
  { from: "شلون", to: "كيف" },
  { from: "ما اقدر", to: "لا أستطيع" },

  // General colloquial
  { from: "وجع راس", to: "صداع" },
  { from: "بطني يوجعني", to: "ألم في البطن" },
  { from: "نفسي ضايق", to: "ضيق تنفس" }
];

const SPELLING_CORRECTIONS: Array<{ from: RegExp; to: string }> = [
  { from: /حمي/g, to: "حمى" },
  { from: /حمه/g, to: "حمى" },
  { from: /سخونيه/g, to: "حمى" },
  { from: /سخونة/g, to: "حمى" },
  { from: /اسهال/g, to: "إسهال" },
  { from: /غتيان/g, to: "غثيان" },
  { from: /دوخه/g, to: "دوخة" },
  { from: /اعراض/g, to: "أعراض" }
];

const normalizeArabicLetters = (text: string): string =>
  text
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");

const cleanWhitespaceAndPunctuation = (text: string): string =>
  text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const replacePhrase = (text: string, phrase: string, replacement: string): string => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "gi");
  return text.replace(expression, (_match, leadingSpace: string) => `${leadingSpace}${replacement}`);
};

export const removeDiacritics = (text: string): string => text.replace(ARABIC_DIACRITICS_GLOBAL, "");

/**
 * Normalize Arabic and mixed text for matching and keyword extraction.
 */
export const normalizeArabic = (text: string): string => {
  const lowered = text.toLowerCase();
  const noDiacritics = removeDiacritics(lowered);
  const normalizedLetters = normalizeArabicLetters(noDiacritics);
  return cleanWhitespaceAndPunctuation(normalizedLetters);
};

export const isArabic = (text: string): boolean => ARABIC_LETTER_RANGE.test(text);

/**
 * Basic language detection based on script density.
 */
export const detectLanguage = (text: string): "ar" | "en" | "mixed" => {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;

  if (arabicChars > 0 && englishChars === 0) {
    return "ar";
  }

  if (englishChars > 0 && arabicChars === 0) {
    return "en";
  }

  if (arabicChars === 0 && englishChars === 0) {
    return "en";
  }

  return "mixed";
};

/**
 * Normalize common dialect phrases into clearer MSA-style phrasing.
 */
export const normalizeDialect = (text: string): string => {
  const normalizedInput = normalizeArabic(text);
  return DIALECT_NORMALIZATION_RULES.reduce(
    (current, rule) => replacePhrase(current, normalizeArabic(rule.from), normalizeArabic(rule.to)),
    normalizedInput
  );
};

export const tokenizeArabic = (text: string): string[] =>
  normalizeArabic(text)
    .split(/\s+/)
    .filter(Boolean);

export const getArabicBase = (text: string): string => normalizeArabic(text);

export const isMedicalArabic = (text: string): boolean => {
  const medicalTerms = [
    "حمى",
    "صداع",
    "سعال",
    "الم",
    "دوخه",
    "غثيان",
    "قيء",
    "طفح",
    "حساسيه",
    "ضغط",
    "سكري",
    "دواء",
    "اعراض",
    "التهاب",
    "المعده",
    "صدر",
    "تنفس"
  ];

  const normalized = normalizeArabic(text);
  return medicalTerms.some((term) => normalized.includes(term));
};

export const correctArabicSpelling = (text: string): string => {
  const normalized = normalizeArabic(text);
  return SPELLING_CORRECTIONS.reduce((current, rule) => current.replace(rule.from, rule.to), normalized);
};

export const preprocessArabicText = (text: string): {
  original: string;
  normalized: string;
  tokenized: string[];
  language: "ar" | "en" | "mixed";
  hasDiacritics: boolean;
  isArabicText: boolean;
} => {
  const normalized = normalizeDialect(correctArabicSpelling(text));
  return {
    original: text,
    normalized,
    tokenized: normalized.split(/\s+/).filter(Boolean),
    language: detectLanguage(text),
    hasDiacritics: ARABIC_DIACRITICS.test(text),
    isArabicText: isArabic(text)
  };
};
