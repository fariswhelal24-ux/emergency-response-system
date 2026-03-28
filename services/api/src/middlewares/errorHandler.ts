import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AppError } from "../shared/errors/AppError";

export const errorHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
): void => {
  if (error instanceof ZodError) {
    response.status(400).json({
      message: "Validation error",
      issues: error.flatten()
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      message: error.message,
      details: error.details
    });
    return;
  }

  response.status(500).json({
    message: "Internal server error"
  });
};
