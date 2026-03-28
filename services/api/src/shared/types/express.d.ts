import type { UserRole } from "./domain";

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
