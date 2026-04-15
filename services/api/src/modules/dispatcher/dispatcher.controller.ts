import { Request, Response } from "express";

import { AppError } from "../../shared/errors/AppError.js";
import {
  emitAmbulanceAssigned,
  emitCaseClosed,
  emitVolunteerAssigned
} from "../../sockets/realtimeServer.js";
import { dispatcherService } from "./dispatcher.service.js";
import {
  AssignAmbulanceInput,
  AssignVolunteerInput,
  CloseIncidentInput
} from "../emergencies/emergency.validation.js";
import { getRequiredRouteParam } from "../../shared/utils/request.js";

const getAuth = (request: Request) => {
  if (!request.authUser) {
    throw new AppError("Authentication required", 401);
  }

  return {
    userId: request.authUser.userId,
    role: request.authUser.role,
    email: request.authUser.email
  };
};

export const dispatcherController = {
  getDashboardOverview: async (request: Request, response: Response): Promise<void> => {
    const data = await dispatcherService.getDashboardOverview(getAuth(request));

    response.json({ data });
  },

  getActiveCases: async (request: Request, response: Response): Promise<void> => {
    const data = await dispatcherService.getDashboardOverview(getAuth(request));

    response.json({
      data: data.activeCases,
      meta: {
        count: data.activeCases.length
      }
    });
  },

  getCaseDetails: async (request: Request, response: Response): Promise<void> => {
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const data = await dispatcherService.getCaseDetails(getAuth(request), caseId);

    response.json({ data });
  },

  assignAmbulance: async (request: Request, response: Response): Promise<void> => {
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const payload = request.body as AssignAmbulanceInput;
    const data = await dispatcherService.assignAmbulance(getAuth(request), caseId, payload);

    emitAmbulanceAssigned(caseId, {
      caseId,
      assignment: data.assignment,
      case: data.case
    });

    response.status(201).json({
      message: "Ambulance assigned",
      data
    });
  },

  assignVolunteer: async (request: Request, response: Response): Promise<void> => {
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const payload = request.body as AssignVolunteerInput;
    const data = await dispatcherService.assignVolunteer(getAuth(request), caseId, payload);

    emitVolunteerAssigned(caseId, {
      caseId,
      assignment: data.assignment,
      case: data.case
    });

    response.status(201).json({
      message: "Volunteer alerted",
      data
    });
  },

  closeCase: async (request: Request, response: Response): Promise<void> => {
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const payload = request.body as CloseIncidentInput;
    const data = await dispatcherService.closeCase(getAuth(request), caseId, payload);

    emitCaseClosed(caseId, {
      caseId,
      case: data
    });

    response.json({
      message: "Case closed",
      data
    });
  },

  getReportsSummary: async (request: Request, response: Response): Promise<void> => {
    const reports = await dispatcherService.getReportSummary(getAuth(request));

    response.json({
      data: reports,
      meta: {
        count: reports.length
      }
    });
  }
};
