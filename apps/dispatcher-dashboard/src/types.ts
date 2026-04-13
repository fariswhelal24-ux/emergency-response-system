export type DashboardView =
  | "overview"
  | "caseDetails"
  | "ambulanceAssignment"
  | "volunteerCoordination"
  | "liveTracking"
  | "reports";

export type IncidentClosurePayload = {
  totalResponseSeconds?: number;
  ambulanceArrivalSeconds?: number;
  volunteerArrivalSeconds?: number;
  interventions?: string;
  notes?: string;
  finalOutcome: string;
};

export type DashboardStats = {
  activeCases: number;
  ambulancesAvailable: number;
  volunteersAvailable: number;
  highPriorityIncidents: number;
};

export type AvailableVolunteerSummary = {
  volunteerId: string;
  userId: string;
  name: string;
  email: string;
  specialty: string;
  availability: string;
  phone: string | null;
  updatedAt: string;
  appConnected?: boolean;
};

export type RegisteredVolunteerSummary = {
  volunteerId: string;
  userId: string;
  name: string;
  email: string;
  specialty: string;
  availability: string;
  phone: string | null;
  updatedAt: string;
  joinedAt: string;
  appConnected?: boolean;
};

export type ActiveCase = {
  id: string;
  caseNumber: string;
  emergencyType: string;
  priority: string;
  status: string;
  address: string;
  location: {
    latitude: number;
    longitude: number;
  };
  createdAt: string;
  reportingUserId: string;
};

export type CaseDetail = {
  case: {
    id: string;
    caseNumber: string;
    emergencyType: string;
    priority: string;
    status: string;
    voiceDescription: string | null;
    transcriptionText: string | null;
    aiAnalysis: string | null;
    possibleCondition: string | null;
    riskLevel: string | null;
    address: string;
    location: {
      latitude: number;
      longitude: number;
    };
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    patient: {
      userId: string;
      name: string;
      phone: string | null;
      bloodType: string | null;
      conditions: string | null;
      allergies: string | null;
    };
  };
  timeline: Array<{
    id: string;
    updateType: string;
    message: string;
    createdAt: string;
    authorUserId: string | null;
  }>;
  assignments: {
    volunteers: Array<{
      assignmentId: string;
      volunteerId: string;
      name: string;
      specialty: string;
      status: string;
      etaMinutes: number | null;
      distanceKm: number | null;
      assignedAt: string;
    }>;
    ambulances: Array<{
      assignmentId: string;
      ambulanceId: string;
      unitCode: string;
      supportLevel: string;
      status: string;
      etaMinutes: number | null;
      distanceKm: number | null;
      assignedAt: string;
    }>;
  };
  nearby: {
    volunteers: Array<{
      volunteerId: string;
      userId: string;
      name: string;
      specialty: string;
      availability: string;
      distanceKm: number;
      appConnected?: boolean;
    }>;
    ambulances: Array<{
      id: string;
      unitCode: string;
      supportLevel: string;
      status: string;
      crewCount: number;
      distanceKm: number;
    }>;
  };
};

export type ReportPoint = {
  date: string;
  caseCount: number;
  avgTotalResponseSeconds: number | null;
  volunteerContributions: number;
};
