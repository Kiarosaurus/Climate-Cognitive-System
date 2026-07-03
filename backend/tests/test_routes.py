"""Route-level smoke tests: wiring, auth gates and RBAC — no databases required.

The TestClient is used WITHOUT its context manager on purpose: startup hooks
(Postgres retries, Mongo, model load) never run, and every assertion below is
reachable before any database query executes. Full-stack behavior is covered
by the live deployment; these tests pin the HTTP contract.
"""
import types

import pytest

# Skip cleanly in environments without the API stack (e.g. a minimal local
# venv); CI installs backend/requirements-dev.txt and runs everything.
pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

import app.dependencies as deps  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def _fake_user(role: str):
    return types.SimpleNamespace(id=1, username=f"test-{role}", role=role, status="active")


@pytest.fixture
def as_role():
    """Override auth to impersonate a role; restores the real dependency after."""
    def _impersonate(role: str):
        app.dependency_overrides[deps.get_current_user] = lambda: _fake_user(role)
    yield _impersonate
    app.dependency_overrides.clear()


def test_health_is_public_and_reports_engine():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["engine"] in ("ml", "heuristic")


@pytest.mark.parametrize("path", [
    "/api/v1/admin/users",
    "/api/v1/admin/reservations",
    "/api/v1/reports/roi",
    "/api/v1/sensors/emergencies",
])
def test_protected_routes_reject_missing_token(path):
    assert client.get(path).status_code == 401


def test_guest_cannot_list_users(as_role):
    as_role("guest")
    assert client.get("/api/v1/admin/users").status_code == 403


def test_guest_cannot_list_reservations(as_role):
    as_role("guest")
    assert client.get("/api/v1/admin/reservations").status_code == 403


def test_guest_cannot_read_roi(as_role):
    as_role("guest")
    assert client.get("/api/v1/reports/roi").status_code == 403


def test_collaborator_cannot_reload_model(as_role):
    as_role("collaborator")
    assert client.post("/api/v1/admin/model/reload").status_code == 403


def test_admin_can_reload_model(as_role):
    # No DB involved: reload_model only touches the model file on disk.
    as_role("admin")
    res = client.post("/api/v1/admin/model/reload")
    assert res.status_code == 200
    assert res.json()["engine"] in ("ml", "heuristic")


def test_sensor_ingest_rejects_wrong_api_key(monkeypatch):
    monkeypatch.setattr(deps, "WATSON_EXTENSION_KEY", "expected-key")
    res = client.post("/api/v1/sensors/", json={}, headers={"X-API-Key": "wrong"})
    assert res.status_code == 403


def test_sensor_ingest_validates_payload_when_key_matches(monkeypatch):
    monkeypatch.setattr(deps, "WATSON_EXTENSION_KEY", "expected-key")
    # Correct key but empty body → schema validation fires (422), no DB touched.
    res = client.post("/api/v1/sensors/", json={}, headers={"X-API-Key": "expected-key"})
    assert res.status_code == 422
