"""Contract v2.0 (#20): accounts, per-device tokens, account-level history. No network."""
from __future__ import annotations

import contextlib
import logging
import sqlite3
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.pipeline as pipeline_mod
from app.auth import AuthStore, hash_password, token_hash, verify_password
from app.main import create_app
from app.pipeline import Pipeline
from app.schemas import AuthResponse, HistoryResponse, MeResponse
from app.settings import Settings
from rules import RuleSignal
from tests.helpers import FakeFetcher, assert_contract_body, assert_error, base_settings

URL = "https://youtube.com/shorts/jzE0Rcb2hY4?si=abc"
URL2 = "https://youtube.com/shorts/AAAAAAAAAAA"
PW = "correct horse 9"
CREATOR = RuleSignal(id="yt_creator_ai_disclosure", score=0.95, weight=3.0,
                     evidence_ko="올린 사람이 유튜브에 'AI로 만든 영상'이라고 밝혔어요")


@contextlib.contextmanager
def client(tmp_path: Path, monkeypatch, fetch="blocked", **kw):
    async def fake_rules(n, http):
        return [CREATOR]

    monkeypatch.setattr(pipeline_mod, "extract_signals", fake_rules)
    kw.setdefault("auth_required", True)
    s = base_settings(tmp_path, **kw)
    with TestClient(create_app(s, Pipeline(s, fetcher=FakeFetcher(fetch)))) as c:
        yield c


