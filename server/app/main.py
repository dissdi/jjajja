"""FastAPI entrypoint.  Run:  cd server && uvicorn app.main:app --port 8000

Endpoints (contract: .claude/skills/detect-api-contract/SKILL.md, v2.0):
  GET    /v1/health                       (public)
  POST   /v1/auth/signup | /v1/auth/login (public, stricter per-IP rate limit)
  POST   /v1/auth/logout                  (Bearer)
  GET    /v1/me                           (Bearer)
  GET    /v1/history?limit=&before=       (Bearer)
  DELETE /v1/history/{id}                 (Bearer)
  POST   /v1/detect   JSON {url, source}  |  multipart file=<video> source=upload
                      Bearer required unless JJAJJA_AUTH_REQUIRED=0; each 200 is recorded in history
Tokens and passwords are never logged (see app/auth.py).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .auth import AuthError, AuthStore, Session
from .errors import ApiError, install_handlers
from .pipeline import MAX_DURATION_S, Pipeline
from .ratelimit import RateLimiter
from .schemas import (AuthResponse, DetectResponse, DetectUrlRequest, ErrorResponse,
                      HealthResponse, HistoryResponse, MeResponse)
from .settings import Settings

log = logging.getLogger("jjajja")
CHUNK = 1024 * 1024


def create_app(settings: Optional[Settings] = None, pipeline: Optional[Pipeline] = None) -> FastAPI:
    settings = settings or Settings.from_env()
    if settings.device == "cpu":
        try:
            import torch
            torch.set_num_threads(max(1, settings.torch_threads))
        except Exception:
            pass

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        pipe = pipeline or Pipeline(settings)
        await pipe.start()
        app.state.pipeline = pipe
        app.state.auth = AuthStore(settings.auth_db_path(), token_ttl_s=settings.token_ttl_s)
        log.info("detectors: %s (device=%s)", pipe.registry.health(), pipe.registry.device)
        if not settings.auth_required:
            log.warning("JJAJJA_AUTH_REQUIRED=0: /v1/detect accepts requests without a token")
        yield
        await pipe.stop()
        app.state.auth.close()

    app = FastAPI(title="jjajja detect API", version="2.0", lifespan=lifespan)
    install_handlers(app)
    if settings.cors_origins:  # web demo only (Expo web on another port); apps don't need CORS
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                           allow_methods=["GET", "POST", "DELETE"],
                           allow_headers=["Authorization", "Content-Type"])
    limiter = RateLimiter(settings.rate_limit_per_min)
    auth_limiter = RateLimiter(settings.auth_rate_limit_per_min)  # signup + login, per IP
    errs = {c: {"model": ErrorResponse} for c in (400, 401, 404, 413, 422, 429, 503)}
    auth_errs = {c: {"model": ErrorResponse} for c in (400, 401, 409, 429)}

    def store(request: Request) -> AuthStore:
        return request.app.state.auth

    def session(request: Request, required: bool = True) -> Optional[Session]:
        """Bearer token -> Session. No header and not required -> None. A token that is present
        but invalid/expired/revoked is always 401 (never silently ignored)."""
        token = _bearer(request)
        if token is None and not required:
            return None
        try:
            return store(request).authenticate(token)
        except AuthError as e:
            raise ApiError(e.code)

    async def json_body(request: Request) -> dict:
        try:
            payload = json.loads(await request.body() or b"null")
        except ValueError:
            return {}
        return payload if isinstance(payload, dict) else {}

    async def account(request: Request, fn) -> tuple[str, dict]:
        if not auth_limiter.allow(_client(request)):
            raise ApiError("rate_limited", "auth")
        p = await json_body(request)
        try:  # scrypt is CPU-bound: keep it off the event loop
            return await asyncio.to_thread(fn, p.get("email"), p.get("password"),
                                           p.get("device_name"))
        except AuthError as e:
            raise ApiError(e.code)

    # ------------------------------------------------------------ public
    @app.get("/v1/health", response_model=HealthResponse, response_model_exclude_none=True)
    async def health(request: Request):
        pipe: Pipeline = request.app.state.pipeline
        return HealthResponse(
            detectors=pipe.registry.health(),
            limits={"max_upload_mb": round(settings.max_upload_bytes / (1024 * 1024), 1),
                    "max_duration_s": MAX_DURATION_S})

    # ------------------------------------------------------------ accounts (v2.0, #20)
    @app.post("/v1/auth/signup", status_code=201, response_model=AuthResponse, responses=auth_errs)
    async def signup(request: Request):
        token, user = await account(request, store(request).signup)
        log.info("signup user=%s", user["id"])
        return JSONResponse(status_code=201, content={"token": token, "user": user})

    @app.post("/v1/auth/login", response_model=AuthResponse, responses=auth_errs)
    async def login(request: Request):
        token, user = await account(request, store(request).login)
        log.info("login user=%s", user["id"])
        return {"token": token, "user": user}

    @app.post("/v1/auth/logout", status_code=204, responses=auth_errs)
    async def logout(request: Request):
        store(request).logout(session(request))
        return Response(status_code=204)

    @app.get("/v1/me", response_model=MeResponse, responses=auth_errs)
    async def me(request: Request):
        return store(request).me(session(request))

    @app.get("/v1/history", response_model=HistoryResponse, responses=auth_errs)
    async def history(request: Request):
        sess = session(request)
        q = request.query_params
        return store(request).list_history(sess, q.get("limit"), q.get("before"))

    @app.delete("/v1/history/{history_id}", status_code=204, responses=errs)
    async def delete_history(history_id: str, request: Request):
        sess = session(request)
        try:
            store(request).delete_history(sess, history_id)
        except AuthError as e:
            raise ApiError(e.code)
        return Response(status_code=204)

    # ------------------------------------------------------------ detect
    @app.post("/v1/detect", response_model=DetectResponse, responses=errs)
    async def detect(request: Request):
        sess = session(request, required=settings.auth_required)  # 401 before any work
        client = _client(request)
        if not limiter.allow(client):
            raise ApiError("rate_limited", client)
        pipe: Pipeline = request.app.state.pipeline
        ctype = request.headers.get("content-type", "").lower()

        if ctype.startswith("multipart/form-data"):
            body, source = await _detect_upload(request, pipe, settings)
            url = None  # uploads: no address, and the file itself is never stored
        else:
            try:
                payload = json.loads(await request.body() or b"null")
                req = DetectUrlRequest.model_validate(payload)
            except (ValueError, ValidationError):
                raise ApiError("invalid_url", "body is not {url: string}")
            body = await pipe.detect_url(req.url)
            source, url = req.source, req.url
            log.info("detect url source=%s verdict=%s p=%s partial=%s cached=%s", req.source,
                     body["verdict"], body["ai_probability"], body["partial"], body["cached"])
        resp = _out(body)  # validated first: only real 200 answers become history
        if sess is not None:  # token-less (AUTH_REQUIRED=0) checks are not recorded
            try:
                store(request).add_history(sess, body, source, url)
            except Exception:  # history is a convenience; never fail the answer over it
                log.warning("history write failed", exc_info=True)
        return resp

    return app


def _client(request: Request) -> str:
    return request.client.host if request.client else "?"


def _bearer(request: Request) -> Optional[str]:
    scheme, _, token = request.headers.get("authorization", "").strip().partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def _out(body: dict) -> JSONResponse:
    """Validate against the contract model, then drop `signals[].debug` when it is null.
    Only that key is removed (contract v1.3: omitted outside dev mode); every other null
    (present, score, video_id, ai_probability) is kept as the contract requires."""
    d = DetectResponse.model_validate(body).model_dump(mode="json")
    for s in d["signals"]:
        if s.get("debug") is None:
            s.pop("debug", None)
    return JSONResponse(d)


async def _detect_upload(request: Request, pipe: Pipeline, settings: Settings) -> tuple[dict, str]:
    limit = settings.max_upload_bytes
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > limit + 64 * 1024:  # multipart overhead margin
        raise ApiError("file_too_large", f"content-length {cl}")
    form = await request.form(max_files=1, max_fields=10)
    up = form.get("file")
    if up is None or isinstance(up, str):
        raise ApiError("invalid_file", "multipart without `file`")
    src = form.get("source")
    source = src if isinstance(src, str) else "upload"
    work = Path(tempfile.mkdtemp(prefix="up_", dir=pipe.tmp_root))
    try:
        dst = work / "upload.bin"
        h, size = hashlib.sha256(), 0
        with dst.open("wb") as f:
            while chunk := await up.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise ApiError("file_too_large", f"{size} bytes")
                h.update(chunk)
                f.write(chunk)
        await up.close()
        if size == 0:
            raise ApiError("invalid_file", "empty upload")
        body = await pipe.detect_upload(dst, h.hexdigest())
    finally:
        await form.close()
        shutil.rmtree(work, ignore_errors=True)
    log.info("detect upload %d bytes verdict=%s p=%s cached=%s", size, body["verdict"],
             body["ai_probability"], body["cached"])
    return body, source


logging.basicConfig(level=os.environ.get("JJAJJA_LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
app = create_app()  # uvicorn app.main:app
