import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/authenticate";
import { validateBody } from "../../middlewares/validate";
import { asyncHandler } from "../../shared/utils/asyncHandler";
import { emergencyController } from "./emergency.controller";
import {
  assignAmbulanceSchema,
  assignVolunteerSchema,
  closeIncidentSchema,
  createEmergencySchema,
  sendEmergencyUpdateSchema,
  updateEmergencyStatusSchema,
  volunteerResponseSchema
} from "./emergency.validation";

export const emergencyRoutes = Router();

emergencyRoutes.use(authenticate);

emergencyRoutes.post("/", validateBody(createEmergencySchema), asyncHandler(emergencyController.createEmergency));
emergencyRoutes.get("/", asyncHandler(emergencyController.listEmergencies));
emergencyRoutes.get("/:caseId", asyncHandler(emergencyController.getEmergencyById));
emergencyRoutes.patch(
  "/:caseId/status",
  authorizeRoles("VOLUNTEER", "DISPATCHER", "AMBULANCE_CREW", "ADMIN"),
  validateBody(updateEmergencyStatusSchema),
  asyncHandler(emergencyController.updateStatus)
);
emergencyRoutes.post(
  "/:caseId/assign-ambulance",
  authorizeRoles("DISPATCHER", "ADMIN"),
  validateBody(assignAmbulanceSchema),
  asyncHandler(emergencyController.assignAmbulance)
);
emergencyRoutes.post(
  "/:caseId/assign-volunteer",
  authorizeRoles("DISPATCHER", "ADMIN"),
  validateBody(assignVolunteerSchema),
  asyncHandler(emergencyController.assignVolunteer)
);
emergencyRoutes.post(
  "/:caseId/volunteer-response",
  authorizeRoles("VOLUNTEER"),
  validateBody(volunteerResponseSchema),
  asyncHandler(emergencyController.volunteerRespond)
);
emergencyRoutes.post(
  "/:caseId/updates",
  validateBody(sendEmergencyUpdateSchema),
  asyncHandler(emergencyController.addEmergencyUpdate)
);
emergencyRoutes.get("/:caseId/updates", asyncHandler(emergencyController.listCaseUpdates));
emergencyRoutes.get(
  "/:caseId/nearby-volunteers",
  authorizeRoles("DISPATCHER", "ADMIN"),
  asyncHandler(emergencyController.nearbyVolunteers)
);
emergencyRoutes.post(
  "/:caseId/close",
  authorizeRoles("DISPATCHER", "ADMIN"),
  validateBody(closeIncidentSchema),
  asyncHandler(emergencyController.closeIncident)
);
