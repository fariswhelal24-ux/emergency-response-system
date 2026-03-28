CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  CREATE TYPE volunteer_availability AS ENUM ('AVAILABLE', 'OFF_DUTY', 'BUSY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  CREATE TYPE volunteer_assignment_status AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'ARRIVED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  CREATE TYPE ambulance_status AS ENUM ('AVAILABLE', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'OFFLINE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  CREATE TYPE ambulance_assignment_status AS ENUM ('PENDING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  CREATE TYPE message_type AS ENUM ('CHAT', 'SYSTEM', 'STATUS_UPDATE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'ANALYZING';
  ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'VOLUNTEER_ACCEPTED';
  ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'FIRST_AID_GUIDANCE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS case_number TEXT;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS reporting_user_id UUID;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS emergency_type TEXT;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS voice_description TEXT;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS transcription_text TEXT;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS ai_analysis TEXT;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS possible_condition TEXT;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS risk_level TEXT;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS eta_minutes INTEGER;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS ambulance_eta_minutes INTEGER;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS volunteer_eta_minutes INTEGER;
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

UPDATE emergency_cases
SET emergency_type = incident_type
WHERE emergency_type IS NULL
  AND incident_type IS NOT NULL;

UPDATE emergency_cases
SET reporting_user_id = citizen_id
WHERE reporting_user_id IS NULL
  AND citizen_id IS NOT NULL;

UPDATE emergency_cases
SET started_at = created_at
WHERE started_at IS NULL;

UPDATE emergency_cases
SET case_number = CONCAT('CASE-', TO_CHAR(created_at, 'YYYYMMDD'), '-', UPPER(SUBSTRING(REPLACE(id::TEXT, '-', '') FROM 1 FOR 6)))
WHERE case_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_case_case_number ON emergency_cases(case_number);

CREATE TABLE IF NOT EXISTS medical_profiles (
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
);

CREATE TABLE IF NOT EXISTS volunteers (
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
);

CREATE TABLE IF NOT EXISTS dispatchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  center_name TEXT NOT NULL DEFAULT 'City Emergency Control',
  shift_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ambulances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_code TEXT NOT NULL UNIQUE,
  crew_count INTEGER NOT NULL DEFAULT 2,
  support_level TEXT NOT NULL DEFAULT 'BLS',
  status ambulance_status NOT NULL DEFAULT 'AVAILABLE',
  current_latitude NUMERIC(10, 7),
  current_longitude NUMERIC(10, 7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emergency_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  update_type TEXT NOT NULL,
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS volunteer_assignments (
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
);

CREATE TABLE IF NOT EXISTS ambulance_assignments (
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
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES emergency_cases(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message_type message_type NOT NULL DEFAULT 'CHAT',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_locations (
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
);

CREATE TABLE IF NOT EXISTS incident_reports (
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
);

INSERT INTO ambulances (unit_code, crew_count, support_level, status, current_latitude, current_longitude)
VALUES
  ('AMB-101', 3, 'ALS', 'AVAILABLE', 31.9038, 35.2034),
  ('AMB-204', 2, 'BLS', 'AVAILABLE', 31.9011, 35.2102),
  ('AMB-302', 2, 'BLS', 'DISPATCHED', 31.8955, 35.1982)
ON CONFLICT (unit_code) DO NOTHING;

INSERT INTO medical_profiles (user_id)
SELECT id
FROM users
WHERE role = 'CITIZEN'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO volunteers (user_id)
SELECT id
FROM users
WHERE role = 'VOLUNTEER'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO dispatchers (user_id)
SELECT id
FROM users
WHERE role IN ('DISPATCHER', 'ADMIN')
ON CONFLICT (user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_emergency_cases_status ON emergency_cases(status);
CREATE INDEX IF NOT EXISTS idx_emergency_cases_reporter ON emergency_cases(reporting_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_updates_case ON emergency_updates(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_volunteer_assignments_case ON volunteer_assignments(case_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_ambulance_assignments_case ON ambulance_assignments(case_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_locations_case ON live_locations(case_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_volunteers_availability ON volunteers(availability);
CREATE INDEX IF NOT EXISTS idx_ambulances_status ON ambulances(status);
