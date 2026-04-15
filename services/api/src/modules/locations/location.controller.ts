import { Request, Response } from "express";

import { AppError } from "../../shared/errors/AppError.js";
import { emitLocationUpdated } from "../../sockets/realtimeServer.js";
import { getRequiredRouteParam } from "../../shared/utils/request.js";
import { locationService } from "./location.service.js";
import {
  CreateLocationUpdateInput,
  NearbyQueryInput,
  NearestAmbulanceQueryInput,
  nearbyQuerySchema,
  nearestAmbulanceQuerySchema
} from "./location.validation.js";

const getAuth = (request: Request) => {
  if (!request.authUser) {
    throw new AppError("Authentication required", 401);
  }

  return {
    userId: request.authUser.userId,
    role: request.authUser.role
  };
};

export const locationController = {
  createLocationUpdate: async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as CreateLocationUpdateInput;
    const location = await locationService.createLocationUpdate(getAuth(request), payload);

    if (location.caseId) {
      emitLocationUpdated(location.caseId, {
        caseId: location.caseId,
        location
      });
    }

    response.status(201).json({
      message: "Location update saved",
      data: location
    });
  },

  listCaseLocations: async (request: Request, response: Response): Promise<void> => {
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const locations = await locationService.listCaseLocations(getAuth(request), caseId);

    response.json({
      data: locations,
      meta: {
        count: locations.length
      }
    });
  },

  listNearbyVolunteers: async (request: Request, response: Response): Promise<void> => {
    const query = nearbyQuerySchema.parse(request.query) as NearbyQueryInput;
    const volunteers = await locationService.listNearbyVolunteers(query);

    response.json({
      data: volunteers,
      meta: {
        count: volunteers.length
      }
    });
  },

  listNearestAmbulances: async (request: Request, response: Response): Promise<void> => {
    const query = nearestAmbulanceQuerySchema.parse(request.query) as NearestAmbulanceQueryInput;
    const ambulances = await locationService.listNearestAmbulances(query);

    response.json({
      data: ambulances,
      meta: {
        count: ambulances.length
      }
    });
  }
};
