import { Request, Response } from "express";

import { AppError } from "../../shared/errors/AppError";
import {
  emitAmbulanceAssigned,
  emitCaseClosed,
  emitEmergencyCreated,
  emitEmergencyUpdate,
  emitStatusChanged,
  emitVolunteerAssigned,
  emitVolunteerResponse
} from "../../sockets/realtimeServer";
import { emergencyService } from "./emergency.service";
import {
  AssignAmbulanceInput,
  AssignVolunteerInput,
  CloseIncidentInput,
  CreateEmergencyInput,
  EmergencyListQueryInput,
  SendEmergencyUpdateInput,
  UpdateEmergencyStatusInput,
  VolunteerResponseInput,
  emergencyListQuerySchema
} from "./emergency.validation";
import { getRequiredRouteParam } from "../../shared/utils/request";

const getAuthContext = (request: Request) => {
  if (!request.authUser) {
    throw new AppError("Authentication required", 401);
  }

  return {
    userId: request.authUser.userId,
    role: request.authUser.role,
    email: request.authUser.email
  };
};

export const emergencyController = {
  createEmergency: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const payload = request.body as CreateEmergencyInput;
    const emergencyCase = await emergencyService.createEmergency(auth, payload);

    emitEmergencyCreated(emergencyCase);

    response.status(201).json({
      message: "Emergency request created successfully",
      data: emergencyCase
    });
  },

  listEmergencies: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const query = emergencyListQuerySchema.parse(request.query) as EmergencyListQueryInput;

    const emergencyCases = await emergencyService.listEmergencies(auth, query);

    response.json({
      data: emergencyCases,
      meta: {
        count: emergencyCases.length,
        limit: query.limit,
        offset: query.offset
      }
    });
  },

  getEmergencyById: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const details = await emergencyService.getEmergencyById(auth, caseId);

    response.json({
      data: details
    });
  },

  updateStatus: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const payload = request.body as UpdateEmergencyStatusInput;
    const updatedCase = await emergencyService.updateStatus(auth, caseId, payload);

    emitStatusChanged(updatedCase.id, {
      caseId: updatedCase.id,
      status: updatedCase.status,
      updatedAt: updatedCase.updatedAt,
      actorUserId: auth.userId,
      actorRole: auth.role
    });

    response.json({
      message: "Emergency status updated",
      data: updatedCase
    });
  },

  assignAmbulance: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const payload = request.body as AssignAmbulanceInput;

    const result = await emergencyService.assignAmbulance(auth, caseId, payload);

    emitAmbulanceAssigned(result.case.id, {
      caseId: result.case.id,
      assignment: result.assignment,
      case: result.case
    });

    response.status(201).json({
      message: "Ambulance assigned successfully",
      data: result
    });
  },

  assignVolunteer: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const payload = request.body as AssignVolunteerInput;

    const result = await emergencyService.assignVolunteer(auth, caseId, payload);

    emitVolunteerAssigned(result.case.id, {
      caseId: result.case.id,
      assignment: result.assignment,
      case: result.case
    });

    response.status(201).json({
      message: "Volunteer assigned successfully",
      data: result
    });
  },

  volunteerRespond: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const payload = request.body as VolunteerResponseInput;

    const result = await emergencyService.volunteerRespond(auth, caseId, payload);

    emitVolunteerResponse(result.case.id, {
      caseId: result.case.id,
      assignment: result.assignment,
      case: result.case
    });

    response.json({
      message: payload.accepted ? "Volunteer accepted the emergency" : "Volunteer declined the emergency",
      data: result
    });
  },

  addEmergencyUpdate: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const payload = request.body as SendEmergencyUpdateInput;

    const update = await emergencyService.addEmergencyUpdate(auth, caseId, payload);

    emitEmergencyUpdate(caseId, {
      caseId,
      update
    });

    response.status(201).json({
      message: "Emergency update added",
      data: update
    });
  },

  listCaseUpdates: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const updates = await emergencyService.listCaseUpdates(auth, caseId);

    response.json({
      data: updates
    });
  },

  closeIncident: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const payload = request.body as CloseIncidentInput;

    const closedCase = await emergencyService.closeIncident(auth, caseId, payload);

    emitCaseClosed(closedCase.id, {
      caseId: closedCase.id,
      case: closedCase
    });

    response.json({
      message: "Incident closed successfully",
      data: closedCase
    });
  },

  nearbyVolunteers: async (request: Request, response: Response): Promise<void> => {
    const auth = getAuthContext(request);
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const radiusKm = Number(request.query.radiusKm ?? 5);

    const volunteers = await emergencyService.getNearbyVolunteersByCase(
      auth,
      caseId,
      Number.isFinite(radiusKm) ? radiusKm : 5
    );

    response.json({
      data: volunteers
    });
  }
};
