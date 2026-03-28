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
    'ANALYZING',
    'VOLUNTEERS_NOTIFIED',
    'VOLUNTEER_ACCEPTED',
    'VOLUNTEER_EN_ROUTE',
    'AMBULANCE_ASSIGNED',
    'AMBULANCE_EN_ROUTE',
    'ON_SCENE',
    'FIRST_AID_GUIDANCE',
    'STABILIZED',
    'CLOSED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

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
  avatar_url TEXT,
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

CREATE TABLE IF NOT EXISTS emergency_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_number TEXT NOT NULL UNIQUE,
  reporting_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  emergency_type TEXT NOT NULL,
  priority case_priority NOT NULL DEFAULT 'MEDIUM',
  status case_status NOT NULL DEFAULT 'NEW',
  voice_description TEXT,
  transcription_text TEXT,
  ai_analysis TEXT,
  possible_condition TEXT,
  risk_level TEXT,
  address_text TEXT NOT NULL,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  eta_minutes INTEGER,
  ambulance_eta_minutes INTEGER,
  volunteer_eta_minutes INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
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

CREATE INDEX IF NOT EXISTS idx_emergency_cases_status ON emergency_cases(status);
CREATE INDEX IF NOT EXISTS idx_emergency_cases_reporter ON emergency_cases(reporting_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_updates_case ON emergency_updates(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_volunteer_assignments_case ON volunteer_assignments(case_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_ambulance_assignments_case ON ambulance_assignments(case_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_locations_case ON live_locations(case_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_volunteers_availability ON volunteers(availability);
CREATE INDEX IF NOT EXISTS idx_ambulances_status ON ambulances(status);

-- AI Assistant Tables
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  last_message TEXT,
  message_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('ar', 'en', 'mixed')),
  intent TEXT,
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  tokens INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for AI tables
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_user ON ai_chat_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_emergency ON ai_chat_messages(is_emergency) WHERE is_emergency = TRUE;

