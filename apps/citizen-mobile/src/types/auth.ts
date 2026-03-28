export type AccountType = "USER" | "VOLUNTEER";

export type AuthStage =
  | "splash"
  | "roleSelection"
  | "login"
  | "signup"
  | "verification"
  | "authenticated";

export type VerificationStatus = "pending" | "approved" | "rejected";

export type LoginInput = {
  email: string;
  password: string;
  mockVerificationStatus?: VerificationStatus;
};

export type FamilyMemberInput = {
  id: string;
  name: string;
  relation: string;
  age: string;
  medicalNotes: string;
  phone: string;
};

export type UserSignupInput = {
  fullName: string;
  phone: string;
  email: string;
  nationalId?: string;
  cityAddress: string;
  emergencyContact: string;
  familyMembers: FamilyMemberInput[];
};

export type VolunteerSignupInput = {
  fullName: string;
  phone: string;
  email: string;
  nationalId: string;
  specialty: string;
  licenseFileRef: string;
  profilePhotoRef?: string;
};
