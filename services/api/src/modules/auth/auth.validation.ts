import { z } from "zod";

import { userRoles } from "../../shared/types/domain.js";

const roleSchema = z.enum(userRoles);

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().min(6).max(20).optional(),
  password: z.string().min(8).max(128),
  role: roleSchema.default("CITIZEN")
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(128)
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20)
});

export const logoutSchema = refreshTokenSchema;

export const switchRoleSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(128),
  newRole: roleSchema
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshTokenSchema>;
export type SwitchRoleInput = z.infer<typeof switchRoleSchema>;
