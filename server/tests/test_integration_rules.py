"""Real `rules` package + server pipeline. Network is replaced by the rules team's innertube
fixtures (server/rules/tests/fixtures), so no request ever reaches YouTube."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.pipeline import Pipeline
from rules import youtube as yt
from tests.helpers import FakeFetcher, assert_contract_body, base_settings

FIX = Path(__file__).resolve().parents[1] / "rules" / "tests" / "fixtures"
FX = {"jzE0Rcb2hY4": "next_c2pa_ai_jzE0Rcb2hY4.json",
      "kaVmpWPnE5s": "next_creator_disclosure_kaVmpWPnE5s.json",
      "gfjgRHtDa38": "next_camera_gfjgRHtDa38.json",
      "1nzjMOuDasQ": "next_auto_dub_1nzjMOuDasQ.json",
      "u5TpxWFZ1vM": "next_no_label_u5TpxWFZ1vM.json"}


def handler(req: httpx.Request):
    if req.url.path == "/youtubei/v1/next":
        vid = json.loads(req.content)["videoId"]
        if vid in FX:
            return httpx.Response(200, json=json.loads((FIX / FX[vid]).read_text(encoding="utf-8")))
    return httpx.Response(404)


@pytest.fixture(autouse=True)
def _reset_fetcher():
    yt.FETCHER.clear()
    yt.FETCHER.min_interval = 0.0
    yield
    yt.FETCHER.clear()


def run(tmp_path, vid, fetch="blocked", **kw):
    s = base_settings(tmp_path, **kw)
    pipe = Pipeline(s, fetcher=FakeFetcher(fetch))
    with TestClient(create_app(s, pipe)) as c:
        pipe.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        r = c.post("/v1/detect", json={"url": f"https://youtube.com/shorts/{vid}?si=x"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert_contract_body(b)
    return b


@pytest.mark.parametrize("vid,verdict", [
    ("jzE0Rcb2hY4", "likely_ai"),     # C2PA Google -> decisive
    ("kaVmpWPnE5s", "likely_ai"),     # creator disclosure (strong)
    ("gfjgRHtDa38", "likely_real"),   # C2PA camera
    ("1nzjMOuDasQ", "uncertain"),     # auto-dub + tutorial self-report (capped, weak)
    ("u5TpxWFZ1vM", "unknown"),       # no label, blocked video -> nothing usable
])
def test_rules_only_partial(tmp_path, vid, verdict):
    b = run(tmp_path, vid)
    assert b["partial"] is True and b["verdict"] == verdict, b


def test_rules_plus_model(tmp_path, sample_video):
    b = run(tmp_path, "u5TpxWFZ1vM", fetch=sample_video, mock_score=0.1)
    assert b["partial"] is False and b["verdict"] == "likely_real"
    assert {s["kind"] for s in b["signals"]} == {"rule", "model"}
