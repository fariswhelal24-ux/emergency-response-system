/**
 * Advanced Spell Correction & Text Normalization
 * Uses edit distance and Arabic language rules
 */

import { removeDiacritics } from "./arabic";

// Medical terms dictionary for spell correction
const MEDICAL_DICTIONARY: { [key: string]: string[] } = {
  "حمى": ["حمي", "حمه", "حمة", "حمو"],
  "صداع": ["صدع", "صده"],
  "سعال": ["سعل", "سعله"],
  "ألم": ["الم", "الم", "الام"],
  "غثيان": ["غثيان", "غثيين"],
  "قيء": ["قيا", "قياء"],
  "حساسية": ["حساسه", "حساسيه"],
  "إسهال": ["اسهال", "إسهال", "اسهل"],
  "برد": ["بر", "برد"],
  "إنفلونزا": ["انفلونزا", "فلونزا", "انفلوا"],
  "طبيب": ["طبيب", "طبيب"],
  "مرض": ["مرض", "مريض"],
  "دواء": ["دوا", "دوة", "دواء"],
  "عيادة": ["عياده", "عيادة"],
  "مستشفى": ["مستشفي", "مستشفة"],
};

// English medical dictionary
const ENGLISH_MEDICAL_DICTIONARY: { [key: string]: string[] } = {
  fever: ["fiverr", "feverr", "feaver", "fever"],
  headache: ["headach", "headake", "hedache"],
  cough: ["cof", "coff", "cougth"],
  pain: ["pan", "pane", "pain"],
  nausea: ["nausea", "nauseau"],
  medicine: ["medicin", "medecin"],
  doctor: ["docktor", "docter"],
  disease: ["desease", "deasease"],
};

/**
 * Calculate Levenshtein distance (edit distance) between two strings
 */
export const levenshteinDistance = (str1: string, str2: string): number => {
  const track = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // insertion
        track[j - 1][i] + 1, // deletion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return track[str2.length][str1.length];
};

/**
 * Find closest match from dictionary
 */
const findClosestMatch = (word: string, dictionary: { [key: string]: string[] }): string | null => {
  let closestWord: string | null = null;
  let minDistance = Infinity;

  // Direct lookup
  if (dictionary[word]) {
    return word;
  }

  // Check variations
  for (const [standardForm, variations] of Object.entries(dictionary)) {
    for (const variation of variations) {
      const distance = levenshteinDistance(word.toLowerCase(), variation.toLowerCase());
      if (distance < minDistance && distance <= 2) {
        // Allow up to 2 edits
        minDistance = distance;
        closestWord = standardForm;
      }
    }
  }

  return closestWord;
};

/**
 * Correct spelling of a word
 */
export const correctWord = (word: string, isArabic: boolean = false): string => {
  if (word.length <= 2) {
    return word;
  }

  if (isArabic) {
    const normalized = removeArabicDiacritics(word);
    const corrected = findClosestMatch(normalized, MEDICAL_DICTIONARY);
    return corrected || word;
  } else {
    const corrected = findClosestMatch(word, ENGLISH_MEDICAL_DICTIONARY);
    return corrected || word;
  }
};

/**
 * Remove Arabic diacritics
 */
const removeArabicDiacritics = (text: string): string => {
  return removeDiacritics(text);
};

/**
 * Correct entire text
 */
export const correctText = (text: string): {
  original: string;
  corrected: string;
  changes: number;
  corrections: Array<{
    original: string;
    corrected: string;
    position: number;
  }>;
} => {
  const isArabic = /[\u0600-\u06FF]/.test(text);
  const words = text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const corrections: Array<{ original: string; corrected: string; position: number }> = [];

  let position = 0;
  const correctedWords = words.map((word) => {
    const originalWord = word;
    const normalizedWord = word.replace(/[^\p{L}\p{N}]/gu, "");
    const correctedBase = correctWord(normalizedWord, isArabic);
    const corrected = normalizedWord.length > 0 ? word.replace(normalizedWord, correctedBase) : word;

    if (corrected !== originalWord) {
      corrections.push({
        original: originalWord,
        corrected,
        position,
      });
    }

    position += word.length + 1;
    return corrected;
  });

  return {
    original: text,
    corrected: correctedWords.join(" "),
    changes: corrections.length,
    corrections,
  };
};

/**
 * Suggest corrections for a word
 */
export const suggestCorrections = (word: string, isArabic: boolean = false): string[] => {
  const dictionary = isArabic ? MEDICAL_DICTIONARY : ENGLISH_MEDICAL_DICTIONARY;
  const suggestions: Array<{ word: string; distance: number }> = [];

  for (const [standardForm, variations] of Object.entries(dictionary)) {
    for (const variation of variations) {
      const distance = levenshteinDistance(word.toLowerCase(), variation.toLowerCase());
      if (distance <= 2 && distance > 0) {
        suggestions.push({ word: standardForm, distance });
      }
    }
  }

  // Sort by distance and return top 5
  return suggestions
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map((s) => s.word);
};

/**
 * Interactive spell correction with confidence score
 */
export const spellCheckWithConfidence = (text: string): {
  text: string;
  score: number; // 0-1, where 1 is perfect spelling
  errors: Array<{
    word: string;
    suggestions: string[];
    position: number;
    confidence: number;
  }>;
} => {
  const isArabic = /[\u0600-\u06FF]/.test(text);
  const words = text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const errors: Array<{
    word: string;
    suggestions: string[];
    position: number;
    confidence: number;
  }> = [];

  let position = 0;
  let totalDistance = 0;

  words.forEach((word) => {
    const normalizedWord = word.replace(/[^\p{L}\p{N}]/gu, "");
    if (!normalizedWord || normalizedWord.length <= 2) {
      position += word.length + 1;
      return;
    }

    const suggestions = suggestCorrections(normalizedWord, isArabic);

    if (suggestions.length > 0) {
      const distance = levenshteinDistance(normalizedWord.toLowerCase(), suggestions[0].toLowerCase());
      totalDistance += distance;
      const confidence = 1 - distance / Math.max(normalizedWord.length, suggestions[0].length);

      errors.push({
        word,
        suggestions,
        position,
        confidence,
      });
    }

    position += word.length + 1;
  });

  const score = 1 - totalDistance / (words.length * 5); // normalize
  return {
    text,
    score: Math.max(0, Math.min(1, score)),
    errors,
  };
};

export default {
  correctText,
  correctWord,
  suggestCorrections,
  spellCheckWithConfidence,
  levenshteinDistance,
};
