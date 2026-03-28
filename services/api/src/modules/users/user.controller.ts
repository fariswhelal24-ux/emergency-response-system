import { Request, Response } from "express";

import { AppError } from "../../shared/errors/AppError";
import { userService } from "./user.service";
import { UpdateMedicalProfileInput, UpdateUserProfileInput } from "./user.validation";

const requireAuthUserId = (request: Request): string => {
  const userId = request.authUser?.userId;

  if (!userId) {
    throw new AppError("Authentication required", 401);
  }

  return userId;
};

export const userController = {
  getMyProfile: async (request: Request, response: Response): Promise<void> => {
    const profile = await userService.getProfile(requireAuthUserId(request));

    response.json({ data: profile });
  },

  updateMyProfile: async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as UpdateUserProfileInput;
    const profile = await userService.updateProfile(requireAuthUserId(request), payload);

    response.json({
      message: "Profile updated",
      data: profile
    });
  },

  getMyMedicalProfile: async (request: Request, response: Response): Promise<void> => {
    const profile = await userService.getMedicalProfile(requireAuthUserId(request));

    response.json({ data: profile });
  },

  updateMyMedicalProfile: async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as UpdateMedicalProfileInput;
    const profile = await userService.updateMedicalProfile(requireAuthUserId(request), payload);

    response.json({
      message: "Medical profile updated",
      data: profile
    });
  },

  getMyHistory: async (request: Request, response: Response): Promise<void> => {
    const history = await userService.getHistory(requireAuthUserId(request));

    response.json({
      data: history,
      meta: {
        count: history.length
      }
    });
  }
};
