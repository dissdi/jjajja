"""ffmpeg-based probing and frame sampling.

Two frame sets are produced, both center-square-cropped (vertical shorts carry captions/stickers
at top/bottom that confuse image detectors) and scaled to 256x256:
  * `frames`      : N frames spread uniformly over the whole video (frame-level detectors)
  * `clip_frames` : consecutive frames at `clip_fps` from a window in the middle (temporal / D3)
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

CROP_SCALE = "crop='min(iw,ih)':'min(iw,ih)',scale=256:256:flags=bicubic"


class MediaError(Exception):
    """File is not a decodable video."""


def _which(name: str) -> Optional[str]:
    # conda env bin (python invoked directly without `conda activate`) first, then PATH
    local = Path(sys.executable).parent / name
    return str(local) if local.exists() else shutil.which(name)


def find_ffmpeg(override: Optional[str] = None) -> str:
    if override:
        return override
    exe = _which("ffmpeg")
    if exe:
        return exe
    try:  # optional fallback when no system/conda ffmpeg
        import imageio_ffmpeg  # type: ignore
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:  # pragma: no cover
        raise RuntimeError("ffmpeg not found (install conda ffmpeg or set JJAJJA_FFMPEG)") from e


def find_ffprobe(override: Optional[str] = None) -> Optional[str]:
    return override or _which("ffprobe")


@dataclass
class ProbeInfo:
    duration: float
    width: int
    height: int
    has_audio: bool


_DUR_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")
_VID_RE = re.compile(r"Stream #.*Video:.*?(\d{2,5})x(\d{2,5})")


def probe(path: Path, ffmpeg: str, ffprobe: Optional[str] = None, timeout: float = 30) -> ProbeInfo:
    if ffprobe:
        r = subprocess.run([ffprobe, "-v", "error", "-show_entries",
                            "format=duration:stream=codec_type,width,height,duration",
                            "-of", "json", str(path)], capture_output=True, text=True, timeout=timeout)
        if r.returncode != 0:
            raise MediaError(r.stderr.strip()[:300] or "ffprobe failed")
        info = json.loads(r.stdout or "{}")
        streams = info.get("streams", [])
        v = next((s for s in streams if s.get("codec_type") == "video"), None)
        if not v or not v.get("width"):
            raise MediaError("no video stream")
        dur = info.get("format", {}).get("duration") or v.get("duration")
        try:
            duration = float(dur)
        except (TypeError, ValueError):
            duration = 0.0
        return ProbeInfo(duration, int(v["width"]), int(v["height"]),
                         any(s.get("codec_type") == "audio" for s in streams))
    r = subprocess.run([ffmpeg, "-hide_banner", "-i", str(path)], capture_output=True, text=True,
                       timeout=timeout)
    err = r.stderr
    vm = _VID_RE.search(err)
    if not vm:
        raise MediaError("no video stream")
    dm = _DUR_RE.search(err)
    duration = (int(dm.group(1)) * 3600 + int(dm.group(2)) * 60 + float(dm.group(3))) if dm else 0.0
    return ProbeInfo(duration, int(vm.group(1)), int(vm.group(2)), "Audio:" in err)


def _run(cmd: list[str], timeout: float) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise MediaError(r.stderr.strip()[-300:] or "ffmpeg failed")


def sample_uniform(path: Path, out_dir: Path, n: int, duration: float, ffmpeg: str,
                   timeout: float = 120) -> list[Path]:
    """n frames at the centres of n equal slices of the video."""
    out_dir.mkdir(parents=True, exist_ok=True)
    if duration <= 0:
        duration = 1.0
    rate = n / duration
    _run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
          "-vf", f"fps={rate:.6f}:start_time=0:round=near,{CROP_SCALE}",
          "-frames:v", str(n), "-q:v", "2", str(out_dir / "u_%03d.png")], timeout)
    frames = sorted(out_dir.glob("u_*.png"))
    if not frames:
        # very short / odd timestamps: grab the first frame at least
        _run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
              "-vf", CROP_SCALE, "-frames:v", "1", str(out_dir / "u_001.png")], timeout)
        frames = sorted(out_dir.glob("u_*.png"))
    return frames


def sample_clip(path: Path, out_dir: Path, n: int, fps: float, duration: float, ffmpeg: str,
                timeout: float = 120) -> list[Path]:
    """n consecutive frames at `fps`, from a window centred in the video (D3 protocol: 8fps)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    win = n / fps + 0.25
    start = max(0.0, duration / 2 - win / 2) if duration > win else 0.0
    _run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-t", f"{win:.3f}",
          "-i", str(path), "-vf", f"fps={fps},{CROP_SCALE}", "-frames:v", str(n),
          str(out_dir / "c_%03d.png")], timeout)
    return sorted(out_dir.glob("c_*.png"))
