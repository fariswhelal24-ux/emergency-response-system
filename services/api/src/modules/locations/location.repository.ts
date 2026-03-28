import { db } from "../../database/pool";
import { LocationActor } from "../../shared/types/domain";

export type LiveLocationRow = {
  id: string;
  case_id: string | null;
  actor_type: LocationActor;
  actor_user_id: string | null;
  ambulance_id: string | null;
  latitude: string;
  longitude: string;
  heading: string | null;
  speed_kmh: string | null;
  eta_minutes: number | null;
  recorded_at: Date;
};

export type NearbyVolunteerRow = {
  volunteer_id: string;
  user_id: string;
  full_name: string;
  specialty: string;
  availability: string;
  distance_km: string;
  current_latitude: string | null;
  current_longitude: string | null;
};

export type NearbyAmbulanceRow = {
  id: string;
  unit_code: string;
  status: string;
  support_level: string;
  crew_count: number;
  distance_km: string;
  current_latitude: string | null;
  current_longitude: string | null;
};

export const locationRepository = {
  createLocationUpdate: async (input: {
    caseId?: string;
    actorType: LocationActor;
    actorUserId?: string;
    ambulanceId?: string;
    latitude: number;
    longitude: number;
    heading?: number;
    speedKmh?: number;
    etaMinutes?: number;
  }): Promise<LiveLocationRow> => {
    const query = await db.query<LiveLocationRow>(
      `
      INSERT INTO live_locations (
        case_id,
        actor_type,
        actor_user_id,
        ambulance_id,
        latitude,
        longitude,
        heading,
        speed_kmh,
        eta_minutes,
        recorded_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
      `,
      [
        input.caseId ?? null,
        input.actorType,
        input.actorUserId ?? null,
        input.ambulanceId ?? null,
        input.latitude,
        input.longitude,
        input.heading ?? null,
        input.speedKmh ?? null,
        input.etaMinutes ?? null
      ]
    );

    return query.rows[0];
  },

  listCaseLocations: async (caseId: string): Promise<LiveLocationRow[]> => {
    const query = await db.query<LiveLocationRow>(
      `
      SELECT *
      FROM live_locations
      WHERE case_id = $1
      ORDER BY recorded_at DESC
      LIMIT 200
      `,
      [caseId]
    );

    return query.rows;
  },

  updateVolunteerCoordinate: async (userId: string, latitude: number, longitude: number): Promise<void> => {
    await db.query(
      `
      UPDATE volunteers
      SET
        current_latitude = $2,
        current_longitude = $3,
        updated_at = NOW()
      WHERE user_id = $1
      `,
      [userId, latitude, longitude]
    );
  },

  updateAmbulanceCoordinate: async (ambulanceId: string, latitude: number, longitude: number): Promise<void> => {
    await db.query(
      `
      UPDATE ambulances
      SET
        current_latitude = $2,
        current_longitude = $3,
        updated_at = NOW()
      WHERE id = $1
      `,
      [ambulanceId, latitude, longitude]
    );
  },

  listNearbyVolunteers: async (input: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    limit: number;
  }): Promise<NearbyVolunteerRow[]> => {
    const query = await db.query<NearbyVolunteerRow>(
      `
      SELECT *
      FROM (
        SELECT
          v.id AS volunteer_id,
          v.user_id,
          u.full_name,
          v.specialty,
          v.availability,
          (
            6371 * ACOS(
              COS(RADIANS($1)) * COS(RADIANS(COALESCE(v.current_latitude, $1))) *
              COS(RADIANS(COALESCE(v.current_longitude, $2)) - RADIANS($2)) +
              SIN(RADIANS($1)) * SIN(RADIANS(COALESCE(v.current_latitude, $1)))
            )
          )::NUMERIC(8, 3) AS distance_km,
          v.current_latitude,
          v.current_longitude
        FROM volunteers v
        INNER JOIN users u ON u.id = v.user_id
        WHERE v.availability = 'AVAILABLE'
      ) s
      WHERE s.distance_km <= $3
      ORDER BY s.distance_km ASC
      LIMIT $4
      `,
      [input.latitude, input.longitude, input.radiusKm, input.limit]
    );

    return query.rows;
  },

  listNearestAmbulances: async (input: {
    latitude: number;
    longitude: number;
    limit: number;
  }): Promise<NearbyAmbulanceRow[]> => {
    const query = await db.query<NearbyAmbulanceRow>(
      `
      SELECT
        a.id,
        a.unit_code,
        a.status,
        a.support_level,
        a.crew_count,
        (
          6371 * ACOS(
            COS(RADIANS($1)) * COS(RADIANS(COALESCE(a.current_latitude, $1))) *
            COS(RADIANS(COALESCE(a.current_longitude, $2)) - RADIANS($2)) +
            SIN(RADIANS($1)) * SIN(RADIANS(COALESCE(a.current_latitude, $1)))
          )
        )::NUMERIC(8, 3) AS distance_km,
        a.current_latitude,
        a.current_longitude
      FROM ambulances a
      WHERE a.status IN ('AVAILABLE', 'DISPATCHED', 'EN_ROUTE')
      ORDER BY distance_km ASC
      LIMIT $3
      `,
      [input.latitude, input.longitude, input.limit]
    );

    return query.rows;
  }
};
