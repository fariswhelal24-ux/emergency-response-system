import { AppError } from "../errors/AppError";

export const getRequiredRouteParam = (value: string | string[] | undefined, name: string): string => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (Array.isArray(value) && value.length > 0 && value[0].length > 0) {
    return value[0];
  }

  throw new AppError(`Route parameter '${name}' is required`, 400);
};
