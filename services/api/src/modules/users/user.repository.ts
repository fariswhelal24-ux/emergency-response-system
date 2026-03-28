import { db } from "../../database/pool";

export type UserProfileRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  created_at: Date;
  updated_at: Date;
};

export type MedicalProfileRow = {
  id: string;
  user_id: string;
  blood_type: string | null;
  conditions: string | null;
  allergies: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  health_data_sharing: boolean;
  created_at: Date;
  updated_at: Date;
};

export type UserHistoryRow = {
  id: string;
  case_number: string;
  emergency_type: string;
  priority: string;
  status: string;
  address_text: string;
  created_at: Date;
  closed_at: Date | null;
};

export const userRepository = {
  getProfile: async (userId: string): Promise<UserProfileRow | null> => {
    const query = await db.query<UserProfileRow>(
      `
      SELECT id, full_name, email, phone, avatar_url, role, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

    return query.rows[0] ?? null;
  },

  updateProfile: async (input: {
    userId: string;
    fullName?: string;
    phone?: string;
    avatarUrl?: string;
  }): Promise<UserProfileRow | null> => {
    const query = await db.query<UserProfileRow>(
      `
      UPDATE users
      SET
        full_name = COALESCE($2, full_name),
        phone = COALESCE($3, phone),
        avatar_url = COALESCE($4, avatar_url),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, full_name, email, phone, avatar_url, role, created_at, updated_at
      `,
      [input.userId, input.fullName ?? null, input.phone ?? null, input.avatarUrl ?? null]
    );

    return query.rows[0] ?? null;
  },

  getMedicalProfile: async (userId: string): Promise<MedicalProfileRow | null> => {
    const query = await db.query<MedicalProfileRow>(
      `
      SELECT *
      FROM medical_profiles
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    return query.rows[0] ?? null;
  },

  ensureMedicalProfile: async (userId: string): Promise<void> => {
    await db.query(
      `
      INSERT INTO medical_profiles (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );
  },

  updateMedicalProfile: async (input: {
    userId: string;
    bloodType?: string;
    conditions?: string;
    allergies?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    healthDataSharing?: boolean;
  }): Promise<MedicalProfileRow | null> => {
    const query = await db.query<MedicalProfileRow>(
      `
      UPDATE medical_profiles
      SET
        blood_type = COALESCE($2, blood_type),
        conditions = COALESCE($3, conditions),
        allergies = COALESCE($4, allergies),
        emergency_contact_name = COALESCE($5, emergency_contact_name),
        emergency_contact_phone = COALESCE($6, emergency_contact_phone),
        health_data_sharing = COALESCE($7, health_data_sharing),
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
      `,
      [
        input.userId,
        input.bloodType ?? null,
        input.conditions ?? null,
        input.allergies ?? null,
        input.emergencyContactName ?? null,
        input.emergencyContactPhone ?? null,
        input.healthDataSharing ?? null
      ]
    );

    return query.rows[0] ?? null;
  },

  getHistory: async (userId: string): Promise<UserHistoryRow[]> => {
    const query = await db.query<UserHistoryRow>(
      `
      SELECT
        id,
        case_number,
        emergency_type,
        priority,
        status,
        address_text,
        created_at,
        closed_at
      FROM emergency_cases
      WHERE reporting_user_id = $1
      ORDER BY created_at DESC
      LIMIT 100
      `,
      [userId]
    );

    return query.rows;
  }
};
