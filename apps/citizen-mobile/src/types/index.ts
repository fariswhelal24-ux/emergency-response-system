export type CitizenTab = "home" | "history" | "profile";

export type HomeFlow = "ready" | "dispatched" | "firstAid" | "chat" | "settings";

export type EmergencyHistoryItem = {
  id: string;
  dateTime: string;
  emergencyType: string;
  address: string;
  status: "Resolved" | "Closed" | "Cancelled";
};

export type FirstAidStep = {
  id: string;
  title: string;
  description: string;
};

export type CitizenProfile = {
  fullName: string;
  phone: string;
  bloodType: string;
  conditions: string;
  allergies: string;
  emergencyContact: string;
};
