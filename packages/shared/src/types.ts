export type EmergencyPriority = "critical" | "high" | "moderate" | "low";

export type EmergencyStatus =
  | "reported"
  | "triaged"
  | "volunteer-dispatched"
  | "ambulance-en-route"
  | "first-aid-in-progress"
  | "patient-stabilized"
  | "resolved";

export type VolunteerAvailability = "available" | "busy" | "offline";

export type AmbulanceStatus = "available" | "dispatched" | "arriving" | "at-scene";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ReporterProfile {
  id: string;
  name: string;
  phone: string;
  age?: number;
  bloodType?: string;
  notes?: string;
}

export interface TimelineEntry {
  id: string;
  label: string;
  detail: string;
  actor: string;
  at: string;
}

export interface VolunteerProfile {
  id: string;
  name: string;
  phone: string;
  skillTag: string;
  distanceKm: number;
  etaMinutes: number;
  availability: VolunteerAvailability;
  rating: number;
  coordinates: Coordinates;
}

export interface AmbulanceUnit {
  id: string;
  code: string;
  crewLead: string;
  status: AmbulanceStatus;
  etaMinutes: number;
  coordinates: Coordinates;
}

export interface EmergencyRequest {
  id: string;
  incidentType: string;
  priority: EmergencyPriority;
  status: EmergencyStatus;
  description: string;
  address: string;
  location: Coordinates;
  symptoms: string[];
  firstAidChecklist: string[];
  reporter: ReporterProfile;
  createdAt: string;
  updatedAt: string;
  ambulanceEtaMinutes: number;
  volunteerEtaMinutes: number;
  assignedAmbulance?: AmbulanceUnit;
  assignedVolunteers: VolunteerProfile[];
  additionalInfo?: string;
  timeline: TimelineEntry[];
}

export interface DashboardSummary {
  openCases: number;
  criticalCases: number;
  volunteersNearby: number;
  ambulancesAvailable: number;
  averageResponseMinutes: number;
}

export interface NewEmergencyInput {
  incidentType: string;
  priority: EmergencyPriority;
  description: string;
  address: string;
  location: Coordinates;
  symptoms: string[];
  reporter: ReporterProfile;
  additionalInfo?: string;
}

export interface VolunteerResponseInput {
  emergencyId: string;
  volunteerId: string;
  accepted: boolean;
}

export interface LocationPing {
  unitId: string;
  unitType: "ambulance" | "volunteer";
  coordinates: Coordinates;
  heading?: number;
  speedKmh?: number;
  recordedAt: string;
}
