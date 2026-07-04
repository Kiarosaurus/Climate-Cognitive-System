"""
Generate a Watson-compatible OpenAPI 3.0.0 spec from the FastAPI app.

Usage (run from project root):
  python generate_openapi.py [--server https://your-ngrok-url.ngrok-free.app]

Output: openapi_watson.json
"""

import sys
import os
import json
import argparse

# Allow importing the backend package from the project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

# Minimal env vars so config.py doesn't crash at import
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017")
os.environ.setdefault("POSTGRES_URI", "postgresql://postgres:postgres@localhost:5432/climate_db")
os.environ.setdefault("WATSON_API_KEY", "")
os.environ.setdefault("WATSON_URL", "")
os.environ.setdefault("WATSON_ASSISTANT_ID", "")
os.environ.setdefault("WATSON_EXTENSION_KEY", "")

from app.main import app  # noqa: E402  (must come after sys.path patch)


# ── OpenAPI 3.1 → 3.0 conversion ─────────────────────────────────────────────

def _walk(obj):
    """Recursively transform a schema object for 3.0.0 compatibility."""
    if isinstance(obj, list):
        return [_walk(item) for item in obj]
    if not isinstance(obj, dict):
        return obj

    # anyOf with a null branch  →  nullable: true  (3.0 style)
    if "anyOf" in obj:
        non_null = [s for s in obj["anyOf"] if s != {"type": "null"} and s.get("type") != "null"]
        has_null = len(non_null) < len(obj["anyOf"])
        if has_null:
            rest = {k: v for k, v in obj.items() if k != "anyOf"}
            if len(non_null) == 1:
                # Watson requires a $ref to appear ALONE — no sibling keys (nullable,
                # title, etc.) or its strict importer rejects the whole schema
                # ("must NOT have additional properties" / "must match oneOf").
                # Optionality is already conveyed by the field being absent from
                # the parent's "required" list, so just drop nullable here.
                if "$ref" in non_null[0]:
                    return _walk(non_null[0])
                merged = {**non_null[0], **rest, "nullable": True}
                return _walk(merged)
            else:
                return _walk({**rest, "anyOf": non_null, "nullable": True})

    # prefixItems (JSON Schema 2020-12 tuple) → items array (3.0)
    if "prefixItems" in obj:
        obj = dict(obj)
        obj["items"] = obj.pop("prefixItems")

    # const → enum single value
    if "const" in obj:
        obj = dict(obj)
        obj["enum"] = [obj.pop("const")]

    # examples array → first value as example (3.0 uses singular)
    if "examples" in obj and isinstance(obj["examples"], list) and obj["examples"]:
        obj = dict(obj)
        obj.setdefault("example", obj["examples"][0])
        del obj["examples"]

    return {k: _walk(v) for k, v in obj.items()}


def downgrade_to_30(spec: dict) -> dict:
    spec = _walk(spec)
    spec["openapi"] = "3.0.0"
    return spec


# ── operationId enforcement ───────────────────────────────────────────────────

def ensure_operation_ids(spec: dict) -> dict:
    seen: set[str] = set()
    for path, methods in spec.get("paths", {}).items():
        for method, op in methods.items():
            if not isinstance(op, dict):
                continue
            if not op.get("operationId"):
                base = f"{method}_{path.replace('/', '_').strip('_')}"
                op["operationId"] = base
            oid = op["operationId"]
            if oid in seen:
                # deduplicate
                op["operationId"] = f"{oid}_{method}"
            seen.add(op["operationId"])
    return spec

# ── Watson strict sanitization ───────────────────────────────────────────────

def sanitize_fastapi_errors_for_watson(spec: dict) -> dict:
    """
    Watson completely rejects anyOf, oneOf, and allOf.
    FastAPI uses anyOf in its default ValidationError schema for the 'loc' array.
    We overwrite it with a simplified version.
    """
    schemas = spec.get("components", {}).get("schemas", {})
    
    if "ValidationError" in schemas:
        schemas["ValidationError"] = {
            "title": "ValidationError",
            "required": ["loc", "msg", "type"],
            "type": "object",
            "properties": {
                "loc": {
                    "title": "Location",
                    "type": "array",
                    "items": {"type": "string"}  # Simplificado: Watson solo verá strings
                },
                "msg": {"title": "Message", "type": "string"},
                "type": {"title": "Error Type", "type": "string"}
            }
        }
    return spec

# ── Custom Parameter Injection ───────────────────────────────────────────────

