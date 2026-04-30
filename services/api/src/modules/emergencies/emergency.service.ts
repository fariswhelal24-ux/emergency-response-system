import { randomUUID } from "node:crypto";

import { authRepository } from "../auth/auth.repository.js";
import { AppError } from "../../shared/errors/AppError.js";
import { pushNotificationService } from "../../shared/services/push-notifications.js";
import { virtualAmbulanceService } from "../../shared/services/virtual-ambulance.js";
import { UserRole } from "../../shared/types/domain.js";
import { emitVolunteerAssigned } from "../../sockets/realtimeServer.js";
import { findNearestVolunteers } from "../../shared/utils/geo.js";
import { hashPassword } from "../../shared/utils/password.js";
import {
  AssignAmbulanceInput,
  AssignVolunteerInput,
  CloseIncidentInput,
  CreateEmergencyInput,
  InitEmergencyCallInput,
  EmergencyListQueryInput,
  SendEmergencyUpdateInput,
  UpdateEmergencyDetailsInput,
  UpdateEmergencyStatusInput,
  VolunteerResponseInput
} from "./emergency.validation.js";
import {
  AmbulanceAssignmentRow,
  EmergencyCaseRow,
  EmergencyUpdateRow,
  VolunteerAssignmentRow,
  emergencyRepository
} from "./emergency.repository.js";

type AuthContext = {
  userId: string;
  role: UserRole;
  email: string;
};

const estimateEtaMinutesFromDistance = (distanceKm?: number | null): number | undefined => {
  if (distanceKm === undefined || distanceKm === null || Number.isNaN(distanceKm)) {
    return undefined;
  }

  // Conservative urban speed estimate for emergency routing.
  const minutes = Math.ceil((distanceKm / 35) * 60);
  return Math.max(1, Math.min(60, minutes));
};

const detectCaseLanguage = (...parts: Array<string | null | undefined>): "ar" | "en" => {
  const joined = parts
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return /[\u0600-\u06FF]/.test(joined) ? "ar" : "en";
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
  callerDetailsPending: Boolean(row.caller_details_pending),
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

const normalizeCallerPhone = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const cleaned = value.trim().replace(/\s+/g, "");
  if (!cleaned) {
    return undefined;
  }

  if (/^\+?[0-9-]{4,32}$/.test(cleaned)) {
    return cleaned;
  }

  return undefined;
};

const sanitizeCallerName = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length >= 2 ? cleaned.slice(0, 120) : undefined;
};

const buildCallerEmail = (callerPhone?: string): string => {
  const digits = (callerPhone ?? "").replace(/\D/g, "");
  const localPart = digits ? `caller.${digits}` : `caller.${Date.now()}.${randomUUID().slice(0, 8)}`;
  return `${localPart}@rapidaid.local`;
};

const resolveReporterForEmergency = async (
  auth: AuthContext,
  input: CreateEmergencyInput
): Promise<{ reportingUserId: string; callerPhone?: string; callerName?: string }> => {
  const isDispatcherRequest = auth.role === "DISPATCHER" || auth.role === "ADMIN";

  if (!isDispatcherRequest) {
    return {
      reportingUserId: auth.userId
    };
  }

  if (input.callerUserId) {
    const callerUser = await authRepository.findUserById(input.callerUserId);
    if (!callerUser || callerUser.role !== "CITIZEN") {
      throw new AppError("callerUserId must reference an active citizen account", 400);
    }

    return {
      reportingUserId: callerUser.id,
      callerPhone: callerUser.phone ?? undefined,
      callerName: callerUser.full_name
    };
  }

  const callerPhone = normalizeCallerPhone(input.callerPhone);
  const callerName = sanitizeCallerName(input.callerName);

  if (!callerPhone) {
    throw new AppError("callerPhone is required when dispatcher creates a case", 400);
  }

  const existingCaller = await authRepository.findCitizenByPhone(callerPhone);
  if (existingCaller) {
    return {
      reportingUserId: existingCaller.id,
      callerPhone,
      callerName: existingCaller.full_name
    };
  }

  let callerEmail = buildCallerEmail(callerPhone);
  while (await authRepository.findUserByEmail(callerEmail)) {
    callerEmail = `caller.${Date.now()}.${randomUUID().slice(0, 8)}@rapidaid.local`;
  }

  const createdCaller = await authRepository.createUser({
    fullName: callerName ?? `Caller ${callerPhone}`,
    email: callerEmail,
    phone: callerPhone,
    passwordHash: await hashPassword(randomUUID()),
    role: "CITIZEN"
  });

  await authRepository.bootstrapRoleProfile({
    userId: createdCaller.id,
    role: createdCaller.role
  });

  return {
    reportingUserId: createdCaller.id,
    callerPhone,
    callerName: createdCaller.full_name
  };
};

