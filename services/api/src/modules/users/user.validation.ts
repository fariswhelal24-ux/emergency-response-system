import { z } from "zod";

export const updateUserProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(24).optional(),
  avatarUrl: z.string().trim().url().max(400).optional()
});

export const updateMedicalProfileSchema = z.object({
  bloodType: z.string().trim().max(8).optional(),
  conditions: z.string().trim().max(2000).optional(),
  allergies: z.string().trim().max(2000).optional(),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: z.string().trim().max(24).optional(),
  healthDataSharing: z.boolean().optional()
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type UpdateMedicalProfileInput = z.infer<typeof updateMedicalProfileSchema>;
