import { Request, Response } from "express";

import { routingService } from "./routing.service.js";
import { routeQuerySchema } from "./routing.validation.js";

export const routingController = {
  getRoute: async (request: Request, response: Response): Promise<void> => {
    const parsed = routeQuerySchema.parse(request.query);

    const result = await routingService.getRoute(
      { latitude: parsed.fromLat, longitude: parsed.fromLng },
      { latitude: parsed.toLat, longitude: parsed.toLng },
      { mode: parsed.mode, avoidTraffic: parsed.avoidTraffic }
    );

    response.status(200).json({
      message: "Route computed",
      data: {
        from: { latitude: parsed.fromLat, longitude: parsed.fromLng },
        to: { latitude: parsed.toLat, longitude: parsed.toLng },
        mode: parsed.mode,
        provider: result.provider,
        trafficAware: result.trafficAware,
        distanceKm: Number(result.distanceKm.toFixed(3)),
        durationMinutes: result.durationMinutes,
        geometry: result.geometry
      }
    });
  }
};
