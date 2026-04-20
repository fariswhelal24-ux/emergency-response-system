import { z } from "zod";

export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

export const routeQuerySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  toLat: z.coerce.number().min(-90).max(90),
  toLng: z.coerce.number().min(-180).max(180),
  mode: z.enum(["fastest", "shortest"]).optional().default("fastest"),
  avoidTraffic: z.coerce.boolean().optional().default(true)
});

export type RouteQueryInput = z.infer<typeof routeQuerySchema>;
export type RouteCoordinate = z.infer<typeof coordinateSchema>;
