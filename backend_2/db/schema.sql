CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_id   UUID UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT,
  company       TEXT,
  country       TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'client',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consultants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  specialty     TEXT NOT NULL,
  experience_yrs INT NOT NULL DEFAULT 0,
  rating        NUMERIC(3,1) DEFAULT 5.0,
  bio           TEXT,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  tags          TEXT[],
  hourly_rate   NUMERIC(10,2) DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS availability (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  day_of_week   INT NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE
);

CREATE TYPE IF NOT EXISTS booking_status AS ENUM ('pending','confirmed','cancelled','completed','no_show');

CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_code  TEXT UNIQUE NOT NULL DEFAULT 'NIT-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT),1,8)),
  client_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  consultant_id   UUID REFERENCES consultants(id) ON DELETE SET NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  duration_mins   INT NOT NULL DEFAULT 60,
  status          booking_status DEFAULT 'pending',
  topic           TEXT NOT NULL,
  notes           TEXT,
  zoom_meeting_id TEXT,
  zoom_join_url   TEXT,
  zoom_start_url  TEXT,
  zoom_password   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT
);

CREATE TABLE IF NOT EXISTS email_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID REFERENCES bookings(id) ON DELETE CASCADE,
  recipient       TEXT NOT NULL,
  template_name   TEXT NOT NULL,
  sendgrid_msg_id TEXT,
  status          TEXT DEFAULT 'sent',
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id    UUID UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  client_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  rating        INT CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_client     ON bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_consultant ON bookings(consultant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled  ON bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status     ON bookings(status);
