"""Shared types for platform rule sets.

RuleSignal fields map 1:1 to `signals[]` in the detect API contract
(.claude/skills/detect-api-contract/SKILL.md). Do not rename.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Literal, Optional, Protocol
from urllib.parse import SplitResult

if TYPE_CHECKING:  # pragma: no cover
    import httpx


class InvalidUrl(ValueError):
    """Input has no usable video URL (maps to HTTP 400 `invalid_url`)."""


class UnsupportedPlatform(ValueError):
    """A URL was found but its site is not supported (HTTP 422 `unsupported_platform`)."""


@dataclass(frozen=True)
class Normalized:
    platform: str
    video_id: str
    canonical_url: str


@dataclass
class RuleSignal:
    id: str
    kind: Literal["rule"] = "rule"
    status: Literal["ok", "error", "unavailable"] = "ok"
    decisive: bool = False
    score: Optional[float] = None
    weight: float = 1.0
    evidence_ko: str = ""
    via: Literal["api", "oembed", "html"] = "api"
    # Contract v1.2 (#2): did we find the mark/record this signal is about?
    #   True  = found, False = looked and it is not there, None = could not check (status != ok).
    # What "the mark" is differs per signal id; see the present column in
    # _workspace/02_rules_spec.md section 3. The app shows 있음/없음 from this field only.
    present: Optional[bool] = None

    def __post_init__(self) -> None:
        if self.status != "ok":
            self.present = None  # contract: unchecked signals never claim presence/absence

    def to_dict(self) -> dict:
        return asdict(self)


class RuleSet(Protocol):
    """One platform. Add a module in server/rules/ exposing `RULESET` to register it."""

    platform: str

    def match(self, parts: SplitResult) -> Optional[str]:
        """Return video_id if this URL belongs to the platform.

        Raise InvalidUrl if the host is the platform's but no video id can be found.
        Return None if the host is not this platform's.
        """

    def canonical_url(self, video_id: str) -> str: ...

    async def extract(self, n: Normalized, client: "httpx.AsyncClient") -> list[RuleSignal]:
        """Must not raise; failures become status='unavailable' signals."""
