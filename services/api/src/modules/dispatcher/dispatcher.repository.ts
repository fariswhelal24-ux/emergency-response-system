import { db } from "../../database/pool";

export type DashboardStatsRow = {
  active_cases: string;
  ambulances_available: string;
  volunteers_available: string;
  high_priority_incidents: string;
};

export type DispatcherCaseRow = {
  id: string;
  case_number: string;
  emergency_type: string;
  priority: string;
  status: string;
  address_text: string;
  latitude: string;
  longitude: string;
  created_at: Date;
  reporting_user_id: string;
};

export type DetailedCaseRow = {
  id: string;
  case_number: string;
  emergency_type: string;
  priority: string;
  status: string;
  voice_description: string | null;
  transcription_text: string | null;
  ai_analysis: string | null;
  possible_condition: string | null;
  risk_level: string | null;
  address_text: string;
  latitude: string;
  longitude: string;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
  reporting_user_id: string;
  reporter_name: string;
  reporter_phone: string | null;
  blood_type: string | null;
  conditions: string | null;
  allergies: string | null;
};

export type TimelineRow = {
  id: string;
  case_id: string;
  update_type: string;
  message: string;
  payload: Record<string, unknown>;
  created_at: Date;
  author_user_id: string | null;
};

export type DispatcherReportSummaryRow = {
  date_label: string;
  case_count: string;
  avg_total_response_seconds: string | null;
  volunteer_contributions: string;
};

export const dispatcherRepository = {
  getDashboardStats: async (): Promise<DashboardStatsRow> => {
    const query = await db.query<DashboardStatsRow>(
      `
      SELECT
        (SELECT COUNT(*) FROM emergency_cases WHERE status NOT IN ('CLOSED', 'CANCELLED')) AS active_cases,
        (SELECT COUNT(*) FROM ambulances WHERE status = 'AVAILABLE') AS ambulances_available,
        (SELECT COUNT(*) FROM volunteers WHERE availability = 'AVAILABLE') AS volunteers_available,
        (SELECT COUNT(*) FROM emergency_cases WHERE priority IN ('HIGH', 'CRITICAL') AND status NOT IN ('CLOSED', 'CANCELLED')) AS high_priority_incidents
      `
    );

    return query.rows[0];
  },

  listActiveCases: async (): Promise<DispatcherCaseRow[]> => {
    const query = await db.query<DispatcherCaseRow>(
      `
      SELECT
        id,
        case_number,
        emergency_type,
        priority,
        status,
        address_text,
        latitude,
        longitude,
        created_at,
        reporting_user_id
      FROM emergency_cases
      WHERE status NOT IN ('CLOSED', 'CANCELLED')
      ORDER BY
        CASE priority
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          ELSE 4
        END,
        created_at DESC
      `
    );

    return query.rows;
  },

  getCaseDetails: async (caseId: string): Promise<DetailedCaseRow | null> => {
    const query = await db.query<DetailedCaseRow>(
      `
      SELECT
        ec.id,
        ec.case_number,
        ec.emergency_type,
        ec.priority,
        ec.status,
        ec.voice_description,
        ec.transcription_text,
        ec.ai_analysis,
        ec.possible_condition,
        ec.risk_level,
        ec.address_text,
        ec.latitude,
        ec.longitude,
        ec.created_at,
        ec.updated_at,
        ec.closed_at,
        ec.reporting_user_id,
        u.full_name AS reporter_name,
        u.phone AS reporter_phone,
        mp.blood_type,
        mp.conditions,
        mp.allergies
      FROM emergency_cases ec
      INNER JOIN users u ON u.id = ec.reporting_user_id
      LEFT JOIN medical_profiles mp ON mp.user_id = u.id
      WHERE ec.id = $1
      LIMIT 1
      `,
      [caseId]
    );

    return query.rows[0] ?? null;
  },

  getTimeline: async (caseId: string): Promise<TimelineRow[]> => {
    const query = await db.query<TimelineRow>(
      `
      SELECT
        id,
        case_id,
        update_type,
        message,
        payload,
        created_at,
        author_user_id
      FROM emergency_updates
      WHERE case_id = $1
      ORDER BY created_at ASC
      `,
      [caseId]
    );

    return query.rows;
  },

  listCaseVolunteers: async (caseId: string) => {
    const query = await db.query<
      {
        assignment_id: string;
        volunteer_id: string;
        status: string;
        eta_minutes: number | null;
        distance_km: string | null;
        assigned_at: Date;
        full_name: string;
        specialty: string;
      }
    >(
      `
      SELECT
        va.id AS assignment_id,
        va.volunteer_id,
        va.status,
        va.eta_minutes,
        va.distance_km,
        va.assigned_at,
        u.full_name,
        v.specialty
      FROM volunteer_assignments va
      INNER JOIN volunteers v ON v.id = va.volunteer_id
      INNER JOIN users u ON u.id = v.user_id
      WHERE va.case_id = $1
      ORDER BY va.assigned_at DESC
      `,
      [caseId]
    );

    return query.rows;
  },

  listCaseAmbulances: async (caseId: string) => {
    const query = await db.query<
      {
        assignment_id: string;
        ambulance_id: string;
        status: string;
        eta_minutes: number | null;
        distance_km: string | null;
        assigned_at: Date;
        unit_code: string;
        support_level: string;
      }
    >(
      `
      SELECT
        aa.id AS assignment_id,
        aa.ambulance_id,
        aa.status,
        aa.eta_minutes,
        aa.distance_km,
        aa.assigned_at,
        a.unit_code,
        a.support_level
      FROM ambulance_assignments aa
      INNER JOIN ambulances a ON a.id = aa.ambulance_id
      WHERE aa.case_id = $1
      ORDER BY aa.assigned_at DESC
      `,
      [caseId]
    );

    return query.rows;
  },

  getReportSummary: async (): Promise<DispatcherReportSummaryRow[]> => {
    const query = await db.query<DispatcherReportSummaryRow>(
      `
      SELECT
        TO_CHAR(ec.created_at::date, 'YYYY-MM-DD') AS date_label,
        COUNT(ec.id)::TEXT AS case_count,
        ROUND(AVG(ir.total_response_seconds))::TEXT AS avg_total_response_seconds,
        COUNT(va.id)::TEXT AS volunteer_contributions
      FROM emergency_cases ec
      LEFT JOIN incident_reports ir ON ir.case_id = ec.id
      LEFT JOIN volunteer_assignments va ON va.case_id = ec.id AND va.status IN ('ACCEPTED', 'ARRIVED', 'COMPLETED')
      GROUP BY ec.created_at::date
      ORDER BY ec.created_at::date DESC
      LIMIT 14
      `
    );

    return query.rows;
  }
};
