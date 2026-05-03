CREATE TABLE IF NOT EXISTS sensor_readings (
    id          SERIAL PRIMARY KEY,
    sensor_id   VARCHAR(50)    NOT NULL,
    temperature NUMERIC(5, 2)  NOT NULL,
    humidity    NUMERIC(5, 2)  NOT NULL,
    co2_ppm     NUMERIC(7, 2),
    timestamp   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor_id ON sensor_readings (sensor_id);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp  ON sensor_readings (timestamp DESC);
