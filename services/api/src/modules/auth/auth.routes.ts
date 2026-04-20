import { Request, Response, Router } from "express";

import { db } from "../../database/pool.js";
import { initDatabase } from "../../database/init.js";
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

authRoutes.post(
  "/admin/prune-role",
  asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const provided = request.header("x-admin-secret") || "";
    if (!provided || provided !== ADMIN_WIPE_SECRET) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }

    const bodyRole = typeof request.body?.role === "string" ? request.body.role.toUpperCase() : "";
    const allowedRoles = new Set(["CITIZEN", "VOLUNTEER", "DISPATCHER", "ADMIN"]);
    if (!allowedRoles.has(bodyRole)) {
      response.status(400).json({
        error: "Invalid role",
        allowedRoles: [...allowedRoles]
      });
      return;
    }

    const rawKeep = Array.isArray(request.body?.keepEmails) ? request.body.keepEmails : [];
    const keepEmails = rawKeep
      .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value: string) => value.trim().toLowerCase());

    const selectSql = `SELECT id, email, full_name FROM users WHERE role = $1`;
    const selected = await db.query<{ id: string; email: string | null; full_name: string }>(selectSql, [
      bodyRole
    ]);

    const toDelete = selected.rows.filter(
      (row) => !row.email || !keepEmails.includes(row.email.toLowerCase())
    );
    const kept = selected.rows.filter(
      (row) => row.email && keepEmails.includes(row.email.toLowerCase())
    );

    const deletedIds = toDelete.map((row) => row.id);

    const cascadeTables: Array<{ sql: string; key: string }> = [
      {
        sql: `DELETE FROM volunteer_assignments WHERE volunteer_id IN (
                SELECT id FROM volunteers WHERE user_id = ANY($1::uuid[])
              )`,
        key: "volunteer_assignments"
      },
      {
        sql: `DELETE FROM messages WHERE sender_user_id = ANY($1::uuid[]) OR recipient_user_id = ANY($1::uuid[])`,
        key: "messages"
      },
      {
        sql: `DELETE FROM live_locations WHERE user_id = ANY($1::uuid[])`,
        key: "live_locations"
      },
      {
        sql: `DELETE FROM location_updates WHERE user_id = ANY($1::uuid[])`,
        key: "location_updates"
      },
      {
        sql: `DELETE FROM emergency_updates WHERE author_user_id = ANY($1::uuid[])`,
        key: "emergency_updates"
      },
      {
        sql: `DELETE FROM volunteers WHERE user_id = ANY($1::uuid[])`,
        key: "volunteers"
      },
      {
        sql: `DELETE FROM medical_profiles WHERE user_id = ANY($1::uuid[])`,
        key: "medical_profiles"
      },
      {
        sql: `DELETE FROM dispatchers WHERE user_id = ANY($1::uuid[])`,
        key: "dispatchers"
      },
      {
        sql: `DELETE FROM refresh_tokens WHERE user_id = ANY($1::uuid[])`,
        key: "refresh_tokens"
      },
      {
        sql: `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        key: "users"
      }
    ];

    const results: Record<string, number> = {};

    if (deletedIds.length === 0) {
      response.status(200).json({
        message: "Nothing to delete",
        role: bodyRole,
        keptEmails: kept.map((row) => row.email),
        deletedEmails: [],
        counts: results
      });
      return;
    }

    for (const step of cascadeTables) {
      try {
        const result = await db.query(step.sql, [deletedIds]);
        results[step.key] = result.rowCount ?? 0;
      } catch (error) {
        results[step.key] = -1;
        console.warn(`[ADMIN_PRUNE] Failed step ${step.key}:`, error);
      }
    }

    response.status(200).json({
      message: `Pruned users with role ${bodyRole}`,
      role: bodyRole,
      keptEmails: kept.map((row) => row.email),
      deletedEmails: toDelete.map((row) => row.email),
      counts: results
    });
  })
);

authRoutes.get(
  "/admin/list-role",
  asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const provided = request.header("x-admin-secret") || "";
    if (!provided || provided !== ADMIN_WIPE_SECRET) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }
    const role = typeof request.query.role === "string" ? request.query.role.toUpperCase() : "";
    const allowedRoles = new Set(["CITIZEN", "VOLUNTEER", "DISPATCHER", "ADMIN"]);
    if (!allowedRoles.has(role)) {
      response.status(400).json({ error: "Invalid role", allowedRoles: [...allowedRoles] });
      return;
    }
    const result = await db.query<{
      id: string;
      email: string | null;
      full_name: string;
      created_at: string;
    }>(
      `SELECT id, email, full_name, created_at FROM users WHERE role = $1 ORDER BY created_at DESC`,
      [role]
    );
    response.status(200).json({ role, count: result.rowCount ?? 0, users: result.rows });
  })
);

authRoutes.post(
  "/admin/repair-schema",
  asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const provided = request.header("x-admin-secret") || "";
    if (!provided || provided !== ADMIN_WIPE_SECRET) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      await initDatabase();
      response.status(200).json({ message: "Schema repaired" });
    } catch (error) {
      response.status(500).json({
        error: "Schema repair failed",
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  })
);