def H(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def signup(c, email="Hong@Example.com", password=PW, **extra):
    return c.post("/v1/auth/signup", json={"email": email, "password": password, **extra})


def login(c, email="hong@example.com", password=PW, device="iPhone 앱"):
    return c.post("/v1/auth/login", json={"email": email, "password": password, "device_name": device})


# ---------------------------------------------------------------- signup
def test_signup_ok_normalizes_email(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        r = signup(c, email="  Hong@Example.COM ")
        assert r.status_code == 201, r.text
        j = r.json()
        AuthResponse.model_validate(j)
        assert j["user"]["email"] == "hong@example.com"
        assert j["user"]["created_at"].endswith("Z") and len(j["token"]) >= 40
        assert c.get("/v1/me", headers=H(j["token"])).status_code == 200


def test_signup_duplicate_409(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        assert signup(c).status_code == 201
        assert_error(signup(c, email="HONG@example.com "), 409, "email_taken")


@pytest.mark.parametrize("pw", ["short7!", "", None, 12345678])
def test_signup_weak_password(tmp_path, monkeypatch, pw):
    with client(tmp_path, monkeypatch) as c:
        assert_error(signup(c, password=pw), 400, "weak_password")


@pytest.mark.parametrize("email", ["hong", "hong@", "@example.com", "a b@c.com", "a@b", "", None, 5])
def test_signup_invalid_email(tmp_path, monkeypatch, email):
    with client(tmp_path, monkeypatch) as c:
        assert_error(signup(c, email=email), 400, "invalid_email")


def test_signup_bad_body(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        r = c.post("/v1/auth/signup", content=b"nope", headers={"content-type": "application/json"})
        assert_error(r, 400, "invalid_email")


# ---------------------------------------------------------------- login
def test_login_ok_and_failures_hide_email_existence(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        signup(c)
        r = login(c, email=" HONG@example.com")
        assert r.status_code == 200 and AuthResponse.model_validate(r.json())
        wrong_pw = login(c, password="wrong password")
        no_user = login(c, email="nobody@example.com")
        assert_error(wrong_pw, 401, "invalid_credentials")
        assert_error(no_user, 401, "invalid_credentials")
        assert wrong_pw.json() == no_user.json()  # same body: account existence not revealed
        assert_error(login(c, email="garbage", password=None), 401, "invalid_credentials")
        r = c.post("/v1/auth/login", content=b"[]", headers={"content-type": "application/json"})
        assert_error(r, 401, "invalid_credentials")


def test_auth_rate_limit_stricter(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, auth_rate_limit_per_min=3, rate_limit_per_min=30) as c:
        codes = [login(c, email="x@example.com").status_code for _ in range(4)]
        assert codes == [401, 401, 401, 429]
        assert_error(signup(c, email="new@example.com"), 429, "rate_limited")


# ---------------------------------------------------------------- tokens
def test_detect_requires_token(tmp_path, monkeypatch, sample_video):
    with client(tmp_path, monkeypatch) as c:
        r = c.post("/v1/detect", json={"url": URL})
        assert_error(r, 401, "unauthorized")
        assert r.headers["www-authenticate"] == "Bearer"
        with sample_video.open("rb") as f:
            r = c.post("/v1/detect", files={"file": ("a.mp4", f, "video/mp4")}, data={"source": "upload"})
        assert_error(r, 401, "unauthorized")
        assert_error(c.post("/v1/detect", json={"url": URL}, headers=H("made-up-token")), 401,
                     "unauthorized")
        assert_error(c.post("/v1/detect", json={"url": URL}, headers={"Authorization": "Basic abc"}),
                     401, "unauthorized")
        for path in ("/v1/me", "/v1/history"):
            assert_error(c.get(path), 401, "unauthorized")
        assert_error(c.post("/v1/auth/logout"), 401, "unauthorized")
        assert_error(c.delete("/v1/history/x"), 401, "unauthorized")
        assert c.get("/v1/health").status_code == 200  # public


def test_logout_revokes_only_current_token(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        signup(c)
        a = login(c, device="iPhone 앱").json()["token"]
        b = login(c, device="Chrome 확장").json()["token"]
        r = c.post("/v1/auth/logout", headers=H(a))
        assert r.status_code == 204 and r.content == b""
        assert_error(c.post("/v1/detect", json={"url": URL}, headers=H(a)), 401, "unauthorized")
        assert_error(c.get("/v1/me", headers=H(a)), 401, "unauthorized")
        assert c.post("/v1/detect", json={"url": URL}, headers=H(b)).status_code == 200


def test_expired_token_401_and_not_extended_on_use(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        store: AuthStore = c.app.state.auth
        clock = [time.time()]
        store.now = lambda: clock[0]
        tok = signup(c).json()["token"]
        clock[0] += 29 * 86400
        assert c.get("/v1/me", headers=H(tok)).status_code == 200  # use does not extend
        clock[0] += 1 * 86400 + 1
        assert_error(c.post("/v1/detect", json={"url": URL}, headers=H(tok)), 401, "unauthorized")
        assert_error(c.get("/v1/me", headers=H(tok)), 401, "unauthorized")


def test_db_holds_only_hashes(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        tok = signup(c).json()["token"]
        db_path = c.app.state.auth.path
    raw = Path(db_path).read_bytes()
    for side in Path(db_path).parent.glob(Path(db_path).name + "*"):
        raw += side.read_bytes()
    assert tok.encode() not in raw and PW.encode() not in raw
    con = sqlite3.connect(db_path)
    (th,) = con.execute("SELECT token_hash FROM devices").fetchone()
    (pw,) = con.execute("SELECT pw_hash FROM users").fetchone()
    assert th == token_hash(tok) and pw.startswith("scrypt$") and verify_password(PW, pw)


def test_password_hash_roundtrip():
    h = hash_password("abcdefgh")
    assert verify_password("abcdefgh", h) and not verify_password("abcdefgi", h)
    assert hash_password("abcdefgh") != h  # salted
    assert not verify_password("abcdefgh", "garbage")


# ---------------------------------------------------------------- multi device + history
def test_two_devices_share_history_and_me(tmp_path, monkeypatch, sample_video):
    with client(tmp_path, monkeypatch) as c:
        signup(c)
        phone = login(c, device="iPhone 앱").json()["token"]
        chrome = login(c, device="Chrome 확장").json()["token"]
        r1 = c.post("/v1/detect", json={"url": URL, "source": "share"}, headers=H(phone))
        assert r1.status_code == 200
        assert_contract_body(r1.json())  # /v1/detect body unchanged in v2.0
        r2 = c.post("/v1/detect", json={"url": URL, "source": "paste"}, headers=H(chrome))
        assert r2.json()["cached"] is True  # cache hits are recorded too
        with sample_video.open("rb") as f:
            r3 = c.post("/v1/detect", files={"file": ("a.mp4", f, "video/mp4")},
                        data={"source": "upload"}, headers=H(chrome))
        assert r3.status_code == 200
        # a failed detect is not recorded
        assert c.post("/v1/detect", json={"url": "nope"}, headers=H(phone)).status_code == 400

        hp = c.get("/v1/history", headers=H(phone)).json()
        hc = c.get("/v1/history", headers=H(chrome)).json()
        HistoryResponse.model_validate(hp)
        assert hp == hc and hp["next"] is None and len(hp["items"]) == 3
        up, second, first = hp["items"]  # newest first
        assert up["platform"] == "upload" and up["url"] is None and up["video_id"] is None
        assert up["source"] == "upload" and up["device_name"] == "Chrome 확장"
        assert second["device_name"] == "Chrome 확장" and second["source"] == "paste"
        assert first == {**first, "url": URL, "platform": "youtube", "video_id": "jzE0Rcb2hY4",
                         "verdict": "likely_ai", "ai_probability": 0.95, "source": "share",
                         "device_name": "iPhone 앱"}
        assert first["checked_at"].endswith("Z")

        me = c.get("/v1/me", headers=H(phone)).json()
        MeResponse.model_validate(me)
        names = {d["device_name"]: d["current"] for d in me["devices"]}
        # signup's own token counts as a device too
        assert names["iPhone 앱"] is True and names["Chrome 확장"] is False
        assert len(me["devices"]) == 3 and me["user"]["email"] == "hong@example.com"


def test_cannot_see_or_delete_others_history(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        a = signup(c, email="a@example.com").json()["token"]
        b = signup(c, email="b@example.com").json()["token"]
        c.post("/v1/detect", json={"url": URL}, headers=H(a))
        hid = c.get("/v1/history", headers=H(a)).json()["items"][0]["id"]
        assert c.get("/v1/history", headers=H(b)).json() == {"items": [], "next": None}
        assert_error(c.delete(f"/v1/history/{hid}", headers=H(b)), 404, "not_found")
        assert_error(c.delete("/v1/history/does-not-exist", headers=H(a)), 404, "not_found")
        assert len(c.get("/v1/history", headers=H(a)).json()["items"]) == 1
        assert c.delete(f"/v1/history/{hid}", headers=H(a)).status_code == 204
        assert c.get("/v1/history", headers=H(a)).json()["items"] == []
        assert_error(c.delete(f"/v1/history/{hid}", headers=H(a)), 404, "not_found")


def test_history_pagination(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        tok = signup(c).json()["token"]
        for i in range(7):
            vid = f"vid{i:08d}"
            assert c.post("/v1/detect", json={"url": f"https://youtube.com/shorts/{vid}"},
                          headers=H(tok)).status_code == 200
        seen, cursor, pages = [], None, 0
        while True:
            params = {"limit": 3} | ({"before": cursor} if cursor else {})
            j = c.get("/v1/history", params=params, headers=H(tok)).json()
            pages += 1
            seen += [it["video_id"] for it in j["items"]]
            cursor = j["next"]
            if cursor is None:
                break
        assert pages == 3 and seen == [f"vid{i:08d}" for i in range(6, -1, -1)]
        # limit is clamped to 1..50; junk falls back to default 20
        assert len(c.get("/v1/history", params={"limit": 0}, headers=H(tok)).json()["items"]) == 1
        assert len(c.get("/v1/history", params={"limit": 999}, headers=H(tok)).json()["items"]) == 7
        assert len(c.get("/v1/history", params={"limit": "x"}, headers=H(tok)).json()["items"]) == 7
        assert c.get("/v1/history", params={"before": "!!bad"}, headers=H(tok)).json() == \
            {"items": [], "next": None}


# ---------------------------------------------------------------- AUTH_REQUIRED=0
def test_auth_not_required_mode(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, auth_required=False) as c:
        r = c.post("/v1/detect", json={"url": URL})
        assert r.status_code == 200
        assert_contract_body(r.json())
        tok = signup(c).json()["token"]
        assert c.get("/v1/history", headers=H(tok)).json()["items"] == []  # token-less: no record
        # a valid token is still honoured (recorded); a bad one is still 401
        assert c.post("/v1/detect", json={"url": URL}, headers=H(tok)).status_code == 200
        assert len(c.get("/v1/history", headers=H(tok)).json()["items"]) == 1
        assert_error(c.post("/v1/detect", json={"url": URL}, headers=H("bogus")), 401, "unauthorized")
        assert_error(c.get("/v1/me"), 401, "unauthorized")  # account endpoints always need a token


def test_settings_env(monkeypatch, tmp_path):
    for k in ("JJAJJA_AUTH_REQUIRED", "JJAJJA_AUTH_DB", "JJAJJA_TOKEN_TTL_DAYS"):
        monkeypatch.delenv(k, raising=False)
    s = Settings.from_env()
    assert s.auth_required is True and s.token_ttl_s == 30 * 86400
    assert s.auth_db_path() == Path(s.cache_dir) / "auth.sqlite3"
    monkeypatch.setenv("JJAJJA_AUTH_REQUIRED", "0")
    monkeypatch.setenv("JJAJJA_AUTH_DB", str(tmp_path / "x.db"))
    s = Settings.from_env()
    assert s.auth_required is False and s.auth_db_path() == tmp_path / "x.db"


# ---------------------------------------------------------------- secrets never leak
def test_password_and_token_not_in_logs_or_responses(tmp_path, monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    with client(tmp_path, monkeypatch, debug=True) as c:
        tok0 = signup(c).json()["token"]
        assert_error(signup(c), 409, "email_taken")
        r = login(c)
        tok = r.json()["token"]
        login(c, password="wrong password!")
        bodies = []
        for resp in (c.post("/v1/detect", json={"url": URL}, headers=H(tok)),
                     c.post("/v1/detect", json={"url": URL2}, headers=H(tok)),
                     c.get("/v1/me", headers=H(tok)),
                     c.get("/v1/history", headers=H(tok)),
                     c.post("/v1/detect", json={"url": URL}, headers=H("x" + tok))):
            bodies.append(resp.text)
        c.post("/v1/auth/logout", headers=H(tok))
    text = caplog.text + "".join(bodies)
    for secret in (PW, "wrong password!", tok, tok0):
        assert secret not in text
    assert "debug" in bodies[0]  # dev-mode detect body carried debug, still without the token


def test_cors_allows_authorization_and_delete(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch, cors_origins=["http://localhost:8081"]) as c:
        r = c.options("/v1/history/abc", headers={
            "Origin": "http://localhost:8081", "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "authorization"})
    assert r.status_code == 200, r.text
    assert "authorization" in r.headers["access-control-allow-headers"].lower()
    assert "DELETE" in r.headers["access-control-allow-methods"]
