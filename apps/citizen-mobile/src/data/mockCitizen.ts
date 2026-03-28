import { CitizenProfile, EmergencyHistoryItem, FirstAidStep } from "../types";

export const liveCase = {
  caseId: "CASE-20260323-0007",
  emergencyType: "Severe breathing difficulty",
  priority: "Critical",
  status: "Ambulance Dispatched",
  etaMinutes: 3,
  volunteerEtaMinutes: 2,
  ambulanceUnit: "AMB-101",
  ambulanceCrew: "ALS Crew - Unit 101",
  volunteerName: "Dr. Layla Haddad",
  volunteerSpecialty: "Emergency Physician",
  address: "Al-Irsal Street, Ramallah",
  aiSummary: "Elderly male, shortness of breath, asthma history.",
  firstAidSteps: [
    {
      id: "1",
      title: "Check responsiveness",
      description: "Gently speak to the patient and check if they respond."
    },
    {
      id: "2",
      title: "Check breathing",
      description: "Look for chest movement and listen for breath sounds."
    },
    {
      id: "3",
      title: "Support breathing position",
      description: "Keep the patient seated upright and loosen tight clothing."
    },
    {
      id: "4",
      title: "Monitor continuously",
      description: "Update dispatch immediately if breathing worsens."
    }
  ] as FirstAidStep[],
  quickUpdateChips: [
    "Condition got worse",
    "Severe bleeding",
    "Not breathing",
    "Unconscious",
    "More victims",
    "Hazard at scene",
    "Access issue"
  ]
};

export const userHistory: EmergencyHistoryItem[] = [
  {
    id: "CASE-20260320-0012",
    dateTime: "Mar 20, 2026 · 08:14 PM",
    emergencyType: "Chest pain",
    address: "Old City Road, Ramallah",
    status: "Resolved"
  },
  {
    id: "CASE-20260312-0006",
    dateTime: "Mar 12, 2026 · 11:06 AM",
    emergencyType: "Road accident",
    address: "Jerusalem Road Junction",
    status: "Closed"
  },
  {
    id: "CASE-20260227-0019",
    dateTime: "Feb 27, 2026 · 05:42 PM",
    emergencyType: "Allergic reaction",
    address: "Al-Masyoun District",
    status: "Resolved"
  }
];

export const citizenProfile: CitizenProfile = {
  fullName: "Sami Darwish",
  phone: "+970-598-222-111",
  bloodType: "O+",
  conditions: "Hypertension, mild asthma",
  allergies: "Penicillin",
  emergencyContact: "Lina Darwish · +970-599-700-701"
};
