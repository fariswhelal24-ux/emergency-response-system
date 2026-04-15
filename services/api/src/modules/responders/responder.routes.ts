import { Router } from "express";

import { authenticate, authorizeRoles } from "../../middlewares/authenticate.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { responderController } from "./responder.controller.js";

export const responderRoutes = Router();

responderRoutes.use(authenticate, authorizeRoles("DISPATCHER", "ADMIN", "AMBULANCE_CREW"));

responderRoutes.get("/", asyncHandler(responderController.listAll));
