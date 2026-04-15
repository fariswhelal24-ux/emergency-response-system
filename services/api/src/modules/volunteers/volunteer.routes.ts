import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/authenticate.js";
import { validateBody } from "../../middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { volunteerController } from "./volunteer.controller.js";
import { updateAvailabilitySchema, updateVolunteerProfileSchema } from "./volunteer.validation.js";

export const volunteerRoutes = Router();

volunteerRoutes.use(authenticate);

volunteerRoutes.get(
  "/me/profile",
  authorizeRoles("VOLUNTEER", "ADMIN"),
  asyncHandler(volunteerController.getMyProfile)
);
volunteerRoutes.patch(
  "/me/profile",
  authorizeRoles("VOLUNTEER", "ADMIN"),
  validateBody(updateVolunteerProfileSchema),
  asyncHandler(volunteerController.updateMyProfile)
);
volunteerRoutes.patch(
  "/me/availability",
  authorizeRoles("VOLUNTEER", "ADMIN"),
  validateBody(updateAvailabilitySchema),
  asyncHandler(volunteerController.updateAvailability)
);
volunteerRoutes.get(
  "/me/incidents",
  authorizeRoles("VOLUNTEER", "ADMIN"),
  asyncHandler(volunteerController.getMyIncidents)
);
volunteerRoutes.get(
  "/nearby",
  authorizeRoles("DISPATCHER", "ADMIN", "AMBULANCE_CREW", "VOLUNTEER"),
  asyncHandler(volunteerController.listNearby)
);
