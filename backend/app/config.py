import os

MONGO_URI = os.getenv("MONGO_URI", "mongodb://mongo:27017")
POSTGRES_URI = os.getenv(
    "POSTGRES_URI",
    "postgresql://postgres:postgres@localhost:5432/climate_db",
)

# IBM Watson Assistant
WATSON_API_KEY = os.getenv("WATSON_API_KEY", "")
WATSON_URL = os.getenv("WATSON_URL", "")
WATSON_ASSISTANT_ID = os.getenv("WATSON_ASSISTANT_ID", "")
