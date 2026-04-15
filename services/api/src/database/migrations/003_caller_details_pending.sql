-- Pending caller/dispatcher case enrichment before volunteers should accept.
ALTER TABLE emergency_cases ADD COLUMN IF NOT EXISTS caller_details_pending BOOLEAN NOT NULL DEFAULT FALSE;
