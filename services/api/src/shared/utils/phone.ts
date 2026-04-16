const PHONE_PUNCTUATION_REGEX = /[\s\-()]/g;

const digitsOnly = (value: string): string => value.replace(/\D/g, "");

const sanitizePhoneInput = (value: string): string => value.trim().replace(PHONE_PUNCTUATION_REGEX, "");

export const isLikelyPalestinePhone = (value: string): boolean => {
  const sanitized = sanitizePhoneInput(value);
  if (!sanitized) {
    return false;
  }

  const normalized = sanitized.startsWith("+") ? `+${digitsOnly(sanitized)}` : digitsOnly(sanitized);

  return (
    /^\+970\d{8,10}$/.test(normalized) ||
    /^970\d{8,10}$/.test(normalized) ||
    /^0\d{8,10}$/.test(normalized) ||
    /^\d{9,10}$/.test(normalized)
  );
};

export const normalizePhone = (phone: string): string => {
  const sanitized = sanitizePhoneInput(phone);
  if (!sanitized) {
    throw new Error("Phone number is required.");
  }

  const hasLeadingPlus = sanitized.startsWith("+");
  let digits = digitsOnly(sanitized);

  if (!digits) {
    throw new Error("Phone number is invalid.");
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (hasLeadingPlus && digits.startsWith("970")) {
    const normalized = `+${digits}`;
    console.log("Normalized phone:", normalized);
    return normalized;
  }

  if (digits.startsWith("970")) {
    const normalized = `+${digits}`;
    console.log("Normalized phone:", normalized);
    return normalized;
  }

  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (digits.length < 8 || digits.length > 10) {
    throw new Error("Phone number is invalid.");
  }

  const normalized = `+970${digits}`;
  console.log("Normalized phone:", normalized);
  return normalized;
};
