import { Request, Response } from "express";

import { AppError } from "../../shared/errors/AppError.js";
import { authService } from "./auth.service.js";
import { LoginInput, RefreshInput, RegisterInput } from "./auth.validation.js";

export const authController = {
  register: async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as RegisterInput;
    const result = await authService.register(payload);

    response.status(201).json({
      message: "Account created successfully",
      data: result
    });
  },

  login: async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as LoginInput;
    const result = await authService.login(payload);

    response.json({
      message: "Login successful",
      data: result
    });
  },

  refresh: async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as RefreshInput;
    const result = await authService.refresh(payload.refreshToken);

    response.json({
      message: "Token refreshed",
      data: result
    });
  },

  logout: async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as RefreshInput;
    await authService.logout(payload.refreshToken);

    response.status(204).send();
  },

  me: async (request: Request, response: Response): Promise<void> => {
    if (!request.authUser) {
      throw new AppError("Authentication required", 401);
    }

    const user = await authService.me(request.authUser.userId);

    response.json({
      data: user
    });
  }
};
