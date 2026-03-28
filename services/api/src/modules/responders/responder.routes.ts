import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/authenticate";
import { asyncHandler } from "../../shared/utils/asyncHandler";
import { responderController } from "./responder.controller";

export const responderRoutes = Router();

responderRoutes.use(authenticate, authorizeRoles("DISPATCHER", "ADMIN", "AMBULANCE_CREW"));

responderRoutes.get("/", asyncHandler(responderController.listAll));
