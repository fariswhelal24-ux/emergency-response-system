import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/authenticate";
import { validateBody } from "../../middlewares/validate";
import { asyncHandler } from "../../shared/utils/asyncHandler";
import { dispatcherController } from "./dispatcher.controller";
import {
  assignAmbulanceSchema,
  assignVolunteerSchema,
  closeIncidentSchema
} from "../emergencies/emergency.validation";

export const dispatcherRoutes = Router();

dispatcherRoutes.use(authenticate, authorizeRoles("DISPATCHER", "ADMIN"));

dispatcherRoutes.get("/overview", asyncHandler(dispatcherController.getDashboardOverview));
dispatcherRoutes.get("/active-cases", asyncHandler(dispatcherController.getActiveCases));
dispatcherRoutes.get("/cases/:caseId", asyncHandler(dispatcherController.getCaseDetails));
dispatcherRoutes.post(
  "/cases/:caseId/assign-ambulance",
  validateBody(assignAmbulanceSchema),
  asyncHandler(dispatcherController.assignAmbulance)
);
dispatcherRoutes.post(
  "/cases/:caseId/assign-volunteer",
  validateBody(assignVolunteerSchema),
  asyncHandler(dispatcherController.assignVolunteer)
);
dispatcherRoutes.post(
  "/cases/:caseId/close",
  validateBody(closeIncidentSchema),
  asyncHandler(dispatcherController.closeCase)
);
dispatcherRoutes.get("/reports/summary", asyncHandler(dispatcherController.getReportsSummary));
