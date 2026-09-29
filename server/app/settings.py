"""Runtime settings. Everything comes from environment variables (never hard-code keys).

| env | default | meaning |
|-----|---------|---------|
| JJAJJA_DETECTORS | d3,commfor_224 | model detectors to load (comma list) |
| JJAJJA_ENABLE_MOCK | 0 | 1 -> also register the `mock` detector (tests/dev only) |
| JJAJJA_MOCK_SCORE | (hash) | fixed score for the mock detector |
| JJAJJA_DEVICE | cpu | cpu or cuda. cuda is honoured ONLY when CUDA_VISIBLE_DEVICES is set explicitly |
| JJAJJA_TORCH_THREADS | 8 | torch intra-op threads on CPU |
| JJAJJA_MAX_UPLOAD_MB | 50 | upload limit -> 413 file_too_large |
| JJAJJA_FETCH_ENABLED | 1 | 0 -> never call yt-dlp (rules-only, partial=true) |
| JJAJJA_FETCH_COOLDOWN_S | 1800 | after a bot-block, skip yt-dlp for this long |
| JJAJJA_URL_BUDGET_S | 40 | whole URL request (rules + download + models) must answer within this; leftovers -> partial (contract v1.2, app waits 45 s) |
| JJAJJA_UPLOAD_BUDGET_S | 110 | upload processing after the file is received (contract v1.2, app waits 120 s) |
| JJAJJA_FETCH_TIMEOUT_S | 60 | whole yt-dlp download budget (effective: min with the URL budget left) |
| JJAJJA_RULES_TIMEOUT_S | 20 | rules.extract_signals budget (effective: min with the URL budget left) |
| JJAJJA_DETECTOR_TIMEOUT_S | 120 | per-detector inference budget (effective: min with the request budget left) |
| JJAJJA_CACHE_DIR | server/.cache | result cache + temp media |
| JJAJJA_CACHE_TTL_S | 604800 | full result TTL (7 days) |
| JJAJJA_PARTIAL_TTL_S | 21600 | partial result TTL (6 hours) |
| JJAJJA_RATE_LIMIT_PER_MIN | 30 | per client IP; 0 disables |
| JJAJJA_WEIGHTS | server/config/weights.yaml | ensemble config |
| JJAJJA_FFMPEG / JJAJJA_FFPROBE | PATH lookup | ffmpeg binaries (conda env provides them) |
| JJAJJA_CORS_ORIGINS | (off) | comma list of browser origins for the web demo, e.g. http://localhost:8081 |
| JJAJJA_INNERTUBE_CLIENT_VERSION | (code default) | YouTube innertube WEB client version; read by rules/youtube.py per request (#9) |
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]


def _env_bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass
class Settings:
    detectors: list[str] = field(default_factory=lambda: ["d3", "commfor_224"])
    enable_mock: bool = False
    mock_score: float | None = None
    device: str = "cpu"
    torch_threads: int = 8
    max_upload_bytes: int = 50 * 1024 * 1024
    fetch_enabled: bool = True
    fetch_cooldown_s: float = 1800.0
    url_budget_s: float = 40.0
    upload_budget_s: float = 110.0
    fetch_timeout_s: float = 60.0
    rules_timeout_s: float = 20.0
    detector_timeout_s: float = 120.0
    cache_dir: Path = SERVER_DIR / ".cache"
    cache_ttl_s: float = 7 * 24 * 3600.0
    partial_ttl_s: float = 6 * 3600.0
    rate_limit_per_min: int = 30
    weights_path: Path = SERVER_DIR / "config" / "weights.yaml"
    ffmpeg: str | None = None
    ffprobe: str | None = None
    cors_origins: list[str] = field(default_factory=list)

    @classmethod
    def from_env(cls) -> "Settings":
        s = cls()
        raw = os.environ.get("JJAJJA_DETECTORS")
        if raw is not None:
            s.detectors = [d.strip() for d in raw.split(",") if d.strip()]
        s.enable_mock = _env_bool("JJAJJA_ENABLE_MOCK", False)
        ms = os.environ.get("JJAJJA_MOCK_SCORE")
        s.mock_score = float(ms) if ms not in (None, "") else None
        s.device = os.environ.get("JJAJJA_DEVICE", "cpu").strip().lower()
        s.torch_threads = int(_env_float("JJAJJA_TORCH_THREADS", 8))
        s.max_upload_bytes = int(_env_float("JJAJJA_MAX_UPLOAD_MB", 50) * 1024 * 1024)
        s.fetch_enabled = _env_bool("JJAJJA_FETCH_ENABLED", True)
        s.fetch_cooldown_s = _env_float("JJAJJA_FETCH_COOLDOWN_S", 1800)
        s.url_budget_s = _env_float("JJAJJA_URL_BUDGET_S", s.url_budget_s)
        s.upload_budget_s = _env_float("JJAJJA_UPLOAD_BUDGET_S", s.upload_budget_s)
        s.fetch_timeout_s = _env_float("JJAJJA_FETCH_TIMEOUT_S", 60)
        s.rules_timeout_s = _env_float("JJAJJA_RULES_TIMEOUT_S", 20)
        s.detector_timeout_s = _env_float("JJAJJA_DETECTOR_TIMEOUT_S", 120)
        if os.environ.get("JJAJJA_CACHE_DIR"):
            s.cache_dir = Path(os.environ["JJAJJA_CACHE_DIR"])
        s.cache_ttl_s = _env_float("JJAJJA_CACHE_TTL_S", s.cache_ttl_s)
        s.partial_ttl_s = _env_float("JJAJJA_PARTIAL_TTL_S", s.partial_ttl_s)
        s.rate_limit_per_min = int(_env_float("JJAJJA_RATE_LIMIT_PER_MIN", 30))
        if os.environ.get("JJAJJA_WEIGHTS"):
            s.weights_path = Path(os.environ["JJAJJA_WEIGHTS"])
        s.ffmpeg = os.environ.get("JJAJJA_FFMPEG") or None
        s.ffprobe = os.environ.get("JJAJJA_FFPROBE") or None
        s.cors_origins = [o.strip() for o in os.environ.get("JJAJJA_CORS_ORIGINS", "").split(",") if o.strip()]
        return s

    def resolved_device(self) -> str:
        """GPU only when the operator pinned CUDA_VISIBLE_DEVICES after checking owners
        (shared-server rule). Otherwise CPU."""
        if self.device.startswith("cuda"):
            if not os.environ.get("CUDA_VISIBLE_DEVICES"):
                return "cpu"
            try:
                import torch
                if torch.cuda.is_available():
                    return "cuda"
            except Exception:
                pass
            return "cpu"
        return "cpu"
