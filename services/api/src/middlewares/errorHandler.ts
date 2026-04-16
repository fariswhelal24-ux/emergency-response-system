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
    const detailsObj =
      typeof error.details === "object" && error.details !== null
        ? (error.details as Record<string, unknown>)
        : undefined;
    const resolvedError =
      detailsObj && typeof detailsObj.error === "string"
        ? (detailsObj.error as string)
        : error.message;
    const reason = detailsObj && typeof detailsObj.reason === "string" ? (detailsObj.reason as string) : undefined;

    response.status(error.statusCode).json({
      error: resolvedError,
      message: error.message,
      ...(reason ? { reason } : {}),
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
