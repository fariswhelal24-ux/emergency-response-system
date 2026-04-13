import { db } from "../../database/pool";
import { realVolunteerUserConditions } from "../../shared/sql/realVolunteerUser";

export type VolunteerProfileRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  specialty: string;
  verification_badge: string;
  credentials: Record<string, unknown>;
  licenses: string[];
  availability: string;
  response_radius_km: string;
  years_volunteering: number;
  incidents_responded: number;
  average_rating: string;
  current_latitude: string | null;
  current_longitude: string | null;
  updated_at: Date;
};

export type VolunteerIncidentRow = {
  assignment_id: string;
  case_id: string;
  case_number: string;
  emergency_type: string;
  address_text: string;
  status: string;
  assignment_status: string;
  response_eta_minutes: number | null;
  assigned_at: Date;
  responded_at: Date | null;
  arrived_at: Date | null;
};

export const volunteerRepository = {
  getVolunteerByUserId: async (userId: string): Promise<VolunteerProfileRow | null> => {
    const query = await db.query<VolunteerProfileRow>(
      `
      SELECT
        v.id,
        v.user_id,
        u.full_name,
        u.email,
        u.phone,
        u.avatar_url,
        v.specialty,
        v.verification_badge,
        v.credentials,
        v.licenses,
        v.availability,
        v.response_radius_km,
        v.years_volunteering,
        v.incidents_responded,
        v.average_rating,
        v.current_latitude,
        v.current_longitude,
        v.updated_at
      FROM volunteers v
      INNER JOIN users u ON u.id = v.user_id
      WHERE v.user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    return query.rows[0] ?? null;
  },

  ensureVolunteerProfile: async (userId: string): Promise<void> => {
    await db.query(
      `
      INSERT INTO volunteers (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
      `,
      [userId]
    );
  },

  updateVolunteerProfile: async (input: {
    userId: string;
    specialty?: string;
    verificationBadge?: string;
    responseRadiusKm?: number;
    yearsVolunteering?: number;
    credentials?: Record<string, unknown>;
    licenses?: string[];
  }): Promise<VolunteerProfileRow | null> => {
    const query = await db.query<VolunteerProfileRow>(
      `
      UPDATE volunteers
      SET
        specialty = COALESCE($2, specialty),
        verification_badge = COALESCE($3, verification_badge),
        response_radius_km = COALESCE($4, response_radius_km),
        years_volunteering = COALESCE($5, years_volunteering),
        credentials = COALESCE($6, credentials),
        licenses = COALESCE($7, licenses),
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING
        id,
        user_id,
        ''::TEXT AS full_name,
        ''::TEXT AS email,
        NULL::TEXT AS phone,
        NULL::TEXT AS avatar_url,
        specialty,
        verification_badge,
        credentials,
        licenses,
        availability,
        response_radius_km,
        years_volunteering,
        incidents_responded,
        average_rating,
        current_latitude,
        current_longitude,
        updated_at
      `,
      [
        input.userId,
        input.specialty ?? null,
        input.verificationBadge ?? null,
        input.responseRadiusKm ?? null,
        input.yearsVolunteering ?? null,
        input.credentials ?? null,
        input.licenses ?? null
      ]
    );

    return query.rows[0] ?? null;
  },

  updateAvailability: async (input: {
    userId: string;
    availability: string;
    latitude?: number;
    longitude?: number;
  }): Promise<void> => {
    await db.query(
      `
      UPDATE volunteers
      SET
        availability = $2,
        current_latitude = COALESCE($3, current_latitude),
        current_longitude = COALESCE($4, current_longitude),
        updated_at = NOW()
      WHERE user_id = $1
      `,
      [input.userId, input.availability, input.latitude ?? null, input.longitude ?? null]
    );
  },

  listVolunteerIncidents: async (userId: string): Promise<VolunteerIncidentRow[]> => {
    const query = await db.query<VolunteerIncidentRow>(
      `
      SELECT
        va.id AS assignment_id,
        ec.id AS case_id,
        ec.case_number,
        ec.emergency_type,
        ec.address_text,
        ec.status,
        va.status AS assignment_status,
        va.eta_minutes AS response_eta_minutes,
        va.assigned_at,
        va.responded_at,
        va.arrived_at
      FROM volunteer_assignments va
      INNER JOIN volunteers v ON v.id = va.volunteer_id
      INNER JOIN emergency_cases ec ON ec.id = va.case_id
      WHERE v.user_id = $1
      ORDER BY va.assigned_at DESC
      LIMIT 200
      `,
      [userId]
    );

    return query.rows;
  },

  listNearbyVolunteers: async (input: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    limit: number;
  }): Promise<VolunteerProfileRow[]> => {
    const query = await db.query<VolunteerProfileRow>(
      `
      SELECT *
      FROM (
        SELECT
          v.id,
          v.user_id,
          u.full_name,
          u.email,
          u.phone,
          u.avatar_url,
          v.specialty,
          v.verification_badge,
          v.credentials,
          v.licenses,
          v.availability,
          v.response_radius_km,
          v.years_volunteering,
          v.incidents_responded,
          v.average_rating,
          v.current_latitude,
          v.current_longitude,
          v.updated_at,
          (
            6371 * ACOS(
              COS(RADIANS($1)) * COS(RADIANS(COALESCE(v.current_latitude, $1))) *
              COS(RADIANS(COALESCE(v.current_longitude, $2)) - RADIANS($2)) +
              SIN(RADIANS($1)) * SIN(RADIANS(COALESCE(v.current_latitude, $1)))
            )
          )::NUMERIC(8, 3) AS distance_km
        FROM volunteers v
        INNER JOIN users u ON u.id = v.user_id
        WHERE v.availability = 'AVAILABLE'
          AND ${realVolunteerUserConditions}
      ) s
      WHERE s.distance_km <= $3
      ORDER BY s.distance_km ASC
      LIMIT $4
      `,
      [input.latitude, input.longitude, input.radiusKm, input.limit]
    );

    return query.rows;
  }
};
