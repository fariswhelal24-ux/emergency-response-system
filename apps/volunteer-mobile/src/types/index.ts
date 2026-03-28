export type VolunteerTab = "alerts" | "history" | "profile";

export type AlertFlow = "incoming" | "accepted" | "inProgress" | "chat" | "settings";

export type VolunteerHistoryItem = {
  id: string;
  emergencyType: string;
  address: string;
  responseTime: string;
  outcome: string;
};
