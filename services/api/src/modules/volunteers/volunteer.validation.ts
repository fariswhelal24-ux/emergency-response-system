import { z } from "zod";

import { volunteerAvailabilities } from "../../shared/types/domain";

export const updateVolunteerProfileSchema = z.object({
  specialty: z.string().trim().min(2).max(120).optional(),
  verificationBadge: z.string().trim().min(2).max(120).optional(),
  responseRadiusKm: z.number().min(1).max(50).optional(),
  yearsVolunteering: z.number().int().min(0).max(80).optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  licenses: z.array(z.string().min(2).max(120)).optional()
});

export const updateAvailabilitySchema = z.object({
  availability: z.enum(volunteerAvailabilities),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional()
});

export const nearbyVolunteerQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(50).default(5),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export type UpdateVolunteerProfileInput = z.infer<typeof updateVolunteerProfileSchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
export type NearbyVolunteerQueryInput = z.infer<typeof nearbyVolunteerQuerySchema>;
