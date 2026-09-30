"""FastAPI entrypoint.  Run:  cd server && uvicorn app.main:app --port 8000

Endpoints (contract: .claude/skills/detect-api-contract/SKILL.md):
  GET  /v1/health
  POST /v1/detect   JSON {url, source}  |  multipart file=<video> source=upload
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .errors import ApiError, install_handlers
from .pipeline import MAX_DURATION_S, Pipeline
from .ratelimit import RateLimiter
from .schemas import DetectResponse, DetectUrlRequest, ErrorResponse, HealthResponse
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
        log.info("detectors: %s (device=%s)", pipe.registry.health(), pipe.registry.device)
        yield
        await pipe.stop()

    app = FastAPI(title="jjajja detect API", version="1.3", lifespan=lifespan)
    install_handlers(app)
    if settings.cors_origins:  # web demo only (Expo web on another port); apps don't need CORS
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                           allow_methods=["GET", "POST"], allow_headers=["*"])
    limiter = RateLimiter(settings.rate_limit_per_min)
    errs = {c: {"model": ErrorResponse} for c in (400, 404, 413, 422, 429, 503)}

    @app.get("/v1/health", response_model=HealthResponse, response_model_exclude_none=True)
    async def health(request: Request):
        pipe: Pipeline = request.app.state.pipeline
        return HealthResponse(
            detectors=pipe.registry.health(),
            limits={"max_upload_mb": round(settings.max_upload_bytes / (1024 * 1024), 1),
                    "max_duration_s": MAX_DURATION_S})

    @app.post("/v1/detect", response_model=DetectResponse, responses=errs)
    async def detect(request: Request):
        client = request.client.host if request.client else "?"
        if not limiter.allow(client):
            raise ApiError("rate_limited", client)
        pipe: Pipeline = request.app.state.pipeline
        ctype = request.headers.get("content-type", "").lower()

        if ctype.startswith("multipart/form-data"):
            return await _detect_upload(request, pipe, settings)

        try:
            payload = json.loads(await request.body() or b"null")
            req = DetectUrlRequest.model_validate(payload)
        except (ValueError, ValidationError):
            raise ApiError("invalid_url", "body is not {url: string}")
        body = await pipe.detect_url(req.url)
        log.info("detect url source=%s verdict=%s p=%s partial=%s cached=%s", req.source,
                 body["verdict"], body["ai_probability"], body["partial"], body["cached"])
        return _out(body)

    return app


def _out(body: dict) -> JSONResponse:
    """Validate against the contract model, then drop `signals[].debug` when it is null.
    Only that key is removed (contract v1.3: omitted outside dev mode); every other null
    (present, score, video_id, ai_probability) is kept as the contract requires."""
    d = DetectResponse.model_validate(body).model_dump(mode="json")
    for s in d["signals"]:
        if s.get("debug") is None:
            s.pop("debug", None)
    return JSONResponse(d)


async def _detect_upload(request: Request, pipe: Pipeline, settings: Settings) -> JSONResponse:
    limit = settings.max_upload_bytes
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > limit + 64 * 1024:  # multipart overhead margin
        raise ApiError("file_too_large", f"content-length {cl}")
    form = await request.form(max_files=1, max_fields=10)
    up = form.get("file")
    if up is None or isinstance(up, str):
        raise ApiError("invalid_file", "multipart without `file`")
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
    return _out(body)


logging.basicConfig(level=os.environ.get("JJAJJA_LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
app = create_app()  # uvicorn app.main:app
