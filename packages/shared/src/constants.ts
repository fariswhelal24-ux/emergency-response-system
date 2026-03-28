import { EmergencyPriority, EmergencyStatus } from "./types";

export const priorityOrder: EmergencyPriority[] = ["critical", "high", "moderate", "low"];

export const priorityLabels: Record<EmergencyPriority, string> = {
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
  low: "Low"
};

export const statusLabels: Record<EmergencyStatus, string> = {
  reported: "Reported",
  triaged: "Triaged",
  "volunteer-dispatched": "Volunteers notified",
  "ambulance-en-route": "Ambulance en route",
  "first-aid-in-progress": "First aid in progress",
  "patient-stabilized": "Patient stabilized",
  resolved: "Resolved"
};

export const firstAidGuides: Record<string, string[]> = {
  "Cardiac distress": [
    "Confirm the patient is responsive and breathing normally.",
    "Ask a nearby volunteer to bring an AED if one is available.",
    "Start chest compressions at 100 to 120 per minute if the patient is unresponsive."
  ],
  "Road collision": [
    "Keep the patient still unless there is immediate danger nearby.",
    "Apply direct pressure to visible bleeding with clean cloth or gauze.",
    "Monitor airway and breathing while emergency crews approach."
  ],
  "Allergic reaction": [
    "Check whether the patient has an epinephrine auto-injector.",
    "Help them sit upright and stay calm while symptoms are monitored.",
    "Watch for swelling, wheezing, or loss of consciousness and relay updates."
  ],
  "Heat exhaustion": [
    "Move the patient to shade or a cooler indoor space.",
    "Loosen tight clothing and cool with damp cloths.",
    "Offer water in small sips if the patient is alert and not vomiting."
  ]
};
