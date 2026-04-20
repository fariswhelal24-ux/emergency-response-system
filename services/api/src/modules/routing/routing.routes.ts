import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { routingController } from "./routing.controller.js";

export const routingRoutes = Router();

routingRoutes.get("/route", authenticate, asyncHandler(routingController.getRoute));
