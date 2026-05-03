import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import watson_service

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str


class ChatResponse(BaseModel):
    response: str
    session_id: str


@router.post("/", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    try:
        session_id = payload.session_id
        if not session_id:
            session_id = await watson_service.create_session()
            logger.info("New Watson session created: %s", session_id)

        response_text = await watson_service.send_message(session_id, payload.message)
        logger.info("Watson response for session %s: %s", session_id, response_text[:80])
        return ChatResponse(response=response_text, session_id=session_id)

    except RuntimeError as exc:
        logger.error("Watson not available: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        # Catches ibm_cloud_sdk_core.api_exception.ApiException too
        code = getattr(exc, "code", 500)
        detail = getattr(exc, "message", str(exc))
        logger.error("Watson API error %s: %s", code, detail)
        raise HTTPException(status_code=code if isinstance(code, int) else 500, detail=detail)
