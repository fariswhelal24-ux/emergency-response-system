import { NextFunction, Request, Response } from "express";
import { AnyZodObject } from "zod";

export const validateBody =
  (schema: AnyZodObject) => (request: Request, _response: Response, next: NextFunction): void => {
    request.body = schema.parse(request.body);
    next();
  };
