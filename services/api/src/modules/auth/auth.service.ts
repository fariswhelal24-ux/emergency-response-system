import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";

import { AppError } from "../../shared/errors/AppError.js";
import { comparePassword, hashPassword } from "../../shared/utils/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from "../../shared/utils/token.js";
import { emitVolunteerAvailabilityChanged } from "../../sockets/realtimeServer.js";
import { authRepository, UserRecord, UserRole } from "./auth.repository.js";
import { LoginInput, RegisterInput } from "./auth.validation.js";

type PublicUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
};

const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  phone: user.phone,
  avatarUrl: user.avatar_url,
  role: user.role,
  isActive: user.is_active,
  createdAt: user.created_at
});

const readTokenExpiration = (token: string): Date => {
  const decoded = jwt.decode(token) as { exp?: number } | null;

  if (!decoded?.exp) {
    throw new AppError("Token expiry could not be determined", 500);
  }

  return new Date(decoded.exp * 1000);
};

const issueTokenPair = async (user: UserRecord) => {
  const sessionId = randomUUID();
  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email
  });
  const refreshToken = signRefreshToken({
    userId: user.id,
    sessionId
  });

  await authRepository.saveRefreshToken({
    userId: user.id,
    token: refreshToken,
    expiresAt: readTokenExpiration(refreshToken)
  });

  return {
    accessToken,
    refreshToken
  };
};

export const authService = {
  register: async (input: RegisterInput) => {
    const email = input.email.toLowerCase();
    const existing = await authRepository.findUserByEmail(email);

    if (existing) {
      throw new AppError("Email is already registered", 409);
    }

    const passwordHash = await hashPassword(input.password);
    const user = await authRepository.createUser({
      fullName: input.fullName,
      email,
      phone: input.phone,
      passwordHash,
      role: input.role
    });

    await authRepository.bootstrapRoleProfile({ userId: user.id, role: user.role });
    if (user.role === "VOLUNTEER") {
      emitVolunteerAvailabilityChanged({
        source: "auth:register",
        userId: user.id,
        email: user.email,
        availability: "AVAILABLE",
        at: new Date().toISOString()
      });
    }
    const tokens = await issueTokenPair(user);

    return {
      user: toPublicUser(user),
      tokens
    };
  },

  login: async (input: LoginInput) => {
    const identifier = input.identifier.trim();
    const isEmail = identifier.includes("@");
    const user = isEmail
      ? await authRepository.findUserByEmail(identifier.toLowerCase())
      : await authRepository.findUserByPhone(identifier);

    if (!user) {
      throw new AppError("Invalid login or password", 401);
    }

    const matches = await comparePassword(input.password, user.password_hash);

    if (!matches) {
      throw new AppError("Invalid login or password", 401);
    }

    if (!user.is_active) {
      throw new AppError("Account is disabled", 403);
    }

    await authRepository.bootstrapRoleProfile({ userId: user.id, role: user.role });
    if (user.role === "VOLUNTEER") {
      emitVolunteerAvailabilityChanged({
        source: "auth:login",
        userId: user.id,
        email: user.email,
        availability: "AVAILABLE",
        at: new Date().toISOString()
      });
    }
    const tokens = await issueTokenPair(user);

    return {
      user: toPublicUser(user),
      tokens
    };
  },

  refresh: async (refreshToken: string) => {
    const session = await authRepository.findActiveRefreshToken(refreshToken);

    if (!session) {
      throw new AppError("Refresh token is invalid or expired", 401);
    }

    try {
      const payload = verifyRefreshToken(refreshToken);

      if (payload.userId !== session.user_id) {
        throw new AppError("Refresh token subject mismatch", 401);
      }
    } catch {
      throw new AppError("Refresh token is invalid or expired", 401);
    }

    const user = await authRepository.findUserById(session.user_id);

    if (!user || !user.is_active) {
      throw new AppError("User account is not active", 403);
    }

    await authRepository.revokeRefreshToken(refreshToken);
    const tokens = await issueTokenPair(user);

    return {
      user: toPublicUser(user),
      tokens
    };
  },

  logout: async (refreshToken: string) => {
    await authRepository.revokeRefreshToken(refreshToken);
  },

  me: async (userId: string) => {
    const user = await authRepository.findUserById(userId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return toPublicUser(user);
  }
};
