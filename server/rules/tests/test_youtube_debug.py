"""Dev-mode `debug` on YouTube rule signals (contract v1.3). Not part of to_dict()/the store."""
import httpx
import pytest

from rules import extract_signals, normalize

VID = "jzE0Rcb2hY4"


async def _run(handler):
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        return {s.id: s for s in await extract_signals(normalize(f"https://youtu.be/{VID}"), c)}


@pytest.mark.asyncio
async def test_blocked_reason():
    sigs = await _run(lambda req: httpx.Response(429))
    lab = sigs["yt_ai_label"]
    assert lab.status == "unavailable"
    assert "innertube blocked (http 429)" in lab.debug["reason"]
    assert "html blocked" in lab.debug["reason"]
    assert sigs["yt_self_report_ai"].debug["reason"].startswith("oembed")
    assert "debug" not in lab.to_dict()


@pytest.mark.asyncio
async def test_parse_failed_reason():
    sigs = await _run(lambda req: httpx.Response(200, json={"nope": 1})
                      if "youtubei" in req.url.path else httpx.Response(404))
    assert "innertube parse failed" in sigs["yt_ai_label"].debug["reason"]
    assert "oembed http 404" == sigs["yt_self_report_ai"].debug["reason"]
