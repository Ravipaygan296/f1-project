-- F1 Analytics System — Database Schema
-- Run: psql f1_analytics -f db/schema.sql

CREATE TABLE IF NOT EXISTS seasons (
    year            INT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS circuits (
    circuit_id      TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    country         TEXT,
    locality        TEXT,
    lat             FLOAT,
    lng             FLOAT
);

CREATE TABLE IF NOT EXISTS races (
    race_id         SERIAL PRIMARY KEY,
    season          INT REFERENCES seasons(year),
    round           INT,
    circuit_id      TEXT REFERENCES circuits(circuit_id),
    name            TEXT,
    race_date       DATE,
    UNIQUE(season, round)
);

CREATE TABLE IF NOT EXISTS constructors (
    constructor_id  TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    color_hex       TEXT
);

CREATE TABLE IF NOT EXISTS drivers (
    driver_id       TEXT PRIMARY KEY,
    code            TEXT,
    number          INT,
    forename        TEXT,
    surname         TEXT,
    nationality     TEXT
);

CREATE TABLE IF NOT EXISTS results (
    result_id       SERIAL PRIMARY KEY,
    race_id         INT REFERENCES races(race_id),
    driver_id       TEXT REFERENCES drivers(driver_id),
    constructor_id  TEXT REFERENCES constructors(constructor_id),
    grid            INT,
    position        INT,
    points          FLOAT,
    status          TEXT,
    fastest_lap_time INTERVAL
);

CREATE TABLE IF NOT EXISTS laps (
    lap_id          SERIAL PRIMARY KEY,
    race_id         INT REFERENCES races(race_id),
    driver_id       TEXT REFERENCES drivers(driver_id),
    lap_number      INT,
    lap_time        INTERVAL,
    position        INT,
    is_pit_lap      BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS stints (
    stint_id        SERIAL PRIMARY KEY,
    race_id         INT REFERENCES races(race_id),
    driver_id       TEXT REFERENCES drivers(driver_id),
    stint_number    INT,
    compound        TEXT,
    lap_start       INT,
    lap_end         INT
);

CREATE TABLE IF NOT EXISTS pit_stops (
    pit_stop_id     SERIAL PRIMARY KEY,
    race_id         INT REFERENCES races(race_id),
    driver_id       TEXT REFERENCES drivers(driver_id),
    stop_number     INT,
    lap             INT,
    duration        INTERVAL
);

CREATE TABLE IF NOT EXISTS weather (
    weather_id      SERIAL PRIMARY KEY,
    race_id         INT REFERENCES races(race_id),
    recorded_at     TIMESTAMP,
    air_temp        FLOAT,
    track_temp      FLOAT,
    humidity        FLOAT,
    rainfall        BOOLEAN
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_laps_race_driver ON laps(race_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_results_race ON results(race_id);
CREATE INDEX IF NOT EXISTS idx_stints_race_driver ON stints(race_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_results_driver ON results(driver_id);
CREATE INDEX IF NOT EXISTS idx_pit_stops_race ON pit_stops(race_id);
CREATE INDEX IF NOT EXISTS idx_weather_race ON weather(race_id);
CREATE INDEX IF NOT EXISTS idx_races_season ON races(season);
CREATE INDEX IF NOT EXISTS idx_races_circuit ON races(circuit_id);

-- Unique constraints to prevent duplicate ingestion
ALTER TABLE results ADD CONSTRAINT IF NOT EXISTS uq_results_race_driver UNIQUE (race_id, driver_id);
ALTER TABLE laps ADD CONSTRAINT IF NOT EXISTS uq_laps_race_driver_lap UNIQUE (race_id, driver_id, lap_number);
ALTER TABLE pit_stops ADD CONSTRAINT IF NOT EXISTS uq_pitstops_race_driver_stop UNIQUE (race_id, driver_id, stop_number);
ALTER TABLE stints ADD CONSTRAINT IF NOT EXISTS uq_stints_race_driver_stint UNIQUE (race_id, driver_id, stint_number);
ALTER TABLE weather ADD CONSTRAINT IF NOT EXISTS uq_weather_race_time UNIQUE (race_id, recorded_at);

-- Read-only role for AI analyst (defense in depth)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ai_readonly') THEN
        CREATE ROLE ai_readonly LOGIN PASSWORD 'f1_readonly_2025';
    END IF;
END
$$;
GRANT CONNECT ON DATABASE f1_analytics TO ai_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ai_readonly;
