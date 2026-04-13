import { Request, Response } from "express";

import { AppError } from "../../shared/errors/AppError";
import { emitVolunteerAvailabilityChanged } from "../../sockets/realtimeServer";
import { volunteerService } from "./volunteer.service";
import {
  NearbyVolunteerQueryInput,
  UpdateAvailabilityInput,
  UpdateVolunteerProfileInput,
  nearbyVolunteerQuerySchema
} from "./volunteer.validation";

const requireAuthUserId = (request: Request): string => {
  const userId = request.authUser?.userId;

  if (!userId) {
    throw new AppError("Authentication required", 401);
  }

  return userId;
};

export const volunteerController = {
  getMyProfile: async (request: Request, response: Response): Promise<void> => {
    const profile = await volunteerService.getMyProfile(requireAuthUserId(request));

    response.json({ data: profile });
  },

  updateMyProfile: async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as UpdateVolunteerProfileInput;
    const profile = await volunteerService.updateMyProfile(requireAuthUserId(request), payload);

    emitVolunteerAvailabilityChanged({
      userId: profile.userId,
      volunteerId: profile.id,
      name: profile.name,
      specialty: profile.specialty,
      availability: profile.availability,
      updatedAt: profile.updatedAt
    });

    response.json({
      message: "Volunteer profile updated",
      data: profile
    });
  },

  updateAvailability: async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as UpdateAvailabilityInput;
    const profile = await volunteerService.updateAvailability(requireAuthUserId(request), payload);

    emitVolunteerAvailabilityChanged({
      userId: profile.userId,
      volunteerId: profile.id,
      name: profile.name,
      specialty: profile.specialty,
      availability: profile.availability,
      updatedAt: profile.updatedAt
    });

    response.json({
      message: "Availability updated",
      data: profile
    });
  },

  getMyIncidents: async (request: Request, response: Response): Promise<void> => {
    const incidents = await volunteerService.getMyIncidentHistory(requireAuthUserId(request));

    response.json({
      data: incidents,
      meta: {
        count: incidents.length
      }
    });
  },

  listNearby: async (request: Request, response: Response): Promise<void> => {
    const query = nearbyVolunteerQuerySchema.parse(request.query) as NearbyVolunteerQueryInput;
    const volunteers = await volunteerService.listNearby(query);

    response.json({
      data: volunteers,
      meta: {
        count: volunteers.length
      }
    });
  }
};
