import logging
from fastapi import Security, Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from jose import JWTError

from app.config import WATSON_EXTENSION_KEY
from app.core.security import oauth2_scheme, decode_token
from app.database_sql import get_db_sql

logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(key: str = Security(_api_key_header)):
    if WATSON_EXTENSION_KEY and key != WATSON_EXTENSION_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db_sql),
):
    # Deliberately sync: FastAPI runs sync dependencies in the threadpool, so the
    # blocking SQL lookup below never lands on the event loop. As `async def` it
    # would stall the loop on every authenticated request.
    from app.models.admin import User  # local import avoids circular at module load

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        username: str = payload.get("sub")
        if not username:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exc
    # Immediate revocation: a user deactivated mid-session must not keep working
    # until the token expires. 401 (not 403) so the frontend's interceptor runs
    # its session-expiry flow and logs the account out.
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is not active.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
