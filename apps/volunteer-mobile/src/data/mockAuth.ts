import { VerificationStatus } from "../types/auth";

const volunteerEmailStatus: Record<string, VerificationStatus> = {
  "approved@demo.com": "approved",
  "pending@demo.com": "pending",
  "rejected@demo.com": "rejected"
};

export const resolveMockVerificationStatus = (
  email: string,
  preferred?: VerificationStatus
): VerificationStatus => {
  if (preferred) {
    return preferred;
  }

  return volunteerEmailStatus[email.toLowerCase().trim()] ?? "pending";
};
