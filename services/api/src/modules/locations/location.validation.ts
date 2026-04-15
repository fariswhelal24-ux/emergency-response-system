import { z } from "zod";

import { locationActors } from "../../shared/types/domain.js";

export const createLocationUpdateSchema = z.object({
  caseId: z.string().uuid().optional(),
  actorType: z.enum(locationActors).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speedKmh: z.number().min(0).max(320).optional(),
  etaMinutes: z.number().int().min(0).max(180).optional(),
  ambulanceId: z.string().uuid().optional()
});

export const nearbyQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(50).default(5),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export const nearestAmbulanceQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(20).default(5)
});

export type CreateLocationUpdateInput = z.infer<typeof createLocationUpdateSchema>;
export type NearbyQueryInput = z.infer<typeof nearbyQuerySchema>;
export type NearestAmbulanceQueryInput = z.infer<typeof nearestAmbulanceQuerySchema>;
