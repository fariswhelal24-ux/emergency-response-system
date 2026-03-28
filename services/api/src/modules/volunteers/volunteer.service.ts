import { AppError } from "../../shared/errors/AppError";
import {
  NearbyVolunteerQueryInput,
  UpdateAvailabilityInput,
  UpdateVolunteerProfileInput
} from "./volunteer.validation";
import { volunteerRepository } from "./volunteer.repository";

const toProfileDto = (row: {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  specialty: string;
  verification_badge: string;
  credentials: Record<string, unknown>;
  licenses: string[];
  availability: string;
  response_radius_km: string;
  years_volunteering: number;
  incidents_responded: number;
  average_rating: string;
  current_latitude: string | null;
  current_longitude: string | null;
  updated_at: Date;
}) => ({
  id: row.id,
  userId: row.user_id,
  name: row.full_name,
  email: row.email,
  phone: row.phone,
  avatarUrl: row.avatar_url,
  specialty: row.specialty,
  verificationBadge: row.verification_badge,
  credentials: row.credentials,
  licenses: row.licenses,
  availability: row.availability,
  responseRadiusKm: Number(row.response_radius_km),
  yearsVolunteering: row.years_volunteering,
  incidentsResponded: row.incidents_responded,
  averageRating: Number(row.average_rating),
  location: {
    latitude: row.current_latitude ? Number(row.current_latitude) : null,
    longitude: row.current_longitude ? Number(row.current_longitude) : null
  },
  updatedAt: row.updated_at
});

export const volunteerService = {
  getMyProfile: async (userId: string) => {
    await volunteerRepository.ensureVolunteerProfile(userId);
    const row = await volunteerRepository.getVolunteerByUserId(userId);

    if (!row) {
      throw new AppError("Volunteer profile not found", 404);
    }

    return toProfileDto(row);
  },

  updateMyProfile: async (userId: string, input: UpdateVolunteerProfileInput) => {
    await volunteerRepository.ensureVolunteerProfile(userId);

    await volunteerRepository.updateVolunteerProfile({
      userId,
      specialty: input.specialty,
      verificationBadge: input.verificationBadge,
      responseRadiusKm: input.responseRadiusKm,
      yearsVolunteering: input.yearsVolunteering,
      credentials: input.credentials,
      licenses: input.licenses
    });

    const row = await volunteerRepository.getVolunteerByUserId(userId);

    if (!row) {
      throw new AppError("Volunteer profile not found", 404);
    }

    return toProfileDto(row);
  },

  updateAvailability: async (userId: string, input: UpdateAvailabilityInput) => {
    await volunteerRepository.ensureVolunteerProfile(userId);

    await volunteerRepository.updateAvailability({
      userId,
      availability: input.availability,
      latitude: input.latitude,
      longitude: input.longitude
    });

    const row = await volunteerRepository.getVolunteerByUserId(userId);

    if (!row) {
      throw new AppError("Volunteer profile not found", 404);
    }

    return toProfileDto(row);
  },

  getMyIncidentHistory: async (userId: string) => {
    const incidents = await volunteerRepository.listVolunteerIncidents(userId);

    return incidents.map((incident) => ({
      assignmentId: incident.assignment_id,
      caseId: incident.case_id,
      caseNumber: incident.case_number,
      emergencyType: incident.emergency_type,
      address: incident.address_text,
      caseStatus: incident.status,
      assignmentStatus: incident.assignment_status,
      responseEtaMinutes: incident.response_eta_minutes,
      assignedAt: incident.assigned_at,
      respondedAt: incident.responded_at,
      arrivedAt: incident.arrived_at
    }));
  },

  listNearby: async (query: NearbyVolunteerQueryInput) => {
    const rows = await volunteerRepository.listNearbyVolunteers({
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radiusKm,
      limit: query.limit
    });

    return rows.map(toProfileDto);
  }
};
