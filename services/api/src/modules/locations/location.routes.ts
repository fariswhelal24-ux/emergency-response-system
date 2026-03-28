import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/authenticate";
import { validateBody } from "../../middlewares/validate";
import { asyncHandler } from "../../shared/utils/asyncHandler";
import { locationController } from "./location.controller";
import { createLocationUpdateSchema } from "./location.validation";

export const locationRoutes = Router();

locationRoutes.use(authenticate);

locationRoutes.post("/", validateBody(createLocationUpdateSchema), asyncHandler(locationController.createLocationUpdate));
locationRoutes.get(
  "/case/:caseId",
  asyncHandler(locationController.listCaseLocations)
);
locationRoutes.get(
  "/nearby-volunteers",
  authorizeRoles("DISPATCHER", "ADMIN", "AMBULANCE_CREW", "VOLUNTEER"),
  asyncHandler(locationController.listNearbyVolunteers)
);
locationRoutes.get(
  "/nearest-ambulances",
  authorizeRoles("DISPATCHER", "ADMIN", "AMBULANCE_CREW", "VOLUNTEER"),
  asyncHandler(locationController.listNearestAmbulances)
);
