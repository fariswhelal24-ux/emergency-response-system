import { db } from "../../database/pool";
import { UserRole } from "../../shared/types/domain";

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
    const query = await db.query<UserRecord>("SELECT * FROM users WHERE email = $1 LIMIT 1", [email]);
    return query.rows[0] ?? null;
  },

  findUserById: async (userId: string): Promise<UserRecord | null> => {
    const query = await db.query<UserRecord>("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
    return query.rows[0] ?? null;
  },

  createUser: async (input: {
    fullName: string;
    email: string;
    phone?: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<UserRecord> => {
    const query = await db.query<UserRecord>(
      `
      INSERT INTO users (full_name, email, phone, password_hash, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [input.fullName, input.email, input.phone ?? null, input.passwordHash, input.role]
    );

    return query.rows[0];
  },

  bootstrapRoleProfile: async (input: { userId: string; role: UserRole }): Promise<void> => {
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
        INSERT INTO volunteers (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
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
  },

  saveRefreshToken: async (input: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> => {
    const query = await db.query<RefreshTokenRecord>(
      `
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [input.userId, input.token, input.expiresAt]
    );

    return query.rows[0];
  },

  findActiveRefreshToken: async (token: string): Promise<RefreshTokenRecord | null> => {
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
  },

  revokeRefreshToken: async (token: string): Promise<void> => {
    await db.query(
      `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token = $1
      AND revoked_at IS NULL
      `,
      [token]
    );
  }
};

export type { UserRole };
