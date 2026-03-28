import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { validateBody } from "../../middlewares/validate";
import { asyncHandler } from "../../shared/utils/asyncHandler";
import { authController } from "./auth.controller";
import {
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema
} from "./auth.validation";

export const authRoutes = Router();

authRoutes.post("/register", validateBody(registerSchema), asyncHandler(authController.register));
authRoutes.post("/login", validateBody(loginSchema), asyncHandler(authController.login));
authRoutes.post("/refresh", validateBody(refreshTokenSchema), asyncHandler(authController.refresh));
authRoutes.post("/logout", validateBody(logoutSchema), asyncHandler(authController.logout));
authRoutes.get("/me", authenticate, asyncHandler(authController.me));
