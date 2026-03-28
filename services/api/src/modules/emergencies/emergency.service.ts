import { AppError } from "../../shared/errors/AppError";
import { UserRole } from "../../shared/types/domain";
import {
  AssignAmbulanceInput,
  AssignVolunteerInput,
  CloseIncidentInput,
  CreateEmergencyInput,
  EmergencyListQueryInput,
  SendEmergencyUpdateInput,
  UpdateEmergencyStatusInput,
  VolunteerResponseInput
} from "./emergency.validation";
import {
  AmbulanceAssignmentRow,
  EmergencyCaseRow,
  EmergencyUpdateRow,
  VolunteerAssignmentRow,
  emergencyRepository
} from "./emergency.repository";

type AuthContext = {
  userId: string;
  role: UserRole;
  email: string;
};

const toCaseDto = (row: EmergencyCaseRow) => ({
  id: row.id,
  caseNumber: row.case_number,
  reportingUserId: row.reporting_user_id,
  emergencyType: row.emergency_type,
  priority: row.priority,
  status: row.status,
  voiceDescription: row.voice_description,
  transcriptionText: row.transcription_text,
  aiAnalysis: row.ai_analysis,
  possibleCondition: row.possible_condition,
  riskLevel: row.risk_level,
  address: row.address_text,
  location: {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude)
  },
  etaMinutes: row.eta_minutes,
  ambulanceEtaMinutes: row.ambulance_eta_minutes,
  volunteerEtaMinutes: row.volunteer_eta_minutes,
  startedAt: row.started_at,
  closedAt: row.closed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toUpdateDto = (row: EmergencyUpdateRow) => ({
  id: row.id,
  caseId: row.case_id,
  authorUserId: row.author_user_id,
  updateType: row.update_type,
  message: row.message,
  payload: row.payload,
  createdAt: row.created_at
});

const toVolunteerAssignmentDto = (row: VolunteerAssignmentRow) => ({
  id: row.id,
  caseId: row.case_id,
  volunteerId: row.volunteer_id,
  status: row.status,
  distanceKm: row.distance_km ? Number(row.distance_km) : null,
  etaMinutes: row.eta_minutes,
  assignedBy: row.assigned_by,
  assignedAt: row.assigned_at,
  respondedAt: row.responded_at,
  arrivedAt: row.arrived_at
});

const toAmbulanceAssignmentDto = (row: AmbulanceAssignmentRow) => ({
  id: row.id,
  caseId: row.case_id,
  ambulanceId: row.ambulance_id,
  status: row.status,
  distanceKm: row.distance_km ? Number(row.distance_km) : null,
  etaMinutes: row.eta_minutes,
  assignedBy: row.assigned_by,
  assignedAt: row.assigned_at,
  arrivedAt: row.arrived_at
});

const requireRole = (auth: AuthContext, roles: UserRole[]): void => {
  if (!roles.includes(auth.role)) {
    throw new AppError("You do not have permission to perform this action", 403);
  }
};

const assertCaseAccess = async (auth: AuthContext, caseId: string, reporterUserId: string): Promise<void> => {
  if (auth.role === "CITIZEN" && reporterUserId !== auth.userId) {
    throw new AppError("You can only access your own emergency cases", 403);
  }

  if (auth.role === "VOLUNTEER") {
    const volunteerId = await emergencyRepository.findVolunteerIdByUserId(auth.userId);

    if (!volunteerId) {
      throw new AppError("Volunteer profile is required", 403);
    }

    const assignment = await emergencyRepository.findVolunteerAssignmentByCase({
      caseId,
      volunteerId
    });

    if (!assignment) {
      throw new AppError("You are not assigned to this emergency case", 403);
    }
  }
};

export const emergencyService = {
  createEmergency: async (auth: AuthContext, input: CreateEmergencyInput) => {
    const caseNumber = await emergencyRepository.generateCaseNumber();

    const created = await emergencyRepository.createEmergencyCase({
      caseNumber,
      reportingUserId: auth.userId,
      emergencyType: input.emergencyType,
      priority: input.priority,
      voiceDescription: input.voiceDescription,
      transcriptionText: input.transcriptionText,
      aiAnalysis: input.aiAnalysis,
      possibleCondition: input.possibleCondition,
      riskLevel: input.riskLevel,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      etaMinutes: input.etaMinutes,
      ambulanceEtaMinutes: input.ambulanceEtaMinutes,
      volunteerEtaMinutes: input.volunteerEtaMinutes
    });

    await emergencyRepository.createEmergencyUpdate({
      caseId: created.id,
      authorUserId: auth.userId,
      updateType: "CASE_CREATED",
      message: "Emergency request created",
      payload: {
        priority: created.priority,
        status: created.status
      }
    });

    return toCaseDto(created);
  },

  listEmergencies: async (auth: AuthContext, query: EmergencyListQueryInput) => {
    const volunteerId =
      auth.role === "VOLUNTEER" ? await emergencyRepository.findVolunteerIdByUserId(auth.userId) : null;

    const rows = await emergencyRepository.listCases({
      authRole: auth.role,
      authUserId: auth.userId,
      authVolunteerId: volunteerId,
      filters: query
    });

    return rows.map(toCaseDto);
  },

  getEmergencyById: async (auth: AuthContext, caseId: string) => {
    const row = await emergencyRepository.findCaseById(caseId);

    if (!row) {
      throw new AppError("Emergency case not found", 404);
    }

    await assertCaseAccess(auth, caseId, row.reporting_user_id);

    const [updates, volunteerAssignments, ambulanceAssignments] = await Promise.all([
      emergencyRepository.listEmergencyUpdates(caseId),
      emergencyRepository.listVolunteerAssignmentsByCase(caseId),
      emergencyRepository.listAmbulanceAssignmentsByCase(caseId)
    ]);

    return {
      case: toCaseDto(row),
      updates: updates.map(toUpdateDto),
      volunteerAssignments: volunteerAssignments.map(toVolunteerAssignmentDto),
      ambulanceAssignments: ambulanceAssignments.map(toAmbulanceAssignmentDto)
    };
  },

  updateStatus: async (auth: AuthContext, caseId: string, input: UpdateEmergencyStatusInput) => {
    requireRole(auth, ["VOLUNTEER", "DISPATCHER", "AMBULANCE_CREW", "ADMIN"]);

    const existing = await emergencyRepository.findCaseById(caseId);

    if (!existing) {
      throw new AppError("Emergency case not found", 404);
    }

    await assertCaseAccess(auth, caseId, existing.reporting_user_id);

    const updated = await emergencyRepository.updateCaseStatus({
      caseId,
      status: input.status
    });

    if (!updated) {
      throw new AppError("Emergency case could not be updated", 500);
    }

    await emergencyRepository.createEmergencyUpdate({
      caseId,
      authorUserId: auth.userId,
      updateType: "STATUS_CHANGED",
      message: input.note ?? `Status changed to ${input.status}`,
      payload: {
        status: input.status
      }
    });

    return toCaseDto(updated);
  },

  assignAmbulance: async (auth: AuthContext, caseId: string, input: AssignAmbulanceInput) => {
    requireRole(auth, ["DISPATCHER", "ADMIN"]);

    const existing = await emergencyRepository.findCaseById(caseId);

    if (!existing) {
      throw new AppError("Emergency case not found", 404);
    }

    const nearestAmbulance = input.ambulanceId
      ? null
      : await emergencyRepository.findNearestAmbulance({
          latitude: Number(existing.latitude),
          longitude: Number(existing.longitude)
        });

    const ambulanceId = input.ambulanceId ?? nearestAmbulance?.id;

    if (!ambulanceId) {
      throw new AppError("No available ambulance found", 404);
    }

    const assigned = await emergencyRepository.assignAmbulance({
      caseId,
      ambulanceId,
      assignedByUserId: auth.userId,
      etaMinutes: input.etaMinutes,
      distanceKm: input.distanceKm ?? (nearestAmbulance ? Number(nearestAmbulance.distance_km) : undefined)
    });

    const updatedCase = await emergencyRepository.updateCaseStatus({
      caseId,
      status: "AMBULANCE_ASSIGNED",
      ambulanceEtaMinutes: input.etaMinutes ?? assigned.eta_minutes ?? undefined
    });

    await emergencyRepository.createEmergencyUpdate({
      caseId,
      authorUserId: auth.userId,
      updateType: "AMBULANCE_ASSIGNED",
      message: "Ambulance assigned to case",
      payload: {
        ambulanceId,
        assignmentId: assigned.id,
        etaMinutes: assigned.eta_minutes
      }
    });

    if (!updatedCase) {
      throw new AppError("Emergency case not found after assignment", 404);
    }

    return {
      case: toCaseDto(updatedCase),
      assignment: toAmbulanceAssignmentDto(assigned)
    };
  },

  assignVolunteer: async (auth: AuthContext, caseId: string, input: AssignVolunteerInput) => {
    requireRole(auth, ["DISPATCHER", "ADMIN"]);

    const existing = await emergencyRepository.findCaseById(caseId);

    if (!existing) {
      throw new AppError("Emergency case not found", 404);
    }

    const assignment = await emergencyRepository.assignVolunteer({
      caseId,
      volunteerId: input.volunteerId,
      assignedByUserId: auth.userId,
      etaMinutes: input.etaMinutes,
      distanceKm: input.distanceKm
    });

    const updatedCase = await emergencyRepository.updateCaseStatus({
      caseId,
      status: "VOLUNTEERS_NOTIFIED",
      volunteerEtaMinutes: input.etaMinutes ?? assignment.eta_minutes ?? undefined
    });

    await emergencyRepository.createEmergencyUpdate({
      caseId,
      authorUserId: auth.userId,
      updateType: "VOLUNTEER_NOTIFIED",
      message: "Volunteer notified for this case",
      payload: {
        volunteerId: input.volunteerId,
        assignmentId: assignment.id,
        etaMinutes: assignment.eta_minutes
      }
    });

    if (!updatedCase) {
      throw new AppError("Emergency case not found after volunteer assignment", 404);
    }

    return {
      case: toCaseDto(updatedCase),
      assignment: toVolunteerAssignmentDto(assignment)
    };
  },

  volunteerRespond: async (auth: AuthContext, caseId: string, input: VolunteerResponseInput) => {
    requireRole(auth, ["VOLUNTEER"]);

    const volunteerId = await emergencyRepository.findVolunteerIdByUserId(auth.userId);

    if (!volunteerId) {
      throw new AppError("Volunteer profile not found", 404);
    }

    const assignment = input.assignmentId
      ? await emergencyRepository.findVolunteerAssignmentById(input.assignmentId)
      : await emergencyRepository.findVolunteerAssignmentByCase({ caseId, volunteerId });

    if (!assignment) {
      throw new AppError("Volunteer assignment not found", 404);
    }

    if (assignment.case_id !== caseId) {
      throw new AppError("Assignment does not match this case", 400);
    }

    if (assignment.volunteer_id !== volunteerId) {
      throw new AppError("You can only respond to your own assignment", 403);
    }

    const nextStatus = input.accepted ? "ACCEPTED" : "DECLINED";

    const updatedAssignment = await emergencyRepository.updateVolunteerAssignmentStatus({
      assignmentId: assignment.id,
      status: nextStatus,
      etaMinutes: input.etaMinutes,
      volunteerId
    });

    if (!updatedAssignment) {
      throw new AppError("Assignment could not be updated", 500);
    }

    const caseStatus = input.accepted ? "VOLUNTEER_ACCEPTED" : "VOLUNTEERS_NOTIFIED";

    const updatedCase = await emergencyRepository.updateCaseStatus({
      caseId,
      status: caseStatus,
      volunteerEtaMinutes: input.etaMinutes ?? undefined
    });

    await emergencyRepository.createEmergencyUpdate({
      caseId,
      authorUserId: auth.userId,
      updateType: input.accepted ? "VOLUNTEER_ACCEPTED" : "VOLUNTEER_DECLINED",
      message: input.accepted ? "Volunteer accepted and is heading to patient" : "Volunteer declined",
      payload: {
        volunteerId,
        assignmentId: assignment.id,
        etaMinutes: input.etaMinutes
      }
    });

    if (!updatedCase) {
      throw new AppError("Emergency case not found after volunteer response", 404);
    }

    return {
      case: toCaseDto(updatedCase),
      assignment: toVolunteerAssignmentDto(updatedAssignment)
    };
  },

  addEmergencyUpdate: async (auth: AuthContext, caseId: string, input: SendEmergencyUpdateInput) => {
    const existing = await emergencyRepository.findCaseById(caseId);

    if (!existing) {
      throw new AppError("Emergency case not found", 404);
    }

    await assertCaseAccess(auth, caseId, existing.reporting_user_id);

    const update = await emergencyRepository.createEmergencyUpdate({
      caseId,
      authorUserId: auth.userId,
      updateType: input.updateType,
      message: input.message,
      payload: input.payload
    });

    return toUpdateDto(update);
  },

  closeIncident: async (auth: AuthContext, caseId: string, input: CloseIncidentInput) => {
    requireRole(auth, ["DISPATCHER", "ADMIN"]);

    const existing = await emergencyRepository.findCaseById(caseId);

    if (!existing) {
      throw new AppError("Emergency case not found", 404);
    }

    await emergencyRepository.closeIncident({
      caseId,
      closedByUserId: auth.userId,
      totalResponseSeconds: input.totalResponseSeconds,
      ambulanceArrivalSeconds: input.ambulanceArrivalSeconds,
      volunteerArrivalSeconds: input.volunteerArrivalSeconds,
      interventions: input.interventions,
      notes: input.notes,
      finalOutcome: input.finalOutcome,
      resolvedStatus: input.resolvedStatus
    });

    await emergencyRepository.createEmergencyUpdate({
      caseId,
      authorUserId: auth.userId,
      updateType: "CASE_CLOSED",
      message: "Incident closed by dispatch center",
      payload: {
        finalOutcome: input.finalOutcome,
        resolvedStatus: input.resolvedStatus ?? "RESOLVED"
      }
    });

    const updated = await emergencyRepository.findCaseById(caseId);

    if (!updated) {
      throw new AppError("Emergency case not found after closure", 404);
    }

    return toCaseDto(updated);
  },

  listCaseUpdates: async (auth: AuthContext, caseId: string) => {
    const existing = await emergencyRepository.findCaseById(caseId);

    if (!existing) {
      throw new AppError("Emergency case not found", 404);
    }

    await assertCaseAccess(auth, caseId, existing.reporting_user_id);

    const updates = await emergencyRepository.listEmergencyUpdates(caseId);
    return updates.map(toUpdateDto);
  },

  getNearbyVolunteersByCase: async (auth: AuthContext, caseId: string, radiusKm: number) => {
    requireRole(auth, ["DISPATCHER", "ADMIN"]);

    const existing = await emergencyRepository.findCaseById(caseId);

    if (!existing) {
      throw new AppError("Emergency case not found", 404);
    }

    const volunteers = await emergencyRepository.listNearbyVolunteers({
      latitude: Number(existing.latitude),
      longitude: Number(existing.longitude),
      radiusKm,
      limit: 30
    });

    return volunteers.map((volunteer) => ({
      volunteerId: volunteer.volunteer_id,
      userId: volunteer.user_id,
      name: volunteer.full_name,
      specialty: volunteer.specialty,
      availability: volunteer.availability,
      responseRadiusKm: Number(volunteer.response_radius_km),
      distanceKm: Number(volunteer.distance_km),
      location: {
        latitude: volunteer.current_latitude ? Number(volunteer.current_latitude) : null,
        longitude: volunteer.current_longitude ? Number(volunteer.current_longitude) : null
      }
    }));
  }
};
