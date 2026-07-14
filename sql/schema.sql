-- CorridorEye database schema.
-- Run once against a fresh Neon Postgres database via `npm run db:setup`.

-- users: both the "system" (monitoring company) account and the
-- "vehicle" (driver phone) accounts live in the same table, distinguished
-- by role. This keeps auth logic in one place.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('system','vehicle')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- routes: a route is just an ordered list of [lat,lng] points drawn on the
-- map, plus a corridor width in meters. We store points as JSONB rather
-- than a PostGIS geometry column because this demo does not use PostGIS.
CREATE TABLE IF NOT EXISTS routes (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  points      JSONB NOT NULL,
  corridor_m  INTEGER NOT NULL DEFAULT 150,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- assignments: which route a vehicle is currently supposed to follow.
-- A vehicle can have many assignment rows over time, but only one with
-- active = true at once (enforced in application code, not a DB constraint).
CREATE TABLE IF NOT EXISTS assignments (
  id              SERIAL PRIMARY KEY,
  route_id        INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  vehicle_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- positions: every GPS fix a vehicle phone reports. This table grows
-- quickly (one row every ~3 seconds per active vehicle), so it uses
-- BIGSERIAL and an index on (vehicle_user_id, created_at) to make the
-- "latest position per vehicle" and "last 20 points" queries fast.
CREATE TABLE IF NOT EXISTS positions (
  id              BIGSERIAL PRIMARY KEY,
  vehicle_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  accuracy        DOUBLE PRECISION,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_positions_vehicle_time ON positions (vehicle_user_id, created_at DESC);

-- alerts: created when a vehicle is detected off its assigned route.
-- acknowledged tracks whether the system operator has dismissed it.
CREATE TABLE IF NOT EXISTS alerts (
  id              BIGSERIAL PRIMARY KEY,
  vehicle_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id        INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  distance_m      DOUBLE PRECISION NOT NULL,
  acknowledged    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
