import asyncio
import logging
from fastapi import FastAPI, Depends
from app.routes import sensors, admin, chat, auth
from app.dependencies import require_api_key

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Climate Cognitive System API",
    version="1.0.0",
    description="IoT Cognitive backend for climate sensor data ingestion and analysis.",
)

app.include_router(
    sensors.router,
    prefix="/api/v1/sensors",
    tags=["sensors"],
    dependencies=[Depends(require_api_key)],
)
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(
    chat.router,
    prefix="/api/v1/chat",
    tags=["chat"],
    dependencies=[Depends(require_api_key)],
)


@app.on_event("startup")
async def startup_watson():
    from app.services.watson_service import init_watson
    init_watson()


@app.on_event("startup")
async def startup_ml():
    from app.services.predictive_service import load_model
    load_model()


@app.on_event("startup")
async def startup_db():
    import app.models.admin  # register ORM models before create_all
    from app.database_sql import engine, Base, SessionLocal
    from sqlalchemy import text

    for attempt in range(1, 6):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            Base.metadata.create_all(bind=engine)
            logger.info("PostgreSQL ready — tables created/verified.")
            break
        except Exception as exc:
            logger.warning("PostgreSQL not ready (%d/5): %s", attempt, exc)
            if attempt < 5:
                await asyncio.sleep(3)
            else:
                logger.error("Could not connect to PostgreSQL after 5 attempts. Continuing without SQL layer.")
                return

    _run_migrations(engine, text)
    _seed_admin(SessionLocal)


def _run_migrations(engine, text):
    """Add columns introduced in the enterprise rewrite that create_all won't back-fill."""
    migrations = [
        # users: status column (pending | active | inactive)
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'active'",
        # users: ensure role column exists (it should, but guard against missing default)
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'guest'",
    ]
    try:
        with engine.begin() as conn:
            for sql in migrations:
                conn.execute(text(sql))
        logger.info("Schema migrations applied.")
    except Exception as exc:
        logger.warning("Migration warning (non-fatal): %s", exc)


def _seed_admin(SessionLocal):
    """Ensure admin user exists with a valid argon2 password hash."""
    logger.info("_seed_admin: starting.")
    db = SessionLocal()
    try:
        from app.models.admin import User
        from app.core.security import hash_password

        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            db.add(User(
                username="admin",
                hashed_password=hash_password("admin"),
                role="admin",
                status="active",
            ))
            logger.info("_seed_admin: created admin user.")
        else:
            admin_user.hashed_password = hash_password("admin")
            admin_user.role = "admin"
            admin_user.status = "active"
            logger.info("_seed_admin: reset admin credentials (hash=%s…).", admin_user.hashed_password[:20])
        db.commit()
        logger.info("_seed_admin: done.")
    except Exception as exc:
        db.rollback()
        logger.error("_seed_admin: FAILED — %s", exc, exc_info=True)
    finally:
        db.close()


@app.get("/health")
def health_check():
    return {"status": "ok"}
