import { VolunteerHistoryItem } from "../types";

export const volunteerMeta = {
  name: "Dr. Layla Haddad",
  specialty: "Emergency Physician",
  status: "Available",
  radiusKm: 5,
  verifiedBadge: "Verified Medical Volunteer"
};

export const activeEmergency = {
  caseId: "CASE-20260323-0007",
  emergencyType: "Severe breathing difficulty",
  distanceKm: 1.4,
  etaMinutes: 4,
  ambulanceDispatched: true,
  patientName: "Sami Darwish",
  patientSummary: "Elderly male, difficulty breathing, asthma history.",
  urgencyLabel: "High urgency",
  safeAccess: "Building B, Gate 2, 3rd floor, elevator available.",
  equipmentChecklist: ["Gloves", "Gauze", "Pulse oximeter", "Portable airway kit"],
  quickActions: ["Call Patient", "Message Patient", "Contact Dispatcher", "Send Update"]
};

export const volunteerHistory: VolunteerHistoryItem[] = [
  {
    id: "CASE-20260320-0012",
    emergencyType: "Cardiac distress",
    address: "Old City Road",
    responseTime: "4 min",
    outcome: "Stabilized before EMS arrival"
  },
  {
    id: "CASE-20260315-0004",
    emergencyType: "Road collision",
    address: "Jerusalem Road Junction",
    responseTime: "6 min",
    outcome: "Assisted with bleeding control"
  },
  {
    id: "CASE-20260301-0011",
    emergencyType: "Unconscious patient",
    address: "Al-Masyoun District",
    responseTime: "3 min",
    outcome: "Assisted with CPR"
  }
];

export const volunteerStats = {
  incidentsResponded: 124,
  averageRating: 4.8,
  yearsVolunteering: 6,
  ambulanceHandoffs: 97,
  firstAidRendered: 111,
  updatesShared: 189
};
