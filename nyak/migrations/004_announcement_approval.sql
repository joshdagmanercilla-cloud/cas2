ALTER TABLE announcements ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 0 CHECK (is_approved IN (0,1));
ALTER TABLE announcements ADD COLUMN created_by TEXT REFERENCES officials(id);
ALTER TABLE announcements ADD COLUMN updated_at TEXT;
