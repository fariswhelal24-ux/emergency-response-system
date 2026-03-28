import { z } from "zod";

import { userRoles } from "../../shared/types/domain";

const roleSchema = z.enum(userRoles);

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().min(6).max(20).optional(),
  password: z.string().min(8).max(128),
  role: roleSchema.default("CITIZEN")
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128)
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20)
});

export const logoutSchema = refreshTokenSchema;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshTokenSchema>;
