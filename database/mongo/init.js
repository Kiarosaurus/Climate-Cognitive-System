db = db.getSiblingDB("climate_db");

db.createCollection("sensor_readings");

db.sensor_readings.createIndex({ sensor_id: 1, timestamp: -1 });

print("MongoDB initialized: climate_db.sensor_readings ready.");