type CreateEmergencyOptions = {
  /** Citizen voice-call init: notify volunteers immediately but keep clinical details empty until dispatcher updates. */
  callerDetailsPendingForVolunteers?: boolean;
};

const notifyVolunteersCaseDetailsReady = async (caseId: string, row: EmergencyCaseRow): Promise<void> => {
  const dto = toCaseDto(row);
  const targets = await emergencyRepository.listVolunteerPushTargetsForCase(caseId);
  if (targets.length === 0) {
    return;
  }

  const location = {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude)
  };

  await pushNotificationService.sendEmergencyAlert({
    targets: targets.map((t) => ({ volunteerId: t.volunteer_id, userId: t.user_id })),
    payload: {
      emergencyId: caseId,
      location,
      type: row.emergency_type,
      severity: row.priority,
      summary: row.voice_description ?? row.transcription_text ?? undefined,
      language: detectCaseLanguage(
        row.voice_description,
        row.transcription_text,
        row.ai_analysis,
        row.emergency_type
      ),
      detailsUpdated: true
    }
  });

  emitVolunteerAssigned(caseId, {
    caseId,
    case: dto,
    caseDetailsReady: true
  });
};

export const emergencyService = {
  createEmergency: async (auth: AuthContext, input: CreateEmergencyInput, options?: CreateEmergencyOptions) => {
    const reporter = await resolveReporterForEmergency(auth, input);
    const caseNumber = await emergencyRepository.generateCaseNumber();

    const callerDetailsPending = options?.callerDetailsPendingForVolunteers === true;

    const created = await emergencyRepository.createEmergencyCase({
      caseNumber,
      reportingUserId: reporter.reportingUserId,
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
      volunteerEtaMinutes: input.volunteerEtaMinutes,
      callerDetailsPending
    });

    await emergencyRepository.createEmergencyUpdate({
      caseId: created.id,
      authorUserId: auth.userId,
      updateType: "CASE_CREATED",
      message: "Emergency request created",
      payload: {
        priority: created.priority,
        status: created.status,
        reportingUserId: reporter.reportingUserId,
        callerPhone: reporter.callerPhone ?? null,
        callerName: reporter.callerName ?? null
      }
    });
    let currentCase = created;
    let ambulanceAssignment: ReturnType<typeof toAmbulanceAssignmentDto> | null = null;
    const volunteerAssignments: ReturnType<typeof toVolunteerAssignmentDto>[] = [];
    const emergencyLocation = {
      latitude: Number(created.latitude),
      longitude: Number(created.longitude)
    };

    const nearestAmbulance = await emergencyRepository.findNearestAmbulance({
      latitude: emergencyLocation.latitude,
      longitude: emergencyLocation.longitude
    });

    if (nearestAmbulance?.id) {
      const ambulanceDistanceKm = Number(nearestAmbulance.distance_km);
      const ambulanceEtaMinutes = estimateEtaMinutesFromDistance(ambulanceDistanceKm);

      const assignedAmbulance = await emergencyRepository.assignAmbulance({
        caseId: created.id,
        ambulanceId: nearestAmbulance.id,
        assignedByUserId: auth.userId,
        etaMinutes: ambulanceEtaMinutes,
        distanceKm: ambulanceDistanceKm
      });

      const caseAfterAmbulance = await emergencyRepository.updateCaseStatus({
        caseId: created.id,
        status: "AMBULANCE_ASSIGNED",
        ambulanceEtaMinutes: assignedAmbulance.eta_minutes ?? ambulanceEtaMinutes
      });

      if (caseAfterAmbulance) {
        currentCase = caseAfterAmbulance;
      }

      ambulanceAssignment = toAmbulanceAssignmentDto(assignedAmbulance);
    }

    const nearbyVolunteers = await emergencyRepository.listNearbyVolunteers({
      latitude: emergencyLocation.latitude,
      longitude: emergencyLocation.longitude,
      radiusKm: 30,
      limit: 50
    });
    const nearestVolunteers = findNearestVolunteers(
      emergencyLocation,
      nearbyVolunteers.map((volunteer) => ({
        ...volunteer,
        latitude: volunteer.current_latitude ? Number(volunteer.current_latitude) : null,
        longitude: volunteer.current_longitude ? Number(volunteer.current_longitude) : null
      })),
      5
    );

    for (const nearby of nearestVolunteers) {
      const distanceKm = Number(nearby.distanceKm);
      const etaMinutes = estimateEtaMinutesFromDistance(distanceKm);

      const assignment = await emergencyRepository.assignVolunteer({
        caseId: created.id,
        volunteerId: nearby.volunteer_id,
        assignedByUserId: auth.userId,
        etaMinutes,
        distanceKm
      });

      volunteerAssignments.push(toVolunteerAssignmentDto(assignment));
    }

    const pushDispatch = await pushNotificationService.sendEmergencyAlert({
      targets: nearestVolunteers.map((volunteer) => ({
        volunteerId: volunteer.volunteer_id,
        userId: volunteer.user_id
      })),
      payload: callerDetailsPending
        ? {
            emergencyId: created.id,
            location: emergencyLocation,
            type: detectCaseLanguage(created.voice_description, created.transcription_text, created.ai_analysis) === "ar"
              ? "مكالمة طوارئ"
              : "Emergency call",
            severity: currentCase.priority,
            language: detectCaseLanguage(
              created.voice_description,
              created.transcription_text,
              created.ai_analysis,
              created.emergency_type
            ),
            detailsPending: true
          }
        : {
            emergencyId: created.id,
            location: emergencyLocation,
            type: created.emergency_type,
            severity: currentCase.priority,
            summary: created.voice_description ?? created.transcription_text ?? undefined,
            language: detectCaseLanguage(
              created.voice_description,
              created.transcription_text,
              created.ai_analysis,
              created.emergency_type
            )
          }
    });

    if (volunteerAssignments.length > 0) {
      const fastestVolunteerEta = volunteerAssignments
        .map((assignment) => assignment.etaMinutes)
        .filter((eta): eta is number => typeof eta === "number")
        .sort((a, b) => a - b)[0];

      const caseAfterVolunteerNotification = await emergencyRepository.updateCaseStatus({
        caseId: created.id,
        status: "VOLUNTEERS_NOTIFIED",
        volunteerEtaMinutes: fastestVolunteerEta
      });

      if (caseAfterVolunteerNotification) {
        currentCase = caseAfterVolunteerNotification;
      }
    }

    await emergencyRepository.createEmergencyUpdate({
      caseId: created.id,
      authorUserId: auth.userId,
      updateType: "AUTO_DISPATCHED",
      message: "Auto-dispatch started (ambulance + nearest volunteers)",
      payload: {
        ambulanceAssigned: Boolean(ambulanceAssignment),
        volunteerRequestsCount: volunteerAssignments.length
      }
    });

    return {
      ...toCaseDto(currentCase),
      autoDispatch: {
        ambulanceAssignment,
        volunteerAssignments,
        notifications: pushDispatch
      }
    };
  },

  initEmergencyCall: async (auth: AuthContext, input: InitEmergencyCallInput) => {
    if (auth.role === "AMBULANCE_CREW") {
      throw new AppError("Ambulance crew cannot initialize emergency calls directly", 403);
    }

    const requestedUserId = input.userId?.trim();

    if ((auth.role === "CITIZEN" || auth.role === "VOLUNTEER") && requestedUserId && requestedUserId !== auth.userId) {
      throw new AppError("You can only initialize calls for your own account", 403);
    }

    if ((auth.role === "DISPATCHER" || auth.role === "ADMIN") && !requestedUserId) {
      throw new AppError("userId is required when dispatcher initializes a call", 400);
    }

    const linkedCallerUserId =
      auth.role === "CITIZEN" || auth.role === "VOLUNTEER" ? auth.userId : requestedUserId ?? auth.userId;
    const isVolunteerCaller = auth.role === "VOLUNTEER";

    return emergencyService.createEmergency(
      auth,
      {
        emergencyType: (input.callType || (isVolunteerCaller ? "Volunteer Emergency Call" : "Emergency Voice Call")).trim(),
        priority: isVolunteerCaller ? "CRITICAL" : "HIGH",
        voiceDescription: isVolunteerCaller
          ? "Volunteer initiated emergency call. Ambulance dispatch started."
          : "Emergency call started. AI listening is active.",
        address: input.location.address?.trim() || "Live caller location",
        latitude: input.location.latitude,
        longitude: input.location.longitude,
        riskLevel: isVolunteerCaller ? "CRITICAL" : "HIGH",
        ...(auth.role === "DISPATCHER" || auth.role === "ADMIN"
          ? { callerUserId: linkedCallerUserId }
          : {})
      },
      auth.role === "CITIZEN" && !isVolunteerCaller ? { callerDetailsPendingForVolunteers: true } : undefined
    );
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

    if (input.status === "CLOSED" || input.status === "CANCELLED") {
      virtualAmbulanceService.stopForCase(caseId);
    }

    return toCaseDto(updated);
  },

  updateDetails: async (auth: AuthContext, caseId: string, input: UpdateEmergencyDetailsInput) => {
    requireRole(auth, ["DISPATCHER", "ADMIN"]);

    const hasAnyField = Object.values(input).some((value) => value !== undefined);
    if (!hasAnyField) {
      throw new AppError("At least one field is required for update", 400);
    }

    const existing = await emergencyRepository.findCaseById(caseId);

    if (!existing) {
      throw new AppError("Emergency case not found", 404);
    }

    const hadCallerDetailsPending = Boolean(existing.caller_details_pending);

    const updated = await emergencyRepository.updateCaseDetails({
      caseId,
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

    if (!updated) {
      throw new AppError("Emergency case could not be updated", 500);
    }

    await emergencyRepository.createEmergencyUpdate({
      caseId,
      authorUserId: auth.userId,
      updateType: "CASE_DETAILS_UPDATED",
      message: "Case details updated by dispatcher",
      payload: input
    });

    if (hadCallerDetailsPending && updated) {
      await notifyVolunteersCaseDetailsReady(caseId, updated);
    }

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

    let assignment = input.assignmentId
      ? await emergencyRepository.findVolunteerAssignmentById(input.assignmentId)
      : await emergencyRepository.findVolunteerAssignmentByCase({ caseId, volunteerId });

    // Self-claim: if volunteer received the broadcast alert but no formal
    // assignment exists yet (no dispatcher intervention), allow them to
    // claim the case directly by creating an assignment on the fly.
    if (!assignment) {
      const caseExists = await emergencyRepository.findCaseById(caseId);
      if (!caseExists) {
        throw new AppError("Emergency case not found", 404);
      }

      if (!input.accepted) {
        // Nothing to decline if no assignment existed.
        return {
          case: toCaseDto(caseExists),
          assignment: null
        };
      }

      assignment = await emergencyRepository.assignVolunteer({
        caseId,
        volunteerId,
        assignedByUserId: auth.userId,
        etaMinutes: input.etaMinutes,
        distanceKm: undefined
      });
    }

    if (assignment.case_id !== caseId) {
      throw new AppError("Assignment does not match this case", 400);
    }

    if (assignment.volunteer_id !== volunteerId) {
      throw new AppError("You can only respond to your own assignment", 403);
    }

    const caseRow = await emergencyRepository.findCaseById(caseId);
    if (caseRow?.caller_details_pending && input.accepted) {
      throw new AppError(
        "Caller case details are still being collected. Wait for the updated alert, or decline if you cannot respond.",
        409
      );
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
    virtualAmbulanceService.stopForCase(caseId);

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
