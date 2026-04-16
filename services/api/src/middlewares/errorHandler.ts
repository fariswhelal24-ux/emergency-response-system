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
      error: "Validation error",
      message: "Validation error",
      issues: error.flatten()
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error:
        typeof error.details === "object" &&
        error.details !== null &&
        "error" in (error.details as Record<string, unknown>) &&
        typeof (error.details as Record<string, unknown>).error === "string"
          ? ((error.details as Record<string, unknown>).error as string)
          : error.message,
      message: error.message,
      details: error.details
    });
    return;
  }

  // Keep unexpected errors visible in API logs for fast diagnosis.
  console.error("[UNHANDLED_ERROR]", error);

  const rawMessage = error instanceof Error ? error.message : String(error);

  response.status(500).json({
    error: "Internal server error",
    message: "Internal server error",
    reason: rawMessage,
    ...(env.isProduction ? {} : { details: rawMessage })
  });
};
