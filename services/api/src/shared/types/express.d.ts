import type { UserRole } from "./domain.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        userId: string;
        role: UserRole;
        email: string;
      };
    }
  }
}

export {};
