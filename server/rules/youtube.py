"""YouTube (Shorts) rules.

Signals come from the "How this content was made" section
(`howThisWasMadeSectionViewModel`) that YouTube puts in ytInitialData / innertube `next`.
Section kind is decided by the Help Center answer ID in its "Learn more" link, never by the
(localized) header text:
    15447836 -> altered or synthetic content (AI)
    15446725 -> captured with a camera (C2PA)
    15569972 -> auto-dubbed audio (NOT an AI-video signal; ignored)
`attributionText` present ("Info from Google LLC" / "정보 출처: Google LLC") means the label
comes from C2PA Content Credentials -> decisive. Absent means creator self-disclosure.

Collection order: innertube `next` (via="api") -> watch HTML ytInitialData (via="html")
-> oEmbed title only (via="oembed"). The server IP is rate-limited by YouTube, so every
network call goes through a cache, a global minimum interval and a cooldown after 429/captcha.
See _workspace/02_rules_spec.md for weights and false-positive notes.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Iterator, Optional
from urllib.parse import parse_qs, urlsplit, SplitResult

from .base import InvalidUrl, Normalized, RuleSignal

log = logging.getLogger(__name__)

PLATFORM = "youtube"

# --------------------------------------------------------------------------- URL
_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_HOSTS = {
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
    "youtube-nocookie.com", "www.youtube-nocookie.com",
}
_SHORT_HOSTS = {"youtu.be", "www.youtu.be"}
_PATH_PREFIXES = ("shorts", "embed", "live", "v", "e")


def _clean_id(s: str | None) -> Optional[str]:
    if not s:
        return None
    s = s[:11]
    return s if _ID.match(s) else None


def match_url(parts: SplitResult) -> Optional[str]:
    host = (parts.hostname or "").lower()
    if host in _SHORT_HOSTS:
        seg = parts.path.lstrip("/").split("/", 1)[0]
        vid = _clean_id(seg)
        if not vid:
            raise InvalidUrl("youtu.be link without video id")
        return vid
    if host not in _HOSTS:
        return None
    segs = [s for s in parts.path.split("/") if s]
    q = parse_qs(parts.query)
    if segs[:1] == ["watch"] or not segs:
        vid = _clean_id((q.get("v") or [None])[0])
    elif len(segs) >= 2 and segs[0] in _PATH_PREFIXES:
        vid = _clean_id(segs[1])
    else:
        vid = None
    if not vid:
        raise InvalidUrl("youtube link without video id (channel/playlist/home?)")
    return vid


def canonical_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


# --------------------------------------------------------------------------- weights
# Initial values; tune with detection-qa results. Rationale in _workspace/02_rules_spec.md.
W = {
    "c2pa_ai": dict(score=1.0, weight=1.0, decisive=True),
    "creator_ai": dict(score=0.95, weight=3.0, decisive=False),
    "c2pa_camera": dict(score=0.05, weight=3.0, decisive=False),
    "camera_noattr": dict(score=0.15, weight=1.5, decisive=False),
    "no_label": dict(score=0.5, weight=0.0, decisive=False),  # informational only
    "self_strong": dict(score=0.85, weight=1.5, decisive=False),
    "self_weak": dict(score=0.65, weight=0.5, decisive=False),
    "self_tutorial": dict(score=0.6, weight=0.5, decisive=False),
    "self_none": dict(score=0.5, weight=0.0, decisive=False),  # informational only
}

ANSWER_AI = "15447836"
ANSWER_CAMERA = "15446725"
ANSWER_AUTODUB = "15569972"

# --------------------------------------------------------------------------- parsing
_ANSWER_RE = re.compile(r"support\.google\.com/youtube/answer/(\d+)")


def _walk(o: Any, key: str) -> Iterator[dict]:
    stack = [o]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for k, v in cur.items():
                if k == key and isinstance(v, dict):
                    yield v
                elif isinstance(v, (dict, list)):
                    stack.append(v)
        elif isinstance(cur, list):
            stack.extend(cur)


def _text(node: Any) -> str:
    if not isinstance(node, dict):
        return ""
    if isinstance(node.get("content"), str):
        return node["content"]
    if isinstance(node.get("simpleText"), str):
        return node["simpleText"]
    runs = node.get("runs")
    if isinstance(runs, list):
        return "".join(r.get("text", "") for r in runs if isinstance(r, dict))
    return ""


@dataclass
class Section:
    answer_id: Optional[str]
    header: str
    attribution: str  # "" if absent


@dataclass
class Parsed:
    sections: list[Section] = field(default_factory=list)
    ai_badge: bool = False
    title: str = ""
    description: str = ""


def parse_initial_data(data: Any) -> Optional[Parsed]:
    """Parse innertube `next` response or HTML ytInitialData. None if unrecognized.

    We require videoPrimaryInfoRenderer so that an error/consent/captcha payload is not
    mistaken for "no AI label".
    """
    if not isinstance(data, dict):
        return None
    primaries = list(_walk(data.get("contents"), "videoPrimaryInfoRenderer"))
    if not primaries:
        return None
    p = Parsed()
    p.title = _text(primaries[0].get("title"))
    for badge in primaries[0].get("badges") or []:
        b = badge.get("metadataBadgeRenderer") if isinstance(badge, dict) else None
        if not isinstance(b, dict):
            continue
        a11y = ((b.get("accessibilityData") or {}).get("label") or "")
        if (b.get("label") or "").strip().upper() == "AI" or a11y.upper().startswith("AI:"):
            p.ai_badge = True
    for sec in _walk(data.get("contents"), "videoSecondaryInfoRenderer"):
        p.description = _text(sec.get("attributedDescription")) or _text(sec.get("description"))
        if p.description:
            break
    for vm in _walk(data, "howThisWasMadeSectionViewModel"):
        body = vm.get("bodyText") or {}
        answer = None
        m = _ANSWER_RE.search(json.dumps(body.get("commandRuns") or [], ensure_ascii=False))
        if m:
            answer = m.group(1)
        p.sections.append(Section(
            answer_id=answer,
            header=_text(vm.get("bodyHeader")),
            attribution=_text(vm.get("attributionText")).strip(),
        ))
    return p


_SIGNER_KO = {"google": "구글", "openai": "오픈AI", "microsoft": "마이크로소프트",
              "adobe": "어도비", "meta": "메타", "tiktok": "틱톡", "bytedance": "바이트댄스"}


def _signer_name(attribution: str) -> str:
    s = attribution
    for sep in (":", "："):
        if sep in s:
            s = s.split(sep, 1)[1]
            break
    else:
        s = re.sub(r"^\s*info from\s+", "", s, flags=re.I)
    return s.strip()


def _signer_ko(attribution: str) -> Optional[str]:
    name = _signer_name(attribution).lower()
    for k, v in _SIGNER_KO.items():
        if k in name:
            return v
    return None


def label_signals(p: Parsed, via: str) -> list[RuleSignal]:
    out: list[RuleSignal] = []
    ai = [s for s in p.sections if s.answer_id == ANSWER_AI]
    cam = [s for s in p.sections if s.answer_id == ANSWER_CAMERA]
    unknown = [s for s in p.sections if s.answer_id not in (ANSWER_AI, ANSWER_CAMERA, ANSWER_AUTODUB)]
    if unknown:
        log.info("youtube: unknown how-this-was-made section(s): %s", unknown)

    c2pa_ai = next((s for s in ai if s.attribution), None)
    if c2pa_ai:
        who = _signer_ko(c2pa_ai.attribution)
        ev = (f"영상에 남은 제작 기록에 {who} AI로 만들었다고 나와요" if who
              else "영상에 남은 제작 기록에 AI로 만들었다고 나와요")
        # present=True: a C2PA "made with AI" record is on the video.
        out.append(RuleSignal(id="yt_c2pa_ai_label", evidence_ko=ev, via=via, present=True,
                              **W["c2pa_ai"]))
    elif ai or p.ai_badge:
        out.append(RuleSignal(id="yt_creator_ai_disclosure",
                              evidence_ko="올린 사람이 유튜브에 'AI로 만든 영상'이라고 밝혔어요",
                              via=via, present=True,  # creator's AI label is shown
                              **W["creator_ai"]))
    if cam:
        key = "c2pa_camera" if any(s.attribution for s in cam) else "camera_noattr"
        out.append(RuleSignal(id="yt_c2pa_camera",
                              evidence_ko="영상에 남은 제작 기록에 카메라로 찍었다고 나와요",
                              # present=True means a CAMERA-capture record was found
                              # (points toward real footage, not toward AI).
                              via=via, present=True, **W[key]))
    if not out:
        # Absence of a label is NOT evidence of a real video (YouTube does not require
        # labels for clearly unrealistic content, and many AI shorts are unlabeled).
        # NOTE the negated name: `present` here still answers "is a YouTube AI label on the
        # video?" -- this signal exists only when it is not, so present is always False.
        # (It never means "the absence was found = True".)
        out.append(RuleSignal(id="yt_no_ai_label",
                              evidence_ko="유튜브에 AI로 만들었다는 표시는 없어요",
                              via=via, present=False, **W["no_label"]))
    return out


# --------------------------------------------------------------------------- self-report text
_KO_SUFFIX = ("영상", "생성", "제작", "동물", "콘텐츠", "컨텐츠", "애니", "그림", "아트", "캐릭터",
              "고양이", "강아지", "아기", "음악", "노래", "쇼츠", "숏츠", "밈", "영화", "드라마",
              "사진", "이미지", "합성", "창작", "로만든", "로제작", "가만든", "먹방", "asmr")
_EN_STRONG = {"madewithai", "generatedbyai", "createdwithai", "veo", "veo3", "googleveo", "veo2",
              "sora", "sora2", "openaisora", "soraai", "klingai", "kling", "hailuo", "hailuoai",
              "runwayml", "runwaygen3", "pikalabs", "pikaai", "midjourney", "minimaxai", "seedance",
              "인공지능영상", "인공지능그림"}
_EN_AI_PREFIX = re.compile(
    r"^ai(generated|gen|video|art|anim|cat|dog|animal|short|meme|baby|film|movie|story|content|"
    r"asmr|music|song|influencer|girl|model|creation|creator|image|photo|character)")
_WEAK_TAGS = {"ai", "인공지능", "에이아이", "artificialintelligence"}
_HASHTAG = re.compile(r"#([0-9A-Za-z_가-힣ぁ-ゟ゠-ヿ一-鿿]+)")
_PHRASES = re.compile(
    r"AI\s*로\s*(제작|만든|만들었|생성)|AI\s*가\s*만든|AI\s*생성|인공지능\s*(으로|이)\s*만든|"
    r"AI[- ]generated|made\s+(with|by)\s+AI|(generated|created)\s+(with|by)\s+AI|\bveo\s*3\b",
    re.IGNORECASE)
_TUTORIAL = re.compile(r"만드는\s*(법|방법)|만들기\s*강좌|강의|프롬프트|how\s+to\s+(make|create)|tutorial",
                       re.IGNORECASE)
# Reports *about* AI fakes (news, warnings) mention "AI가 만든 ..." without being AI-made.
_WARNING = re.compile(r"가짜|속지|구별|판별|사기|주의|딥페이크|피해|뉴스|기자|fake|scam|deepfake|news",
                      re.IGNORECASE)


def _tag_strength(tag: str) -> Optional[str]:
    t = tag.lower()
    if t in _EN_STRONG or _EN_AI_PREFIX.match(t):
        return "strong"
    if t.startswith("ai") and len(t) > 2 and t[2:].startswith(_KO_SUFFIX):
        return "strong"
    if t in _WEAK_TAGS:
        return "weak"
    return None


def classify_self_report(title: str, description: str) -> Optional[tuple[str, str]]:
    """Return (level, field) where level in strong|weak|tutorial and field in title|description."""
    best: Optional[tuple[str, str]] = None
    rank = {"strong": 3, "tutorial": 2, "weak": 1}
    # Context is judged on title+description together: a news title with a bare "#ai"
    # description is still news.
    warning = bool(_WARNING.search(title or "")) or bool(_WARNING.search(description or ""))
    tutorial = bool(_TUTORIAL.search(title or ""))
    for fld, text in (("title", title or ""), ("description", description or "")):
        level: Optional[str] = None
        tags = [_tag_strength(t) for t in _HASHTAG.findall(text)]
        if "strong" in tags:
            level = "strong"
        elif not warning and _PHRASES.search(text):
            level = "strong"
        elif not warning and "weak" in tags:
            level = "weak"
        if level == "strong" and tutorial:
            level = "tutorial"
        if level and (best is None or rank[level] > rank[best[0]]):
            best = (level, fld)
    return best


def self_report_signals(title: str, description: str, via: str, has_description: bool) -> list[RuleSignal]:
    hit = classify_self_report(title, description)
    if hit is None:
        ev = ("영상 제목과 설명에 AI 표시는 없어요" if has_description
              else "영상 제목에 AI 표시는 없어요")
        # present answers "does the title/description say it was made with AI?"
        return [RuleSignal(id="yt_self_report_ai", evidence_ko=ev, via=via, present=False,
                           **W["self_none"])]
    level, fld = hit
    where = "제목" if fld == "title" else "설명"
    key = {"strong": "self_strong", "weak": "self_weak", "tutorial": "self_tutorial"}[level]
    return [RuleSignal(id="yt_self_report_ai",
                       evidence_ko=f"영상 {where}에 AI로 만들었다는 표시가 있어요",
                       via=via, present=True, **W[key])]


# --------------------------------------------------------------------------- network
INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/next?prettyPrint=false"
INNERTUBE_CLIENT_VERSION = "2.20260925.00.00"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")
_YTID_RE = re.compile(r"(?:var\s+ytInitialData|window\[\"ytInitialData\"\])\s*=\s*")


class _Fetcher:
    """Cache + global min interval + cooldown for all YouTube calls from this process."""

    def __init__(self, min_interval: float = 1.5, timeout: float = 5.0,
                 ttl: float = 6 * 3600, neg_ttl: float = 120, cooldown: float = 600,
                 max_entries: int = 1024):
        self.min_interval = min_interval
        self.timeout = timeout
        self.ttl = ttl
        self.neg_ttl = neg_ttl
        self.cooldown = cooldown
        self.max_entries = max_entries
        self._cache: dict[str, tuple[float, Any]] = {}
        self._blocked_until: dict[str, float] = {}
        self._last = 0.0
        self._lock: Optional[asyncio.Lock] = None
        self._lock_loop = None
        self.calls = 0  # network calls made (for tests/metrics)

    def clear(self) -> None:
        self._cache.clear()
        self._blocked_until.clear()
        self._last = 0.0

    def _get_lock(self) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        if self._lock is None or self._lock_loop is not loop:
            self._lock, self._lock_loop = asyncio.Lock(), loop
        return self._lock

    def _cached(self, key: str) -> tuple[bool, Any]:
        hit = self._cache.get(key)
        if hit and hit[0] > time.monotonic():
            return True, hit[1]
        if hit:
            self._cache.pop(key, None)
        return False, None

    def _store(self, key: str, value: Any) -> None:
        if len(self._cache) >= self.max_entries:
            self._cache.pop(next(iter(self._cache)))
        ttl = self.ttl if value is not None else self.neg_ttl
        self._cache[key] = (time.monotonic() + ttl, value)

    async def fetch(self, key: str, endpoint: str, client, method: str, url: str, **kw) -> Any:
        """Returns httpx.Response-derived payload via `parse` or None. Never raises."""
        ok, val = self._cached(key)
        if ok:
            return val
        if self._blocked_until.get(endpoint, 0) > time.monotonic():
            return None
        parse = kw.pop("parse")
        async with self._get_lock():
            ok, val = self._cached(key)
            if ok:
                return val
            wait = self._last + self.min_interval - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            result = None
            try:
                self.calls += 1
                resp = await client.request(method, url, timeout=self.timeout,
                                            follow_redirects=False, **kw)
                if resp.status_code in (429, 403) or (
                        resp.status_code in (302, 303) and "sorry" in resp.headers.get("location", "")):
                    log.warning("youtube %s blocked (%s); cooling down", endpoint, resp.status_code)
                    self._blocked_until[endpoint] = time.monotonic() + self.cooldown
                elif resp.status_code == 200:
                    result = parse(resp)
                else:
                    log.info("youtube %s status %s", endpoint, resp.status_code)
            except Exception as e:  # network, timeout, JSON errors
                log.info("youtube %s failed: %r", endpoint, e)
            finally:
                self._last = time.monotonic()
            self._store(key, result)
            return result


FETCHER = _Fetcher()


def _parse_json(resp) -> Any:
    return resp.json()


def _parse_html_initial_data(resp) -> Any:
    html = resp.text
    m = _YTID_RE.search(html)
    if not m:
        return None
    obj, _ = json.JSONDecoder().raw_decode(html, m.end())
    return obj


async def fetch_next(video_id: str, client) -> Any:
    body = {"context": {"client": {"clientName": "WEB", "clientVersion": INNERTUBE_CLIENT_VERSION,
                                   "hl": "ko", "gl": "KR"}},
            "videoId": video_id}
    return await FETCHER.fetch(f"next:{video_id}", "innertube", client, "POST", INNERTUBE_URL,
                               json=body, headers={"User-Agent": UA}, parse=_parse_json)


async def fetch_html(video_id: str, client) -> Any:
    return await FETCHER.fetch(f"html:{video_id}", "html", client, "GET",
                               f"https://www.youtube.com/watch?v={video_id}&hl=ko",
                               headers={"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"},
                               parse=_parse_html_initial_data)


async def fetch_oembed(video_id: str, client) -> Any:
    return await FETCHER.fetch(f"oembed:{video_id}", "oembed", client, "GET",
                               "https://www.youtube.com/oembed",
                               params={"url": canonical_url(video_id), "format": "json"},
                               headers={"User-Agent": UA}, parse=_parse_json)


# --------------------------------------------------------------------------- RuleSet
class YouTubeRules:
    platform = PLATFORM

    def match(self, parts: SplitResult) -> Optional[str]:
        return match_url(parts)

    def canonical_url(self, video_id: str) -> str:
        return canonical_url(video_id)

    async def extract(self, n: Normalized, client) -> list[RuleSignal]:
        try:
            return await self._extract(n, client)
        except Exception as e:  # last line of defence: never raise
            log.exception("youtube extract crashed: %r", e)
            return [RuleSignal(id="yt_ai_label", status="unavailable", via="api"),
                    RuleSignal(id="yt_self_report_ai", status="unavailable", via="api")]

    async def _extract(self, n: Normalized, client) -> list[RuleSignal]:
        parsed, via = None, "api"
        data = await fetch_next(n.video_id, client)
        parsed = parse_initial_data(data)
        if parsed is None:
            via = "html"
            parsed = parse_initial_data(await fetch_html(n.video_id, client))

        signals: list[RuleSignal] = []
        if parsed is not None:
            signals += label_signals(parsed, via)
            signals += self_report_signals(parsed.title, parsed.description, via,
                                           has_description=bool(parsed.description))
            return signals

        signals.append(RuleSignal(id="yt_ai_label", status="unavailable", via="api"))
        oe = await fetch_oembed(n.video_id, client)
        title = oe.get("title") if isinstance(oe, dict) else None
        if isinstance(title, str) and title:
            signals += self_report_signals(title, "", "oembed", has_description=False)
        else:
            signals.append(RuleSignal(id="yt_self_report_ai", status="unavailable", via="oembed"))
        return signals


RULESET = YouTubeRules()
