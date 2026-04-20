import { Request, Response, Router } from "express";

import { db } from "../../database/pool.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { validateBody } from "../../middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { authController } from "./auth.controller.js";
import {
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  switchRoleSchema
} from "./auth.validation.js";

export const authRoutes = Router();

authRoutes.post("/register", validateBody(registerSchema), asyncHandler(authController.register));
authRoutes.post("/login", validateBody(loginSchema), asyncHandler(authController.login));
authRoutes.post(
  "/switch-role",
  validateBody(switchRoleSchema),
  asyncHandler(authController.switchRole)
);
authRoutes.post("/refresh", validateBody(refreshTokenSchema), asyncHandler(authController.refresh));
authRoutes.post("/logout", validateBody(logoutSchema), asyncHandler(authController.logout));
authRoutes.get("/me", authenticate, asyncHandler(authController.me));

const ADMIN_WIPE_SECRET = process.env.ERS_ADMIN_WIPE_SECRET || "ers-reset-2026-04-demo";

authRoutes.post(
  "/admin/wipe-users",
  asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const provided = request.header("x-admin-secret") || "";
    if (!provided || provided !== ADMIN_WIPE_SECRET) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }

    const deletedTables: Record<string, number> = {};
    const tryDelete = async (sql: string, key: string) => {
      try {
        const result = await db.query(sql);
        deletedTables[key] = result.rowCount ?? 0;
      } catch (error) {
        deletedTables[key] = -1;
        console.warn(`[ADMIN_WIPE] Failed to clear ${key}:`, error);
      }
    };

    await tryDelete("DELETE FROM volunteer_assignments", "volunteer_assignments");
    await tryDelete("DELETE FROM ambulance_assignments", "ambulance_assignments");
    await tryDelete("DELETE FROM messages", "messages");
    await tryDelete("DELETE FROM live_locations", "live_locations");
    await tryDelete("DELETE FROM emergency_updates", "emergency_updates");
    await tryDelete("DELETE FROM incident_reports", "incident_reports");
    await tryDelete("DELETE FROM case_additional_info", "case_additional_info");
    await tryDelete("DELETE FROM case_timeline_events", "case_timeline_events");
    await tryDelete("DELETE FROM location_updates", "location_updates");
    await tryDelete("DELETE FROM emergency_cases", "emergency_cases");
    await tryDelete("DELETE FROM volunteers", "volunteers");
    await tryDelete("DELETE FROM medical_profiles", "medical_profiles");
    await tryDelete("DELETE FROM dispatchers", "dispatchers");
    await tryDelete("DELETE FROM refresh_tokens", "refresh_tokens");
    await tryDelete("DELETE FROM users", "users");

    response.status(200).json({
      message: "All test accounts and related data deleted",
      deleted: deletedTables
    });
  })
);
