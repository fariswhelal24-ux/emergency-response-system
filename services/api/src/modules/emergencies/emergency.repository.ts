import { db } from "../../database/pool";
import { realVolunteerUserConditions } from "../../shared/sql/realVolunteerUser";
import {
  AmbulanceAssignmentStatus,
  CasePriority,
  CaseStatus,
  UserRole,
  VolunteerAssignmentStatus
} from "../../shared/types/domain";
import { EmergencyListQueryInput } from "./emergency.validation";

export type EmergencyCaseRow = {
  id: string;
  case_number: string;
  reporting_user_id: string;
  emergency_type: string;
  priority: CasePriority;
  status: CaseStatus;
  voice_description: string | null;
  transcription_text: string | null;
  ai_analysis: string | null;
  possible_condition: string | null;
  risk_level: string | null;
  address_text: string;
  latitude: string;
  longitude: string;
  eta_minutes: number | null;
  ambulance_eta_minutes: number | null;
  volunteer_eta_minutes: number | null;
  started_at: Date;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type EmergencyUpdateRow = {
  id: string;
  case_id: string;
  author_user_id: string | null;
  update_type: string;
  message: string;
  payload: Record<string, unknown>;
  created_at: Date;
};

export type VolunteerAssignmentRow = {
  id: string;
  case_id: string;
  volunteer_id: string;
  status: VolunteerAssignmentStatus;
  distance_km: string | null;
  eta_minutes: number | null;
  assigned_by: string | null;
  assigned_at: Date;
  responded_at: Date | null;
  arrived_at: Date | null;
};

export type AmbulanceAssignmentRow = {
  id: string;
  case_id: string;
  ambulance_id: string;
  status: AmbulanceAssignmentStatus;
  distance_km: string | null;
  eta_minutes: number | null;
  assigned_by: string | null;
  assigned_at: Date;
  arrived_at: Date | null;
};

export type VolunteerNearbyRow = {
  volunteer_id: string;
  user_id: string;
  full_name: string;
  specialty: string;
  availability: string;
  response_radius_km: string;
  current_latitude: string | null;
  current_longitude: string | null;
  distance_km: string;
};

export type AmbulanceNearbyRow = {
  id: string;
  unit_code: string;
  status: string;
  crew_count: number;
  support_level: string;
  current_latitude: string | null;
  current_longitude: string | null;
  distance_km: string;
};

export const emergencyRepository = {
  findVolunteerIdByUserId: async (userId: string): Promise<string | null> => {
    const query = await db.query<{ id: string }>("SELECT id FROM volunteers WHERE user_id = $1 LIMIT 1", [
      userId
    ]);

    return query.rows[0]?.id ?? null;
  },

  generateCaseNumber: async (): Promise<string> => {
    const query = await db.query<{ value: string }>(
      `
      SELECT CONCAT(
        'CASE-',
        TO_CHAR(NOW(), 'YYYYMMDD'),
        '-',
        LPAD((COUNT(*) + 1)::TEXT, 4, '0')
      ) AS value
      FROM emergency_cases
      WHERE DATE(created_at) = CURRENT_DATE
      `
    );

    return query.rows[0]?.value ?? `CASE-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-0001`;
  },

  createEmergencyCase: async (input: {
    caseNumber: string;
    reportingUserId: string;
    emergencyType: string;
    priority: CasePriority;
    voiceDescription?: string;
    transcriptionText?: string;
    aiAnalysis?: string;
    possibleCondition?: string;
    riskLevel?: string;
    address: string;
    latitude: number;
    longitude: number;
    etaMinutes?: number;
    ambulanceEtaMinutes?: number;
    volunteerEtaMinutes?: number;
  }): Promise<EmergencyCaseRow> => {
    const legacyDescription = input.voiceDescription ?? input.transcriptionText ?? input.emergencyType;

    const query = await db.query<EmergencyCaseRow>(
      `
      INSERT INTO emergency_cases (
        case_number,
        reporting_user_id,
        citizen_id,
        emergency_type,
        incident_type,
        priority,
        status,
        description,
        voice_description,
        transcription_text,
        ai_analysis,
        possible_condition,
        risk_level,
        address_text,
        latitude,
        longitude,
        eta_minutes,
        ambulance_eta_minutes,
        volunteer_eta_minutes,
        started_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'NEW',
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        NOW()
      )
      RETURNING *
      `,
      [
        input.caseNumber,
        input.reportingUserId,
        input.reportingUserId,
        input.emergencyType,
        input.emergencyType,
        input.priority,
        legacyDescription,
        input.voiceDescription ?? null,
        input.transcriptionText ?? null,
        input.aiAnalysis ?? null,
        input.possibleCondition ?? null,
        input.riskLevel ?? null,
        input.address,
        input.latitude,
        input.longitude,
        input.etaMinutes ?? null,
        input.ambulanceEtaMinutes ?? null,
        input.volunteerEtaMinutes ?? null
      ]
    );

    return query.rows[0];
  },

  findCaseById: async (caseId: string): Promise<EmergencyCaseRow | null> => {
    const query = await db.query<EmergencyCaseRow>(
      `
      SELECT *
      FROM emergency_cases
      WHERE id = $1
      LIMIT 1
      `,
      [caseId]
    );

    return query.rows[0] ?? null;
  },

  listCases: async (input: {
    authRole: UserRole;
    authUserId: string;
    authVolunteerId?: string | null;
    filters: EmergencyListQueryInput;
  }): Promise<EmergencyCaseRow[]> => {
    const values: unknown[] = [];
    const conditions: string[] = [];

    if (input.authRole === "CITIZEN") {
      values.push(input.authUserId);
      conditions.push(`reporting_user_id = $${values.length}`);
    }

    if (input.authRole === "VOLUNTEER") {
      if (!input.authVolunteerId) {
        return [];
      }

      values.push(input.authVolunteerId);
      conditions.push(
        `EXISTS (
          SELECT 1
          FROM volunteer_assignments va
          WHERE va.case_id = emergency_cases.id
            AND va.volunteer_id = $${values.length}
            AND va.status IN ('PENDING', 'ACCEPTED', 'ARRIVED')
        )`
      );
      conditions.push(`status NOT IN ('CLOSED', 'CANCELLED')`);
    }

    if (input.filters.status) {
      values.push(input.filters.status);
      conditions.push(`status = $${values.length}`);
    }

    if (input.filters.priority) {
      values.push(input.filters.priority);
      conditions.push(`priority = $${values.length}`);
    }

    if (input.filters.search) {
      values.push(`%${input.filters.search}%`);
      const idx = values.length;
      conditions.push(`(case_number ILIKE $${idx} OR emergency_type ILIKE $${idx} OR address_text ILIKE $${idx})`);
    }

    values.push(input.filters.limit);
    const limitIndex = values.length;
    values.push(input.filters.offset);
    const offsetIndex = values.length;

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = await db.query<EmergencyCaseRow>(
      `
      SELECT *
      FROM emergency_cases
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
      `,
      values
    );

    return query.rows;
  },

  updateCaseStatus: async (input: {
    caseId: string;
    status: CaseStatus;
    ambulanceEtaMinutes?: number;
    volunteerEtaMinutes?: number;
  }): Promise<EmergencyCaseRow | null> => {
    const query = await db.query<EmergencyCaseRow>(
      `
      UPDATE emergency_cases
      SET
        status = $2,
        ambulance_eta_minutes = COALESCE($3, ambulance_eta_minutes),
        volunteer_eta_minutes = COALESCE($4, volunteer_eta_minutes),
        updated_at = NOW(),
        closed_at = CASE
          WHEN $2 IN ('CLOSED'::case_status, 'CANCELLED'::case_status) THEN NOW()
          ELSE closed_at
        END
      WHERE id = $1
      RETURNING *
      `,
      [input.caseId, input.status, input.ambulanceEtaMinutes ?? null, input.volunteerEtaMinutes ?? null]
    );

    return query.rows[0] ?? null;
  },

  updateCaseDetails: async (input: {
    caseId: string;
    emergencyType?: string;
    priority?: CasePriority;
    voiceDescription?: string;
    transcriptionText?: string;
    aiAnalysis?: string;
    possibleCondition?: string;
    riskLevel?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    etaMinutes?: number;
    ambulanceEtaMinutes?: number;
    volunteerEtaMinutes?: number;
  }): Promise<EmergencyCaseRow | null> => {
    const query = await db.query<EmergencyCaseRow>(
      `
      UPDATE emergency_cases
      SET
        emergency_type = COALESCE($2, emergency_type),
        priority = COALESCE($3, priority),
        voice_description = COALESCE($4, voice_description),
        transcription_text = COALESCE($5, transcription_text),
        ai_analysis = COALESCE($6, ai_analysis),
        possible_condition = COALESCE($7, possible_condition),
        risk_level = COALESCE($8, risk_level),
        address_text = COALESCE($9, address_text),
        latitude = COALESCE($10, latitude),
        longitude = COALESCE($11, longitude),
        eta_minutes = COALESCE($12, eta_minutes),
        ambulance_eta_minutes = COALESCE($13, ambulance_eta_minutes),
        volunteer_eta_minutes = COALESCE($14, volunteer_eta_minutes),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        input.caseId,
        input.emergencyType ?? null,
        input.priority ?? null,
        input.voiceDescription ?? null,
        input.transcriptionText ?? null,
        input.aiAnalysis ?? null,
        input.possibleCondition ?? null,
        input.riskLevel ?? null,
        input.address ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.etaMinutes ?? null,
        input.ambulanceEtaMinutes ?? null,
        input.volunteerEtaMinutes ?? null
      ]
    );

    return query.rows[0] ?? null;
  },

  createEmergencyUpdate: async (input: {
    caseId: string;
    authorUserId?: string | null;
    updateType: string;
    message: string;
    payload?: Record<string, unknown>;
  }): Promise<EmergencyUpdateRow> => {
    const query = await db.query<EmergencyUpdateRow>(
      `
      INSERT INTO emergency_updates (case_id, author_user_id, update_type, message, payload)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [input.caseId, input.authorUserId ?? null, input.updateType, input.message, input.payload ?? {}]
    );

    return query.rows[0];
  },

  listEmergencyUpdates: async (caseId: string): Promise<EmergencyUpdateRow[]> => {
    const query = await db.query<EmergencyUpdateRow>(
      `
      SELECT *
      FROM emergency_updates
      WHERE case_id = $1
      ORDER BY created_at DESC
      `,
      [caseId]
    );

    return query.rows;
  },

  assignAmbulance: async (input: {
    caseId: string;
    ambulanceId: string;
    assignedByUserId: string;
    etaMinutes?: number;
    distanceKm?: number;
  }): Promise<AmbulanceAssignmentRow> => {
    const query = await db.query<AmbulanceAssignmentRow>(
      `
      INSERT INTO ambulance_assignments (
        case_id,
        ambulance_id,
        status,
        eta_minutes,
        distance_km,
        assigned_by,
        assigned_at
      )
      VALUES ($1, $2, 'ASSIGNED', $3, $4, $5, NOW())
      ON CONFLICT (case_id, ambulance_id)
      DO UPDATE SET
        status = 'ASSIGNED',
        eta_minutes = COALESCE(EXCLUDED.eta_minutes, ambulance_assignments.eta_minutes),
        distance_km = COALESCE(EXCLUDED.distance_km, ambulance_assignments.distance_km),
        assigned_by = EXCLUDED.assigned_by,
        assigned_at = NOW()
      RETURNING *
      `,
      [
        input.caseId,
        input.ambulanceId,
        input.etaMinutes ?? null,
        input.distanceKm ?? null,
        input.assignedByUserId
      ]
    );

    await db.query(
      `
      UPDATE ambulances
      SET status = 'DISPATCHED', updated_at = NOW()
      WHERE id = $1
      `,
      [input.ambulanceId]
    );

    return query.rows[0];
  },

  assignVolunteer: async (input: {
    caseId: string;
    volunteerId: string;
    assignedByUserId: string;
    etaMinutes?: number;
    distanceKm?: number;
  }): Promise<VolunteerAssignmentRow> => {
    const query = await db.query<VolunteerAssignmentRow>(
      `
      INSERT INTO volunteer_assignments (
        case_id,
        volunteer_id,
        status,
        eta_minutes,
        distance_km,
        assigned_by,
        assigned_at
      )
      VALUES ($1, $2, 'PENDING', $3, $4, $5, NOW())
      ON CONFLICT (case_id, volunteer_id)
      DO UPDATE SET
        status = 'PENDING',
        eta_minutes = COALESCE(EXCLUDED.eta_minutes, volunteer_assignments.eta_minutes),
        distance_km = COALESCE(EXCLUDED.distance_km, volunteer_assignments.distance_km),
        assigned_by = EXCLUDED.assigned_by,
        assigned_at = NOW()
      RETURNING *
      `,
      [input.caseId, input.volunteerId, input.etaMinutes ?? null, input.distanceKm ?? null, input.assignedByUserId]
    );

    return query.rows[0];
  },

  findVolunteerAssignmentByCase: async (input: {
    caseId: string;
    volunteerId: string;
  }): Promise<VolunteerAssignmentRow | null> => {
    const query = await db.query<VolunteerAssignmentRow>(
      `
      SELECT *
      FROM volunteer_assignments
      WHERE case_id = $1 AND volunteer_id = $2
      LIMIT 1
      `,
      [input.caseId, input.volunteerId]
    );

    return query.rows[0] ?? null;
  },

  findVolunteerAssignmentById: async (assignmentId: string): Promise<VolunteerAssignmentRow | null> => {
    const query = await db.query<VolunteerAssignmentRow>(
      `
      SELECT *
      FROM volunteer_assignments
      WHERE id = $1
      LIMIT 1
      `,
      [assignmentId]
    );

    return query.rows[0] ?? null;
  },

  updateVolunteerAssignmentStatus: async (input: {
    assignmentId: string;
    status: VolunteerAssignmentStatus;
    etaMinutes?: number;
    volunteerId?: string;
  }): Promise<VolunteerAssignmentRow | null> => {
    const query = await db.query<VolunteerAssignmentRow>(
      `
      UPDATE volunteer_assignments
      SET
        status = $2,
        eta_minutes = COALESCE($3, eta_minutes),
        responded_at = CASE
          WHEN $2 IN ('ACCEPTED'::volunteer_assignment_status, 'DECLINED'::volunteer_assignment_status)
            AND responded_at IS NULL
          THEN NOW()
          ELSE responded_at
        END,
        arrived_at = CASE
          WHEN $2 = 'ARRIVED'::volunteer_assignment_status AND arrived_at IS NULL THEN NOW()
          ELSE arrived_at
        END
      WHERE id = $1
      RETURNING *
      `,
      [input.assignmentId, input.status, input.etaMinutes ?? null]
    );

    if (input.volunteerId && input.status === "ACCEPTED") {
      await db.query(
        `
        UPDATE volunteers
        SET availability = 'BUSY', updated_at = NOW()
        WHERE id = $1
        `,
        [input.volunteerId]
      );
    }

    return query.rows[0] ?? null;
  },

  listVolunteerAssignmentsByCase: async (caseId: string): Promise<VolunteerAssignmentRow[]> => {
    const query = await db.query<VolunteerAssignmentRow>(
      `
      SELECT *
      FROM volunteer_assignments
      WHERE case_id = $1
      ORDER BY assigned_at DESC
      `,
      [caseId]
    );

    return query.rows;
  },

  listAmbulanceAssignmentsByCase: async (caseId: string): Promise<AmbulanceAssignmentRow[]> => {
    const query = await db.query<AmbulanceAssignmentRow>(
      `
      SELECT *
      FROM ambulance_assignments
      WHERE case_id = $1
      ORDER BY assigned_at DESC
      `,
      [caseId]
    );

    return query.rows;
  },

  findNearestAmbulance: async (input: {
    latitude: number;
    longitude: number;
  }): Promise<AmbulanceNearbyRow | null> => {
    const query = await db.query<AmbulanceNearbyRow>(
      `
      SELECT
        a.id,
        a.unit_code,
        a.status,
        a.crew_count,
        a.support_level,
        a.current_latitude,
        a.current_longitude,
        (
          6371 * ACOS(
            COS(RADIANS($1)) * COS(RADIANS(COALESCE(a.current_latitude, $1))) *
            COS(RADIANS(COALESCE(a.current_longitude, $2)) - RADIANS($2)) +
            SIN(RADIANS($1)) * SIN(RADIANS(COALESCE(a.current_latitude, $1)))
          )
        )::NUMERIC(8, 3) AS distance_km
      FROM ambulances a
      WHERE a.status IN ('AVAILABLE', 'DISPATCHED')
      ORDER BY distance_km ASC
      LIMIT 1
      `,
      [input.latitude, input.longitude]
    );

    return query.rows[0] ?? null;
  },

  listNearbyVolunteers: async (input: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    limit?: number;
  }): Promise<VolunteerNearbyRow[]> => {
    const query = await db.query<VolunteerNearbyRow>(
      `
      SELECT *
      FROM (
        SELECT
          v.id AS volunteer_id,
          v.user_id,
          u.full_name,
          v.specialty,
          v.availability,
          v.response_radius_km,
          v.current_latitude,
          v.current_longitude,
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
      [input.latitude, input.longitude, input.radiusKm, input.limit ?? 20]
    );

    return query.rows;
  },

  closeIncident: async (input: {
    caseId: string;
    closedByUserId: string;
    totalResponseSeconds?: number;
    ambulanceArrivalSeconds?: number;
    volunteerArrivalSeconds?: number;
    interventions?: string;
    notes?: string;
    finalOutcome: string;
    resolvedStatus?: string;
  }): Promise<void> => {
    await db.query(
      `
      INSERT INTO incident_reports (
        case_id,
        total_response_seconds,
        ambulance_arrival_seconds,
        volunteer_arrival_seconds,
        interventions,
        notes,
        final_outcome,
        closed_by_user_id,
        resolved_status,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (case_id)
      DO UPDATE SET
        total_response_seconds = EXCLUDED.total_response_seconds,
        ambulance_arrival_seconds = EXCLUDED.ambulance_arrival_seconds,
        volunteer_arrival_seconds = EXCLUDED.volunteer_arrival_seconds,
        interventions = EXCLUDED.interventions,
        notes = EXCLUDED.notes,
        final_outcome = EXCLUDED.final_outcome,
        closed_by_user_id = EXCLUDED.closed_by_user_id,
        resolved_status = EXCLUDED.resolved_status,
        updated_at = NOW()
      `,
      [
        input.caseId,
        input.totalResponseSeconds ?? null,
        input.ambulanceArrivalSeconds ?? null,
        input.volunteerArrivalSeconds ?? null,
        input.interventions ?? null,
        input.notes ?? null,
        input.finalOutcome,
        input.closedByUserId,
        input.resolvedStatus ?? "RESOLVED"
      ]
    );

    await db.query(
      `
      UPDATE emergency_cases
      SET status = 'CLOSED', closed_at = NOW(), updated_at = NOW()
      WHERE id = $1
      `,
      [input.caseId]
    );
  }
};
