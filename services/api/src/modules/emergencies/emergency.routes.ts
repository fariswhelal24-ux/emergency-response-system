import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/authenticate.js";
import { validateBody } from "../../middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { emergencyController } from "./emergency.controller.js";
import {
  assignAmbulanceSchema,
  assignVolunteerSchema,
  closeIncidentSchema,
  createEmergencySchema,
  initEmergencyCallSchema,
  sendEmergencyUpdateSchema,
  updateEmergencyDetailsSchema,
  updateEmergencyStatusSchema,
  volunteerResponseSchema
} from "./emergency.validation.js";

export const emergencyRoutes = Router();

emergencyRoutes.use(authenticate);

emergencyRoutes.post("/init", validateBody(initEmergencyCallSchema), asyncHandler(emergencyController.initEmergencyCall));
emergencyRoutes.post("/", validateBody(createEmergencySchema), asyncHandler(emergencyController.createEmergency));
emergencyRoutes.get("/", asyncHandler(emergencyController.listEmergencies));
emergencyRoutes.get("/:caseId", asyncHandler(emergencyController.getEmergencyById));
emergencyRoutes.patch(
  "/:caseId",
  authorizeRoles("DISPATCHER", "ADMIN"),
  validateBody(updateEmergencyDetailsSchema),
  asyncHandler(emergencyController.updateDetails)
);
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
