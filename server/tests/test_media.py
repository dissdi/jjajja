from pathlib import Path

from PIL import Image

from media.fetch import Fetcher, classify_error
from media.ffmpeg import find_ffmpeg, find_ffprobe, probe, sample_clip, sample_uniform


def test_probe_and_sampling(sample_video, tmp_path):
    ff, fp = find_ffmpeg(), find_ffprobe()
    info = probe(sample_video, ff, fp)
    assert (info.width, info.height) == (360, 640) and 3.5 < info.duration < 4.5 and info.has_audio
    info2 = probe(sample_video, ff, None)  # ffmpeg-stderr fallback
    assert (info2.width, info2.height) == (360, 640)
    u = sample_uniform(sample_video, tmp_path / "u", 16, info.duration, ff)
    c = sample_clip(sample_video, tmp_path / "c", 16, 8, info.duration, ff)
    assert len(u) == 16 and len(c) == 16
    assert Image.open(u[0]).size == (256, 256) and Image.open(c[-1]).size == (256, 256)


def test_classify_ytdlp_errors():
    assert classify_error("ERROR: [youtube] x: Sign in to confirm you're not a bot") == "blocked"
    assert classify_error("ERROR: [youtube] x: Private video. Sign in if") == "unavailable"
    assert classify_error("ERROR: [youtube] x: Video unavailable. This video has been removed") == "unavailable"
    assert classify_error("ERROR: something else") == "error"


def test_block_triggers_cooldown(monkeypatch, tmp_path):
    import yt_dlp

    calls = []

    class Boom:
        def __init__(self, opts):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def download(self, urls):
            calls.append(urls)
            raise yt_dlp.utils.DownloadError("ERROR: Sign in to confirm you're not a bot")

    monkeypatch.setattr(yt_dlp, "YoutubeDL", Boom)
    f = Fetcher(enabled=True, cooldown_s=600)
    r1 = f.fetch("https://www.youtube.com/watch?v=jzE0Rcb2hY4", tmp_path)
    r2 = f.fetch("https://www.youtube.com/watch?v=jzE0Rcb2hY4", tmp_path)
    assert r1.reason == "blocked" and r2.reason == "cooldown" and len(calls) == 1


def test_disabled_fetcher_never_calls(tmp_path):
    assert Fetcher(enabled=False).fetch("https://youtu.be/x", tmp_path).reason == "disabled"


def test_repeated_generic_errors_trip_breaker(monkeypatch, tmp_path):
    import yt_dlp

    calls = []

    class Boom:
        def __init__(self, opts):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def download(self, urls):
            calls.append(urls)
            raise yt_dlp.utils.DownloadError("ERROR: [youtube] x: This video is not available")

    monkeypatch.setattr(yt_dlp, "YoutubeDL", Boom)
    f = Fetcher(enabled=True, cooldown_s=600, max_consecutive_errors=2)
    reasons = [f.fetch(f"https://youtu.be/{i}", tmp_path).reason for i in range(3)]
    assert reasons == ["error", "error", "cooldown"] and len(calls) == 2
