import logging
from starlette.concurrency import run_in_threadpool
from app.config import WATSON_API_KEY, WATSON_URL, WATSON_ASSISTANT_ID

logger = logging.getLogger(__name__)

_client = None  # AssistantV2 singleton


def init_watson() -> None:
    global _client
    if not all([WATSON_API_KEY, WATSON_URL, WATSON_ASSISTANT_ID]):
        logger.warning(
            "Watson credentials incomplete — chat endpoint will return 503. "
            "Set WATSON_API_KEY, WATSON_URL, WATSON_ASSISTANT_ID env vars."
        )
        return
    try:
        from ibm_watson import AssistantV2
        from ibm_cloud_sdk_core.authenticators import IAMAuthenticator

        authenticator = IAMAuthenticator(WATSON_API_KEY)
        _client = AssistantV2(version="2021-11-27", authenticator=authenticator)
        _client.set_service_url(WATSON_URL)
        logger.info("Watson AssistantV2 client initialized (url=%s).", WATSON_URL)
    except Exception as exc:
        logger.error("Failed to initialize Watson client: %s", exc)


# ── sync helpers (run in threadpool) ─────────────────────────────────────────

def _create_session_sync() -> str:
    result = _client.create_session(
        assistant_id=WATSON_ASSISTANT_ID,
        environment_id=WATSON_ASSISTANT_ID,
    ).get_result()
    return result["session_id"]


def _send_message_sync(session_id: str, text: str, skill_variables: dict | None = None) -> str:
    kwargs: dict = {}
    if skill_variables:
        # Actions read these as session variables (must exist with the SAME
        # names in the actions skill). This is how the logged-in user's JWT
        # reaches extension callouts: the action binds the Authorization
        # header to the `jwt` variable, and the backend then enforces the
        # exact same RBAC as the web UI — Watson adds no authority of its own.
        kwargs["context"] = {
            "skills": {"actions skill": {"skill_variables": skill_variables}}
        }
    response = _client.message(
        assistant_id=WATSON_ASSISTANT_ID,
        environment_id=WATSON_ASSISTANT_ID,
        session_id=session_id,
        input={"message_type": "text", "text": text},
        user_id=(skill_variables or {}).get("username") or "ccs_anonymous",
        **kwargs,
    ).get_result()

    # ANTES: solo miraba generics[0] — si Watson mandaba cualquier otra cosa
    # (pausa, opciones, etc.) antes del texto, se perdía la respuesta real
    # aunque la action sí la hubiera calculado bien.
    # AHORA: junta TODOS los fragmentos de tipo "text" del turno, sin importar
    # en qué posición vengan.
    generics = response.get("output", {}).get("generic", [])
    texts = [g.get("text") for g in generics if g.get("response_type") == "text" and g.get("text")]
    if texts:
        return "\n".join(texts)
    return "No hubo respuesta de Watson."


# ── public async API ──────────────────────────────────────────────────────────

async def create_session() -> str:
    if _client is None:
        raise RuntimeError("Watson client not initialized. Check Watson env vars.")
    return await run_in_threadpool(_create_session_sync)


async def send_message(session_id: str, text: str, skill_variables: dict | None = None) -> str:
    if _client is None:
        raise RuntimeError("Watson client not initialized. Check Watson env vars.")
    return await run_in_threadpool(_send_message_sync, session_id, text, skill_variables)
