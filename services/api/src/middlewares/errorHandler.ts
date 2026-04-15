import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { env } from "../config/env.js";
import { AppError } from "../shared/errors/AppError.js";

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

  // Keep unexpected errors visible in API logs for fast diagnosis.
  console.error("[UNHANDLED_ERROR]", error);

  response.status(500).json({
    message: "Internal server error",
    ...(env.isProduction
      ? {}
      : {
          details: error instanceof Error ? error.message : String(error)
        })
  });
};
