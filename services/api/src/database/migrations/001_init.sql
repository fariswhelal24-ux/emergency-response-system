CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('CITIZEN', 'VOLUNTEER', 'DISPATCHER', 'AMBULANCE_CREW', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  CREATE TYPE case_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  CREATE TYPE case_status AS ENUM (
    'NEW',
    'TRIAGED',
    'VOLUNTEERS_NOTIFIED',
    'VOLUNTEER_EN_ROUTE',
    'AMBULANCE_ASSIGNED',
    'AMBULANCE_EN_ROUTE',
    'ON_SCENE',
    'STABILIZED',
    'CLOSED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  CREATE TYPE location_actor AS ENUM ('CITIZEN', 'VOLUNTEER', 'AMBULANCE', 'DISPATCHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'CITIZEN',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emergency_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  citizen_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  incident_type TEXT NOT NULL,
  priority case_priority NOT NULL,
  status case_status NOT NULL DEFAULT 'NEW',
  description TEXT NOT NULL,
  address_text TEXT NOT NULL,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  extra_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS case_additional_info (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_timeline_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS location_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID REFERENCES emergency_cases(id) ON DELETE CASCADE,
  actor_type location_actor NOT NULL,
  actor_id UUID,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  heading NUMERIC(6, 2),
  speed_kmh NUMERIC(6, 2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_status_created ON emergency_cases(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_citizen_created ON emergency_cases(citizen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_additional_info_case_created ON case_additional_info(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_case_created ON case_timeline_events(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_case_recorded ON location_updates(case_id, recorded_at DESC);
