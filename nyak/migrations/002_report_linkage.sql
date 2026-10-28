ALTER TABLE reports ADD COLUMN plate_number_display TEXT;
ALTER TABLE reports ADD COLUMN duplicate_of_report_id INTEGER REFERENCES reports(id);
UPDATE reports SET plate_number_display=plate WHERE plate_number_display IS NULL;
CREATE INDEX reports_duplicate_link ON reports(duplicate_of_report_id);
