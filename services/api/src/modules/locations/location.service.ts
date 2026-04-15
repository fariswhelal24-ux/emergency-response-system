import { AppError } from "../../shared/errors/AppError.js";
import { LocationActor, UserRole } from "../../shared/types/domain.js";
import { emergencyRepository } from "../emergencies/emergency.repository.js";
import {
  CreateLocationUpdateInput,
  NearbyQueryInput,
  NearestAmbulanceQueryInput
} from "./location.validation.js";
import { locationRepository } from "./location.repository.js";

type AuthContext = {
  userId: string;
  role: UserRole;
};

const toActorType = (role: UserRole): LocationActor => {
  if (role === "VOLUNTEER") {
    return "VOLUNTEER";
  }

  if (role === "AMBULANCE_CREW") {
    return "AMBULANCE";
  }

  return role === "CITIZEN" ? "CITIZEN" : "DISPATCHER";
};

const assertCaseAccess = async (auth: AuthContext, caseId: string): Promise<void> => {
  const emergencyCase = await emergencyRepository.findCaseById(caseId);

  if (!emergencyCase) {
    throw new AppError("Emergency case not found", 404);
  }

  if (auth.role === "CITIZEN" && emergencyCase.reporting_user_id !== auth.userId) {
    throw new AppError("You can only access your own emergency cases", 403);
  }

  if (auth.role === "VOLUNTEER") {
    const volunteerId = await emergencyRepository.findVolunteerIdByUserId(auth.userId);

    if (!volunteerId) {
      throw new AppError("Volunteer profile not found", 403);
    }

    const assignment = await emergencyRepository.findVolunteerAssignmentByCase({
      caseId,
      volunteerId
    });

    if (!assignment) {
      throw new AppError("You are not assigned to this case", 403);
    }
  }
};

export const locationService = {
  createLocationUpdate: async (auth: AuthContext, input: CreateLocationUpdateInput) => {
    if (input.caseId) {
      await assertCaseAccess(auth, input.caseId);
    }

    const actorType = input.actorType ?? toActorType(auth.role);

    const location = await locationRepository.createLocationUpdate({
      caseId: input.caseId,
      actorType,
      actorUserId: auth.userId,
      ambulanceId: input.ambulanceId,
      latitude: input.latitude,
      longitude: input.longitude,
      heading: input.heading,
      speedKmh: input.speedKmh,
      etaMinutes: input.etaMinutes
    });

    if (actorType === "VOLUNTEER") {
      await locationRepository.updateVolunteerCoordinate(auth.userId, input.latitude, input.longitude);
    }

    if (actorType === "AMBULANCE" && input.ambulanceId) {
      await locationRepository.updateAmbulanceCoordinate(input.ambulanceId, input.latitude, input.longitude);
    }

    return {
      id: location.id,
      caseId: location.case_id,
      actorType: location.actor_type,
      actorUserId: location.actor_user_id,
      ambulanceId: location.ambulance_id,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      heading: location.heading ? Number(location.heading) : null,
      speedKmh: location.speed_kmh ? Number(location.speed_kmh) : null,
      etaMinutes: location.eta_minutes,
      recordedAt: location.recorded_at
    };
  },

  listCaseLocations: async (auth: AuthContext, caseId: string) => {
    await assertCaseAccess(auth, caseId);

    const rows = await locationRepository.listCaseLocations(caseId);

    return rows.map((location) => ({
      id: location.id,
      caseId: location.case_id,
      actorType: location.actor_type,
      actorUserId: location.actor_user_id,
      ambulanceId: location.ambulance_id,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      heading: location.heading ? Number(location.heading) : null,
      speedKmh: location.speed_kmh ? Number(location.speed_kmh) : null,
      etaMinutes: location.eta_minutes,
      recordedAt: location.recorded_at
    }));
  },

  listNearbyVolunteers: async (query: NearbyQueryInput) => {
    const rows = await locationRepository.listNearbyVolunteers({
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radiusKm,
      limit: query.limit
    });

    return rows.map((volunteer) => ({
      volunteerId: volunteer.volunteer_id,
      userId: volunteer.user_id,
      name: volunteer.full_name,
      specialty: volunteer.specialty,
      availability: volunteer.availability,
      distanceKm: Number(volunteer.distance_km),
      location: {
        latitude: volunteer.current_latitude ? Number(volunteer.current_latitude) : null,
        longitude: volunteer.current_longitude ? Number(volunteer.current_longitude) : null
      }
    }));
  },

  listNearestAmbulances: async (query: NearestAmbulanceQueryInput) => {
    const rows = await locationRepository.listNearestAmbulances({
      latitude: query.latitude,
      longitude: query.longitude,
      limit: query.limit
    });

    return rows.map((ambulance) => ({
      id: ambulance.id,
      unitCode: ambulance.unit_code,
      status: ambulance.status,
      supportLevel: ambulance.support_level,
      crewCount: ambulance.crew_count,
      distanceKm: Number(ambulance.distance_km),
      location: {
        latitude: ambulance.current_latitude ? Number(ambulance.current_latitude) : null,
        longitude: ambulance.current_longitude ? Number(ambulance.current_longitude) : null
      }
    }));
  }
};
