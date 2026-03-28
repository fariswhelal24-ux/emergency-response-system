import { Request, Response } from "express";

export const notFoundHandler = (request: Request, response: Response): void => {
  response.status(404).json({
    message: `Route not found: ${request.method} ${request.originalUrl}`
  });
};
