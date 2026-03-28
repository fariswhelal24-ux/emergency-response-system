import { db } from "../../database/pool";

export type VolunteerRow = {
  id: string;
  user_id: string;
  full_name: string;
  specialty: string;
  availability: string;
  response_radius_km: string;
  current_latitude: string | null;
  current_longitude: string | null;
};

export type AmbulanceRow = {
  id: string;
  unit_code: string;
  status: string;
  support_level: string;
  crew_count: number;
  current_latitude: string | null;
  current_longitude: string | null;
};

export const responderRepository = {
  listVolunteers: async (): Promise<VolunteerRow[]> => {
    const query = await db.query<VolunteerRow>(
      `
      SELECT
        v.id,
        v.user_id,
        u.full_name,
        v.specialty,
        v.availability,
        v.response_radius_km,
        v.current_latitude,
        v.current_longitude
      FROM volunteers v
      INNER JOIN users u ON u.id = v.user_id
      ORDER BY
        CASE v.availability
          WHEN 'AVAILABLE' THEN 1
          WHEN 'BUSY' THEN 2
          ELSE 3
        END,
        u.full_name ASC
      `
    );

    return query.rows;
  },

  listAmbulances: async (): Promise<AmbulanceRow[]> => {
    const query = await db.query<AmbulanceRow>(
      `
      SELECT
        id,
        unit_code,
        status,
        support_level,
        crew_count,
        current_latitude,
        current_longitude
      FROM ambulances
      ORDER BY
        CASE status
          WHEN 'AVAILABLE' THEN 1
          WHEN 'DISPATCHED' THEN 2
          WHEN 'EN_ROUTE' THEN 3
          ELSE 4
        END,
        unit_code ASC
      `
    );

    return query.rows;
  }
};
