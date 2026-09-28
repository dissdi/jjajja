"""Pydantic models that mirror .claude/skills/detect-api-contract/SKILL.md (v1.2).

Do not add/rename fields here without updating the contract first.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Platform = Literal["youtube", "tiktok", "instagram", "unknown", "upload"]
Verdict = Literal["likely_ai", "uncertain", "likely_real", "unknown"]
Source = Literal["paste", "share", "clipboard", "upload"]
PLATFORMS = {"youtube", "tiktok", "instagram", "unknown", "upload"}


class DetectUrlRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    url: str
    source: Optional[str] = "paste"  # analytics only; unknown values are tolerated


class Signal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["rule", "model"]
    status: Literal["ok", "error", "unavailable"]
    decisive: bool = False
    score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    weight: float = Field(default=1.0, ge=0.0)
    evidence_ko: str = ""
    via: Literal["api", "oembed", "html", "model"]
    # v1.2 (#2): rule signals only -- mark found (true) / looked, not found (false) / not checked
    # (null, whenever status != "ok"). Model signals are always null. Always serialized.
    present: Optional[bool] = None


class DetectResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str
    platform: Platform
    video_id: Optional[str]
    ai_probability: Optional[float] = Field(ge=0.0, le=1.0)
    verdict: Verdict
    partial: bool
    signals: list[Signal]
    cached: bool
    analyzed_at: str  # ISO-8601 UTC, e.g. 2026-09-28T12:00:00Z


class Limits(BaseModel):
    max_upload_mb: float
    max_duration_s: float


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    detectors: dict[str, Literal["ok", "down"]]
    limits: Optional[Limits] = None  # v1.1 (additive)


class ErrorBody(BaseModel):
    code: Literal["invalid_url", "unsupported_platform", "video_unavailable",
                  "file_too_large", "rate_limited", "detectors_down", "invalid_file"]
    message_ko: str


class ErrorResponse(BaseModel):
    error: ErrorBody
