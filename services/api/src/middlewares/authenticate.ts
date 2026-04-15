import { NextFunction, Request, Response } from "express";

import { AppError } from "../shared/errors/AppError.js";
import { UserRole } from "../shared/types/domain.js";
import { verifyAccessToken } from "../shared/utils/token.js";

export const authenticate = (request: Request, _response: Response, next: NextFunction): void => {
  const header = request.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    next(new AppError("Authentication token is required", 401));
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    request.authUser = {
      userId: payload.userId,
      role: payload.role,
      email: payload.email
    };
    next();
  } catch {
    next(new AppError("Invalid or expired authentication token", 401));
  }
};

export const authorizeRoles =
  (...allowedRoles: UserRole[]) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.authUser) {
      next(new AppError("Authentication required", 401));
      return;
    }

    if (!allowedRoles.includes(request.authUser.role)) {
      next(new AppError("You do not have permission to perform this action", 403));
      return;
    }

    next();
  };
