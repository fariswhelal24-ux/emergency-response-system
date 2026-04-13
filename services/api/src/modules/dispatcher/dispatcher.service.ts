import { AppError } from "../../shared/errors/AppError";
import { UserRole } from "../../shared/types/domain";
import { emergencyService } from "../emergencies/emergency.service";
import {
  AssignAmbulanceInput,
  AssignVolunteerInput,
  CloseIncidentInput
} from "../emergencies/emergency.validation";
import { locationRepository } from "../locations/location.repository";
import { dispatcherRepository } from "./dispatcher.repository";
import { isVolunteerAppConnected } from "../../sockets/volunteerPresence";

type AuthContext = {
  userId: string;
  role: UserRole;
  email: string;
};

const ensureDispatcherAccess = (auth: AuthContext): void => {
  if (auth.role !== "DISPATCHER" && auth.role !== "ADMIN") {
    throw new AppError("Dispatcher access is required", 403);
  }
};

export const dispatcherService = {
  getDashboardOverview: async (auth: AuthContext) => {
    ensureDispatcherAccess(auth);

    const [statsRow, activeCases, availableVolunteers, registeredVolunteers] = await Promise.all([
      dispatcherRepository.getDashboardStats(),
      dispatcherRepository.listActiveCases(),
      dispatcherRepository.listAvailableVolunteers(),
      dispatcherRepository.listRegisteredVolunteers()
    ]);

    const volunteersAvailableLive = registeredVolunteers.filter(
      (row) => row.availability === "AVAILABLE" && isVolunteerAppConnected(row.user_id)
    ).length;

    return {
      stats: {
        activeCases: Number(statsRow.active_cases),
        ambulancesAvailable: Number(statsRow.ambulances_available),
        volunteersAvailable: volunteersAvailableLive,
        highPriorityIncidents: Number(statsRow.high_priority_incidents)
      },
      activeCases: activeCases.map((item) => ({
        id: item.id,
        caseNumber: item.case_number,
        emergencyType: item.emergency_type,
        priority: item.priority,
        status: item.status,
        address: item.address_text,
        location: {
          latitude: Number(item.latitude),
          longitude: Number(item.longitude)
        },
        createdAt: item.created_at,
        reportingUserId: item.reporting_user_id
      })),
      availableVolunteers: availableVolunteers.map((item) => ({
        volunteerId: item.volunteer_id,
        userId: item.user_id,
        name: item.full_name,
        email: item.email,
        specialty: item.specialty,
        availability: item.availability,
        phone: item.phone,
        updatedAt: item.updated_at,
        appConnected: isVolunteerAppConnected(item.user_id)
      })),
      registeredVolunteers: registeredVolunteers.map((item) => ({
        volunteerId: item.volunteer_id,
        userId: item.user_id,
        name: item.full_name,
        email: item.email,
        specialty: item.specialty,
        availability: item.availability,
        phone: item.phone,
        updatedAt: item.updated_at,
        joinedAt: item.created_at,
        appConnected: isVolunteerAppConnected(item.user_id)
      }))
    };
  },

  getCaseDetails: async (auth: AuthContext, caseId: string) => {
    ensureDispatcherAccess(auth);

    const caseRow = await dispatcherRepository.getCaseDetails(caseId);

    if (!caseRow) {
      throw new AppError("Emergency case not found", 404);
    }

    const [timeline, volunteers, ambulances, nearbyVolunteers, nearbyAmbulances] = await Promise.all([
      dispatcherRepository.getTimeline(caseId),
      dispatcherRepository.listCaseVolunteers(caseId),
      dispatcherRepository.listCaseAmbulances(caseId),
      locationRepository.listNearbyVolunteers({
        latitude: Number(caseRow.latitude),
        longitude: Number(caseRow.longitude),
        radiusKm: 10,
        limit: 10
      }),
      locationRepository.listNearestAmbulances({
        latitude: Number(caseRow.latitude),
        longitude: Number(caseRow.longitude),
        limit: 6
      })
    ]);

    return {
      case: {
        id: caseRow.id,
        caseNumber: caseRow.case_number,
        emergencyType: caseRow.emergency_type,
        priority: caseRow.priority,
        status: caseRow.status,
        voiceDescription: caseRow.voice_description,
        transcriptionText: caseRow.transcription_text,
        aiAnalysis: caseRow.ai_analysis,
        possibleCondition: caseRow.possible_condition,
        riskLevel: caseRow.risk_level,
        address: caseRow.address_text,
        location: {
          latitude: Number(caseRow.latitude),
          longitude: Number(caseRow.longitude)
        },
        createdAt: caseRow.created_at,
        updatedAt: caseRow.updated_at,
        closedAt: caseRow.closed_at,
        patient: {
          userId: caseRow.reporting_user_id,
          name: caseRow.reporter_name,
          phone: caseRow.reporter_phone,
          bloodType: caseRow.blood_type,
          conditions: caseRow.conditions,
          allergies: caseRow.allergies
        }
      },
      timeline: timeline.map((entry) => ({
        id: entry.id,
        caseId: entry.case_id,
        updateType: entry.update_type,
        message: entry.message,
        payload: entry.payload,
        createdAt: entry.created_at,
        authorUserId: entry.author_user_id
      })),
      assignments: {
        volunteers: volunteers.map((item) => ({
          assignmentId: item.assignment_id,
          volunteerId: item.volunteer_id,
          name: item.full_name,
          specialty: item.specialty,
          status: item.status,
          etaMinutes: item.eta_minutes,
          distanceKm: item.distance_km ? Number(item.distance_km) : null,
          assignedAt: item.assigned_at
        })),
        ambulances: ambulances.map((item) => ({
          assignmentId: item.assignment_id,
          ambulanceId: item.ambulance_id,
          unitCode: item.unit_code,
          supportLevel: item.support_level,
          status: item.status,
          etaMinutes: item.eta_minutes,
          distanceKm: item.distance_km ? Number(item.distance_km) : null,
          assignedAt: item.assigned_at
        }))
      },
      nearby: {
        volunteers: nearbyVolunteers.map((item) => ({
          volunteerId: item.volunteer_id,
          userId: item.user_id,
          name: item.full_name,
          specialty: item.specialty,
          availability: item.availability,
          distanceKm: Number(item.distance_km),
          appConnected: isVolunteerAppConnected(item.user_id)
        })),
        ambulances: nearbyAmbulances.map((item) => ({
          id: item.id,
          unitCode: item.unit_code,
          supportLevel: item.support_level,
          status: item.status,
          crewCount: item.crew_count,
          distanceKm: Number(item.distance_km)
        }))
      }
    };
  },

  assignAmbulance: async (auth: AuthContext, caseId: string, input: AssignAmbulanceInput) => {
    ensureDispatcherAccess(auth);
    return emergencyService.assignAmbulance(auth, caseId, input);
  },

  assignVolunteer: async (auth: AuthContext, caseId: string, input: AssignVolunteerInput) => {
    ensureDispatcherAccess(auth);
    return emergencyService.assignVolunteer(auth, caseId, input);
  },

  closeCase: async (auth: AuthContext, caseId: string, input: CloseIncidentInput) => {
    ensureDispatcherAccess(auth);
    return emergencyService.closeIncident(auth, caseId, input);
  },

  getReportSummary: async (auth: AuthContext) => {
    ensureDispatcherAccess(auth);

    const rows = await dispatcherRepository.getReportSummary();

    return rows.map((row) => ({
      date: row.date_label,
      caseCount: Number(row.case_count),
      avgTotalResponseSeconds: row.avg_total_response_seconds
        ? Number(row.avg_total_response_seconds)
        : null,
      volunteerContributions: Number(row.volunteer_contributions)
    }));
  }
};
