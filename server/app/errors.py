"""Contract error responses: `{ "error": { "code", "message_ko" } }`.

Messages follow senior-ux-korean's error table (plain 해요체, no blame).
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)

ERRORS: dict[str, tuple[int, str]] = {
    "invalid_url": (400, "영상 주소가 아닌 것 같아요. 유튜브에서 '공유 → 링크 복사'를 눌러 다시 붙여넣어 주세요"),
    "invalid_file": (400, "이 영상 파일은 열 수 없어요. 휴대폰에 저장된 다른 영상을 골라 다시 확인해 주세요"),
    "unsupported_platform": (422, "아직 이 사이트의 영상은 확인할 수 없어요. 지금은 유튜브 쇼츠를 확인할 수 있어요"),
    "video_unavailable": (404, "영상을 열 수 없어요. 삭제되었거나 비공개 영상일 수 있어요"),
    "file_too_large": (413, "영상이 너무 크거나 길어요. 3분 이내의 짧은 영상을 골라 주세요"),
    "rate_limited": (429, "잠시 후 다시 시도해 주세요"),
    "detectors_down": (503, "지금은 확인이 어려워요. 잠시 후 다시 시도해 주세요"),
}


class ApiError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.status, self.message_ko = ERRORS[code]
        self.detail = detail  # server log only


def error_response(code: str) -> JSONResponse:
    status, msg = ERRORS[code]
    return JSONResponse(status_code=status, content={"error": {"code": code, "message_ko": msg}})


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        if exc.detail:
            log.info("api error %s (%s)", exc.code, exc.detail)
        return error_response(exc.code)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        return error_response("invalid_url")

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        if exc.status_code == 413:
            return error_response("file_too_large")
        if exc.status_code == 429:
            return error_response("rate_limited")
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        # Never leak internals; the app treats this like "detectors down".
        log.exception("unhandled error")
        return error_response("detectors_down")