def inject_missing_parameters(spec: dict) -> dict:
    """
    Inyecta parámetros requeridos para Watson que no se exponen 
    automáticamente en la especificación de FastAPI.
    """
    paths = spec.get("paths", {})
    
    # Buscamos la ruta y el método específico
    sensors_path = paths.get("/api/v1/sensors/", {})
    get_operation = sensors_path.get("get")
    
    if get_operation:
        # Si no existe el bloque "parameters", lo creamos como una lista vacía
        if "parameters" not in get_operation:
            get_operation["parameters"] = []
            
        # Verificamos que no exista ya para no duplicarlo al volver a correr el script
        has_sensor_id = any(p.get("name") == "sensor_id" for p in get_operation["parameters"])
        
        if not has_sensor_id:
            get_operation["parameters"].append({
                "name": "sensor_id",
                "in": "query",
                "description": "ID del sensor o aula a consultar",
                "required": True,
                "schema": {
                    "type": "string"
                }
            })
            
    return spec

# ── Authorization header for Watson actions (JWT passthrough) ────────────────

def inject_authorization_header(spec: dict) -> dict:
    """Expose the Bearer JWT as an EXPLICIT header parameter on every
    JWT-protected operation.

    Watson's extension auth is a static X-API-Key; it cannot carry a per-user
    token. Actions instead bind this header to the `jwt` session variable
    (populated by POST /chat from the logged-in widget user), so CRUD callouts
    reach the API as that user and the backend enforces its normal RBAC.
    FastAPI only advertises the scheme in `security` — Watson can't bind that,
    hence the explicit parameter. Idempotent across re-runs.
    """
    for path, methods in spec.get("paths", {}).items():
        for method, op in methods.items():
            if not isinstance(op, dict):
                continue
            needs_jwt = any("OAuth2PasswordBearer" in sec for sec in op.get("security", []))
            if not needs_jwt:
                continue
            params = op.setdefault("parameters", [])
            if any(p.get("name") == "Authorization" and p.get("in") == "header" for p in params):
                continue
            params.append({
                "name": "Authorization",
                "in": "header",
                "description": (
                    "Bearer JWT del usuario. En Watson: 'Bearer ' + session "
                    "variable jwt (la llena POST /chat con el token del widget)."
                ),
                "required": False,
                "schema": {"type": "string"},
            })
    return spec


# ── Inline $ref used as a plain object property ───────────────────────────────

def inline_object_property_refs(spec: dict) -> dict:
    """Watson's importer rejects a bare $ref used as an object PROPERTY's schema
    (e.g. SensorReadingOut.properties.cognitive_action = {"$ref": "...CognitiveActionOut"})
    with "must NOT have additional properties" / "must match oneOf" — even though
    the identical $ref works fine inside an array's "items" or as a top-level
    request/response body schema. Inline those specific refs (copy the target
    schema directly into the property) so nested Pydantic models still work.
    """
    import copy

    schemas = spec.get("components", {}).get("schemas", {})

    for schema in schemas.values():
        props = schema.get("properties")
        if not isinstance(props, dict):
            continue
        for key, val in list(props.items()):
            if isinstance(val, dict) and set(val.keys()) == {"$ref"}:
                target_name = val["$ref"].rsplit("/", 1)[-1]
                target = schemas.get(target_name)
                if target is not None:
                    props[key] = copy.deepcopy(target)
    return spec


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate Watson-compatible openapi_watson.json")
    parser.add_argument(
        "--server",
        default="https://ccs-demo.ngrok-free.app",
        help="Base server URL (ngrok or production). Default: https://ccs-demo.ngrok-free.app",
    )
    parser.add_argument(
        "--out",
        default="openapi_watson.json",
        help="Output file name. Default: openapi_watson.json",
    )
    args = parser.parse_args()

    print("Generating OpenAPI schema from FastAPI app...")
    spec = app.openapi()

    original_version = spec.get("openapi", "unknown")
    print(f"  Original version : {original_version}")

    spec = downgrade_to_30(spec)
    print(f"  Downgraded to    : {spec['openapi']}")

    spec = ensure_operation_ids(spec)
    spec = sanitize_fastapi_errors_for_watson(spec)
    
    # Aplicamos la inyección de los parámetros faltantes
    spec = inject_missing_parameters(spec)
    spec = inject_authorization_header(spec)
    spec = inline_object_property_refs(spec)

    spec["servers"] = [{"url": args.server}]
    print(f"  Server URL       : {args.server}")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2, ensure_ascii=False)

    paths = list(spec.get("paths", {}).keys())
    print(f"\nEndpoints included ({len(paths)}):")
    for p in paths:
        print(f"  {p}")

    print(f"\nSaved → {args.out}")
    print("\nNext steps:")
    print("  1. Start ngrok:  ngrok http 8000")
    print("  2. Re-run:       python generate_openapi.py --server https://<your-id>.ngrok-free.app")
    print("  3. Import openapi_watson.json into Watson Assistant → Integrations → Custom Extension")


if __name__ == "__main__":
    main()