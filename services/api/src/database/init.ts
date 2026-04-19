import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOOT_TABLE_DEFINITIONS: string[] = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
  `DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('CITIZEN', 'VOLUNTEER', 'DISPATCHER', 'AMBULANCE_CREW', 'ADMIN');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE TYPE case_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE TYPE case_status AS ENUM (
      'NEW','TRIAGED','VOLUNTEERS_NOTIFIED','VOLUNTEER_EN_ROUTE',
      'AMBULANCE_ASSIGNED','AMBULANCE_EN_ROUTE','ON_SCENE',
      'STABILIZED','CLOSED','CANCELLED'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'ANALYZING';
  EXCEPTION WHEN others THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'VOLUNTEER_ACCEPTED';
  EXCEPTION WHEN others THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'FIRST_AID_GUIDANCE';
  EXCEPTION WHEN others THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE TYPE location_actor AS ENUM ('CITIZEN', 'VOLUNTEER', 'AMBULANCE', 'DISPATCHER');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE TYPE volunteer_availability AS ENUM ('AVAILABLE', 'OFF_DUTY', 'BUSY');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE TYPE volunteer_assignment_status AS ENUM ('PENDING','ACCEPTED','DECLINED','ARRIVED','COMPLETED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE TYPE ambulance_status AS ENUM ('AVAILABLE','DISPATCHED','EN_ROUTE','ON_SCENE','OFFLINE');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE TYPE ambulance_assignment_status AS ENUM ('PENDING','ASSIGNED','EN_ROUTE','ARRIVED','COMPLETED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    CREATE TYPE message_type AS ENUM ('CHAT','SYSTEM','STATUS_UPDATE');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'CITIZEN',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS emergency_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    citizen_id UUID REFERENCES users(id) ON DELETE SET NULL,
    incident_type TEXT,
    priority case_priority NOT NULL DEFAULT 'MEDIUM',
    status case_status NOT NULL DEFAULT 'NEW',
    description TEXT NOT NULL DEFAULT '',
    address_text TEXT NOT NULL DEFAULT '',
    latitude NUMERIC(10, 7) NOT NULL DEFAULT 0,
    longitude NUMERIC(10, 7) NOT NULL DEFAULT 0,
    extra_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    case_number TEXT,
    reporting_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    emergency_type TEXT,
    voice_description TEXT,
    transcription_text TEXT,
    ai_analysis TEXT,
    possible_condition TEXT,
    risk_level TEXT,
    eta_minutes INTEGER,
    ambulance_eta_minutes INTEGER,
    volunteer_eta_minutes INTEGER,
    started_at TIMESTAMPTZ
  )`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS case_number TEXT`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS reporting_user_id UUID`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS emergency_type TEXT`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS voice_description TEXT`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS transcription_text TEXT`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS ai_analysis TEXT`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS possible_condition TEXT`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS risk_level TEXT`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS eta_minutes INTEGER`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS ambulance_eta_minutes INTEGER`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS volunteer_eta_minutes INTEGER`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`,
  `ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS caller_details_pending BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS medical_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    blood_type TEXT,
    conditions TEXT,
    allergies TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    health_data_sharing BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS volunteers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    specialty TEXT NOT NULL DEFAULT 'General First Aid',
    verification_badge TEXT NOT NULL DEFAULT 'Verified Medical Volunteer',
    credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
    licenses JSONB NOT NULL DEFAULT '[]'::jsonb,
    availability volunteer_availability NOT NULL DEFAULT 'OFF_DUTY',
    response_radius_km NUMERIC(5, 2) NOT NULL DEFAULT 5,
    years_volunteering INTEGER NOT NULL DEFAULT 0,
    incidents_responded INTEGER NOT NULL DEFAULT 0,
    average_rating NUMERIC(3, 2) NOT NULL DEFAULT 0,
    current_latitude NUMERIC(10, 7),
    current_longitude NUMERIC(10, 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS dispatchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    center_name TEXT NOT NULL DEFAULT 'City Emergency Control',
    shift_label TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS ambulances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_code TEXT NOT NULL UNIQUE,
    crew_count INTEGER NOT NULL DEFAULT 2,
    support_level TEXT NOT NULL DEFAULT 'BLS',
    status ambulance_status NOT NULL DEFAULT 'AVAILABLE',
    current_latitude NUMERIC(10, 7),
    current_longitude NUMERIC(10, 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS volunteer_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
    volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE RESTRICT,
    status volunteer_assignment_status NOT NULL DEFAULT 'PENDING',
    distance_km NUMERIC(6, 2),
    eta_minutes INTEGER,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    UNIQUE(case_id, volunteer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ambulance_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
    ambulance_id UUID NOT NULL REFERENCES ambulances(id) ON DELETE RESTRICT,
    status ambulance_assignment_status NOT NULL DEFAULT 'ASSIGNED',
    distance_km NUMERIC(6, 2),
    eta_minutes INTEGER,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    arrived_at TIMESTAMPTZ,
    UNIQUE(case_id, ambulance_id)
  )`,
  `CREATE TABLE IF NOT EXISTS emergency_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    update_type TEXT NOT NULL,
    message TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
    sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    message_type message_type NOT NULL DEFAULT 'CHAT',
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS live_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID REFERENCES emergency_cases(id) ON DELETE CASCADE,
    actor_type location_actor NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ambulance_id UUID REFERENCES ambulances(id) ON DELETE SET NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    heading NUMERIC(6, 2),
    speed_kmh NUMERIC(6, 2),
    eta_minutes INTEGER,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS incident_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL UNIQUE REFERENCES emergency_cases(id) ON DELETE CASCADE,
    total_response_seconds INTEGER,
    ambulance_arrival_seconds INTEGER,
    volunteer_arrival_seconds INTEGER,
    interventions TEXT,
    notes TEXT,
    final_outcome TEXT,
    closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_status TEXT NOT NULL DEFAULT 'RESOLVED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `INSERT INTO volunteers (user_id)
   SELECT id FROM users WHERE role = 'VOLUNTEER'
   ON CONFLICT (user_id) DO NOTHING`,
  `INSERT INTO medical_profiles (user_id)
   SELECT id FROM users WHERE role = 'CITIZEN'
   ON CONFLICT (user_id) DO NOTHING`,
  `INSERT INTO ambulances (unit_code, crew_count, support_level, status, current_latitude, current_longitude)
   VALUES ('AMB-BETH-001', 2, 'BLS', 'AVAILABLE', 31.7054, 35.2024)
   ON CONFLICT (unit_code) DO NOTHING`,
  `CREATE INDEX IF NOT EXISTS idx_volunteers_availability ON volunteers(availability)`,
  `CREATE INDEX IF NOT EXISTS idx_ambulances_status ON ambulances(status)`,
  `CREATE INDEX IF NOT EXISTS idx_emergency_cases_status ON emergency_cases(status)`,
  `CREATE INDEX IF NOT EXISTS idx_volunteer_assignments_case ON volunteer_assignments(case_id, assigned_at DESC)`
];

const candidateMigrationDirs = async (): Promise<string[]> => {
  const here = __dirname;
  const candidates = [
    path.join(here, "migrations"),
    path.resolve(here, "../../src/database/migrations"),
    path.resolve(process.cwd(), "src/database/migrations"),
    path.resolve(process.cwd(), "services/api/src/database/migrations")
  ];

  const resolved: string[] = [];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) {
        resolved.push(candidate);
      }
    } catch {
      // directory not present; try next candidate
    }
  }

  return Array.from(new Set(resolved));
};

const runPendingMigrations = async (): Promise<void> => {
  const dirs = await candidateMigrationDirs();
  if (dirs.length === 0) {
    console.warn("[DB] No migrations directory found at runtime; skipping migrations.");
    return;
  }

  const migrationDir = dirs[0];

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const entries = await readdir(migrationDir);
  const files = entries.filter((name) => name.endsWith(".sql")).sort();

  for (const fileName of files) {
    const alreadyApplied = await db.query<{ id: string }>(
      "SELECT id FROM schema_migrations WHERE id = $1 LIMIT 1",
      [fileName]
    );

    if (alreadyApplied.rowCount) {
      continue;
    }

    const fullPath = path.join(migrationDir, fileName);
    const sql = await readFile(fullPath, "utf8");
    const client = await db.getClient();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [fileName]);
      await client.query("COMMIT");
      console.log(`[DB] Applied migration ${fileName}`);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`[DB] Migration ${fileName} failed:`, error);
    } finally {
      client.release();
    }
  }
};

const runBootTableDefinitions = async (label: string): Promise<void> => {
  let successes = 0;
  let failures = 0;
  for (const statement of BOOT_TABLE_DEFINITIONS) {
    try {
      await db.query(statement);
      successes += 1;
    } catch (error) {
      failures += 1;
      const preview = statement.replace(/\s+/g, " ").trim().slice(0, 80);
      console.warn(`[DB:${label}] Boot statement failed (${preview}...):`, error);
    }
  }
  console.log(`[DB:${label}] Boot statements applied ok=${successes} failed=${failures}`);
};

export const initDatabase = async (): Promise<void> => {
  await runBootTableDefinitions("pre-migrations");

  try {
    await runPendingMigrations();
  } catch (error) {
    console.warn("[DB] Pending migrations check failed:", error);
  }

  await runBootTableDefinitions("post-migrations");
};
