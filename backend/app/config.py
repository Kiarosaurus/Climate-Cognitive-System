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

# Watson Custom Extension API key (protects /sensors and /chat endpoints)
WATSON_EXTENSION_KEY = os.getenv("WATSON_EXTENSION_KEY", "")

# JWT
SECRET_KEY = os.getenv("SECRET_KEY", "changeme-set-a-strong-32-char-key-in-prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
