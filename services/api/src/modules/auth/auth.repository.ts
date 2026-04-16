import { randomUUID } from "node:crypto";

import { db } from "../../database/pool.js";
import { AppError } from "../../shared/errors/AppError.js";
import { UserRole } from "../../shared/types/domain.js";

export type UserRecord = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type RefreshTokenRecord = {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
};

export const authRepository = {
  findUserByEmail: async (email: string): Promise<UserRecord | null> => {
    try {
      const query = await db.query<UserRecord>("SELECT * FROM users WHERE email = $1 LIMIT 1", [email]);
      return query.rows[0] ?? null;
    } catch (error) {
      console.error("[AUTH_REPOSITORY] findUserByEmail failed:", error);
      throw new AppError("Authentication lookup failed", 500);
    }
  },

  findUserByPhone: async (phone: string): Promise<UserRecord | null> => {
    try {
      const query = await db.query<UserRecord>("SELECT * FROM users WHERE phone = $1 LIMIT 1", [phone]);
      return query.rows[0] ?? null;
    } catch (error) {
      console.error("[AUTH_REPOSITORY] findUserByPhone failed:", error);
      throw new AppError("Authentication lookup failed", 500);
    }
  },

  findUserById: async (userId: string): Promise<UserRecord | null> => {
    try {
      const query = await db.query<UserRecord>("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
      return query.rows[0] ?? null;
    } catch (error) {
      console.error("[AUTH_REPOSITORY] findUserById failed:", error);
      throw new AppError("Authentication lookup failed", 500);
    }
  },

  findCitizenByPhone: async (phone: string): Promise<UserRecord | null> => {
    try {
      const query = await db.query<UserRecord>(
        `
        SELECT *
        FROM users
        WHERE role = 'CITIZEN'
          AND phone = $1
        ORDER BY created_at ASC
        LIMIT 1
        `,
        [phone]
      );

      return query.rows[0] ?? null;
    } catch (error) {
      console.error("[AUTH_REPOSITORY] findCitizenByPhone failed:", error);
      throw new AppError("Authentication lookup failed", 500);
    }
  },

  createUser: async (input: {
    fullName: string;
    email: string;
    phone?: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<UserRecord> => {
    try {
      const newId = randomUUID();
      const query = await db.query<UserRecord>(
        `
        INSERT INTO users (id, full_name, email, phone, password_hash, role)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [newId, input.fullName, input.email, input.phone ?? null, input.passwordHash, input.role]
      );

      return query.rows[0];
    } catch (error) {
      console.error("[AUTH_REPOSITORY] createUser failed:", error);
      const reason = error instanceof Error ? error.message : String(error);
      throw new AppError("Could not create user account", 500, {
        error: "Could not create user account",
        reason
      });
    }
  },

  bootstrapRoleProfile: async (input: { userId: string; role: UserRole }): Promise<void> => {
    try {
      if (input.role === "CITIZEN") {
        await db.query(
          `
          INSERT INTO medical_profiles (user_id)
          VALUES ($1)
          ON CONFLICT (user_id) DO NOTHING
          `,
          [input.userId]
        );
        return;
      }

      if (input.role === "VOLUNTEER") {
        await db.query(
          `
          INSERT INTO volunteers (user_id, availability)
          VALUES ($1, 'AVAILABLE')
          ON CONFLICT (user_id)
          DO UPDATE SET
            availability = 'AVAILABLE',
            updated_at = NOW()
          `,
          [input.userId]
        );
        return;
      }

      if (input.role === "DISPATCHER" || input.role === "ADMIN") {
        await db.query(
          `
          INSERT INTO dispatchers (user_id)
          VALUES ($1)
          ON CONFLICT (user_id) DO NOTHING
          `,
          [input.userId]
        );
      }
    } catch (error) {
      // Do NOT fail the whole registration/login flow if profile bootstrap
      // hits a missing table or transient DB issue. The user record itself
      // was created successfully; profile rows can be created lazily by
      // feature modules (medical profile, volunteer availability, etc.).
      console.warn("[AUTH_REPOSITORY] bootstrapRoleProfile non-fatal:", error);
    }
  },

  saveRefreshToken: async (input: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> => {
    try {
      const query = await db.query<RefreshTokenRecord>(
        `
        INSERT INTO refresh_tokens (user_id, token, expires_at)
        VALUES ($1, $2, $3)
        RETURNING *
        `,
        [input.userId, input.token, input.expiresAt]
      );

      return query.rows[0];
    } catch (error) {
      console.error("[AUTH_REPOSITORY] saveRefreshToken failed:", error);
      throw new AppError("Could not create authentication session", 500);
    }
  },

  findActiveRefreshToken: async (token: string): Promise<RefreshTokenRecord | null> => {
    try {
      const query = await db.query<RefreshTokenRecord>(
        `
        SELECT * FROM refresh_tokens
        WHERE token = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
        LIMIT 1
        `,
        [token]
      );

      return query.rows[0] ?? null;
    } catch (error) {
      console.error("[AUTH_REPOSITORY] findActiveRefreshToken failed:", error);
      throw new AppError("Authentication session lookup failed", 500);
    }
  },

  revokeRefreshToken: async (token: string): Promise<void> => {
    try {
      await db.query(
        `
        UPDATE refresh_tokens
        SET revoked_at = NOW()
        WHERE token = $1
        AND revoked_at IS NULL
        `,
        [token]
      );
    } catch (error) {
      console.error("[AUTH_REPOSITORY] revokeRefreshToken failed:", error);
      throw new AppError("Could not close authentication session", 500);
    }
  }
};

export type { UserRole };
