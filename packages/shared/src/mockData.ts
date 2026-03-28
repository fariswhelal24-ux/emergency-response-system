import { firstAidGuides } from "./constants";
import {
  AmbulanceUnit,
  DashboardSummary,
  EmergencyRequest,
  VolunteerProfile
} from "./types";

export const demoVolunteers: VolunteerProfile[] = [
  {
    id: "vol-101",
    name: "Maya Khalil",
    phone: "+970-599-111-222",
    skillTag: "CPR Instructor",
    distanceKm: 1.2,
    etaMinutes: 4,
    availability: "available",
    rating: 4.9,
    coordinates: { lat: 31.7767, lng: 35.2331 }
  },
  {
    id: "vol-102",
    name: "Omar Nasser",
    phone: "+970-599-333-444",
    skillTag: "Trauma Care",
    distanceKm: 2.7,
    etaMinutes: 7,
    availability: "available",
    rating: 4.7,
    coordinates: { lat: 31.7789, lng: 35.2282 }
  },
  {
    id: "vol-103",
    name: "Lina Saadeh",
    phone: "+970-599-555-666",
    skillTag: "Emergency Nurse",
    distanceKm: 5.4,
    etaMinutes: 11,
    availability: "busy",
    rating: 5,
    coordinates: { lat: 31.7734, lng: 35.2244 }
  }
];

export const demoAmbulances: AmbulanceUnit[] = [
  {
    id: "amb-41",
    code: "AMB-41",
    crewLead: "Hadi Mansour",
    status: "dispatched",
    etaMinutes: 6,
    coordinates: { lat: 31.7775, lng: 35.2304 }
  },
  {
    id: "amb-28",
    code: "AMB-28",
    crewLead: "Rana Awad",
    status: "available",
    etaMinutes: 9,
    coordinates: { lat: 31.7813, lng: 35.2203 }
  }
];

export const demoEmergencies: EmergencyRequest[] = [
  {
    id: "case-4001",
    incidentType: "Cardiac distress",
    priority: "critical",
    status: "ambulance-en-route",
    description: "Male adult collapsed in a grocery store queue and is not responding.",
    address: "Al-Irsal Street, Ramallah",
    location: { lat: 31.9038, lng: 35.2034 },
    symptoms: ["unresponsive", "labored breathing", "pale skin"],
    firstAidChecklist: firstAidGuides["Cardiac distress"],
    reporter: {
      id: "cit-301",
      name: "Sami Darwish",
      phone: "+970-598-222-111",
      age: 58,
      bloodType: "O+",
      notes: "History of hypertension"
    },
    createdAt: "2026-03-23T09:06:00.000Z",
    updatedAt: "2026-03-23T09:10:00.000Z",
    ambulanceEtaMinutes: 6,
    volunteerEtaMinutes: 4,
    assignedAmbulance: demoAmbulances[0],
    assignedVolunteers: [demoVolunteers[0], demoVolunteers[1]],
    additionalInfo: "Store manager has cleared the entrance and AED is at customer service.",
    timeline: [
      {
        id: "time-1",
        label: "Call received",
        detail: "Dispatcher opened a critical cardiac case.",
        actor: "Dispatch AI triage",
        at: "2026-03-23T09:06:00.000Z"
      },
      {
        id: "time-2",
        label: "Volunteers alerted",
        detail: "Two nearby trained responders notified within 8 seconds.",
        actor: "Volunteer network",
        at: "2026-03-23T09:07:00.000Z"
      },
      {
        id: "time-3",
        label: "Ambulance assigned",
        detail: "AMB-41 dispatched with ALS crew.",
        actor: "Dispatcher Noura",
        at: "2026-03-23T09:08:00.000Z"
      }
    ]
  },
  {
    id: "case-4002",
    incidentType: "Road collision",
    priority: "high",
    status: "first-aid-in-progress",
    description: "Motorbike rider conscious with shoulder injury and heavy leg bleeding.",
    address: "Jerusalem Road Junction",
    location: { lat: 31.8992, lng: 35.2169 },
    symptoms: ["bleeding", "pain", "dizziness"],
    firstAidChecklist: firstAidGuides["Road collision"],
    reporter: {
      id: "cit-302",
      name: "Nadine Qassem",
      phone: "+970-597-222-333",
      age: 26
    },
    createdAt: "2026-03-23T09:12:00.000Z",
    updatedAt: "2026-03-23T09:18:00.000Z",
    ambulanceEtaMinutes: 9,
    volunteerEtaMinutes: 3,
    assignedVolunteers: [demoVolunteers[1]],
    assignedAmbulance: demoAmbulances[1],
    additionalInfo: "Traffic police are keeping the intersection open.",
    timeline: [
      {
        id: "time-4",
        label: "Case triaged",
        detail: "Dispatcher confirmed external bleeding and motorbike crash mechanism.",
        actor: "Dispatcher Adam",
        at: "2026-03-23T09:13:00.000Z"
      },
      {
        id: "time-5",
        label: "Volunteer accepted",
        detail: "Omar Nasser accepted and started navigation.",
        actor: "Volunteer mobile",
        at: "2026-03-23T09:14:00.000Z"
      }
    ]
  }
];

export const createDashboardSummary = (
  emergencies: EmergencyRequest[] = demoEmergencies,
  volunteers: VolunteerProfile[] = demoVolunteers,
  ambulances: AmbulanceUnit[] = demoAmbulances
): DashboardSummary => {
  const openCases = emergencies.filter((emergency) => emergency.status !== "resolved").length;
  const criticalCases = emergencies.filter((emergency) => emergency.priority === "critical").length;
  const volunteersNearby = volunteers.filter((volunteer) => volunteer.availability === "available").length;
  const ambulancesAvailable = ambulances.filter((ambulance) => ambulance.status === "available").length;
  const averageResponseMinutes =
    emergencies.reduce((total, emergency) => total + emergency.ambulanceEtaMinutes, 0) /
    emergencies.length;

  return {
    openCases,
    criticalCases,
    volunteersNearby,
    ambulancesAvailable,
    averageResponseMinutes: Number(averageResponseMinutes.toFixed(1))
  };
};
