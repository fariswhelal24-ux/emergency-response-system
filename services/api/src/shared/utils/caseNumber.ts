const pad = (value: number): string => String(value).padStart(2, "0");

export const buildCaseNumber = (sequence: number, now = new Date()): string => {
  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  return `CASE-${year}${month}${day}-${String(sequence).padStart(4, "0")}`;
};
