CREATE TABLE IF NOT EXISTS events (
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  visit TEXT,
  name TEXT NOT NULL,
  step TEXT, status TEXT, bucket TEXT, device TEXT, screen TEXT
);
CREATE INDEX IF NOT EXISTS events_name ON events(name);
CREATE INDEX IF NOT EXISTS events_day ON events(day);
