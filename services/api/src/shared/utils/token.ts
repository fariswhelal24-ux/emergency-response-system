import jwt, { SignOptions } from "jsonwebtoken";

import { env } from "../../config/env.js";
import { UserRole } from "../types/domain.js";

export type AccessTokenPayload = {
  userId: string;
  role: UserRole;
  email: string;
};

export type RefreshTokenPayload = {
  userId: string;
  sessionId: string;
};

const signToken = (payload: object, secret: string, expiresIn: string): string => {
  const options: SignOptions = { expiresIn: expiresIn as SignOptions["expiresIn"] };
  return jwt.sign(payload, secret, options);
};

export const signAccessToken = (payload: AccessTokenPayload): string =>
  signToken(payload, env.jwtAccessSecret, env.accessTokenTtl);

export const signRefreshToken = (payload: RefreshTokenPayload): string =>
  signToken(payload, env.jwtRefreshSecret, env.refreshTokenTtl);

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): RefreshTokenPayload =>
  jwt.verify(token, env.jwtRefreshSecret) as RefreshTokenPayload;
