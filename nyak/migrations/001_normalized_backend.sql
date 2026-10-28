CREATE TABLE barangays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL DEFAULT 'Cauayan City',
  province TEXT NOT NULL DEFAULT 'Isabela',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE TABLE plate_records (
  id TEXT PRIMARY KEY,
  plate_number_normalized TEXT NOT NULL UNIQUE,
  plate_number_display TEXT NOT NULL,
  first_reported_at TEXT NOT NULL,
  last_reported_at TEXT NOT NULL,
  total_reports INTEGER NOT NULL DEFAULT 0,
  total_verified_violations INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE reports ADD COLUMN report_uuid TEXT;
ALTER TABLE reports ADD COLUMN plate_number_normalized TEXT;
ALTER TABLE reports ADD COLUMN barangay_id TEXT REFERENCES barangays(id);
ALTER TABLE reports ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'Unverified';
ALTER TABLE reports ADD COLUMN reviewer_id TEXT;
ALTER TABLE reports ADD COLUMN reviewed_at TEXT;
ALTER TABLE reports ADD COLUMN possible_duplicate_of TEXT;
ALTER TABLE reports ADD COLUMN created_at TEXT;
ALTER TABLE reports ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX reports_uuid_unique ON reports(report_uuid);
CREATE INDEX reports_normalized_plate_month ON reports(plate_number_normalized, incident_at);
CREATE INDEX reports_barangay_status ON reports(barangay_id, status);

CREATE TABLE monthly_plate_statistics (
  id TEXT PRIMARY KEY,
  plate_record_id TEXT NOT NULL REFERENCES plate_records(id) ON DELETE CASCADE,
  report_month TEXT NOT NULL,
  total_reports INTEGER NOT NULL DEFAULT 0,
  unique_incidents INTEGER NOT NULL DEFAULT 0,
  verified_violations INTEGER NOT NULL DEFAULT 0,
  rejected_reports INTEGER NOT NULL DEFAULT 0,
  duplicate_reports INTEGER NOT NULL DEFAULT 0,
  last_calculated_at TEXT NOT NULL,
  UNIQUE (plate_record_id, report_month)
);

ALTER TABLE status_history ADD COLUMN previous_status TEXT;
ALTER TABLE status_history ADD COLUMN changed_by TEXT;
ALTER TABLE status_history ADD COLUMN notes TEXT;
UPDATE status_history SET notes=note WHERE notes IS NULL;
CREATE TABLE officials (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Administrator','Reviewer','Read-Only Official')),
  barangay_id TEXT REFERENCES barangays(id),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE official_sessions (
  token_hash TEXT PRIMARY KEY,
  official_id TEXT NOT NULL REFERENCES officials(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX official_sessions_expiry ON official_sessions(expires_at);

ALTER TABLE audit ADD COLUMN official_id TEXT REFERENCES officials(id);
ALTER TABLE audit ADD COLUMN entity_type TEXT;
ALTER TABLE audit ADD COLUMN entity_id TEXT;
ALTER TABLE audit ADD COLUMN metadata TEXT;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit records are immutable'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit records are immutable'); END;

CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

