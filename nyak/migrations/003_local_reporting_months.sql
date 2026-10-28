ALTER TABLE reports ADD COLUMN incident_month TEXT;
ALTER TABLE reports ADD COLUMN submitted_month TEXT;
CREATE INDEX reports_incident_month ON reports(incident_month);
CREATE INDEX reports_submitted_month ON reports(submitted_month);
