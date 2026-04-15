import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.js";
import { validateBody } from "../../middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { authController } from "./auth.controller.js";
import {
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema
} from "./auth.validation.js";

export const authRoutes = Router();

authRoutes.post("/register", validateBody(registerSchema), asyncHandler(authController.register));
authRoutes.post("/login", validateBody(loginSchema), asyncHandler(authController.login));
authRoutes.post("/refresh", validateBody(refreshTokenSchema), asyncHandler(authController.refresh));
authRoutes.post("/logout", validateBody(logoutSchema), asyncHandler(authController.logout));
authRoutes.get("/me", authenticate, asyncHandler(authController.me));
