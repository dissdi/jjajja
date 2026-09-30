"""Source (platform) rule engine.

Public interface (imported by the detection server — keep stable):
    normalize(url) -> Normalized            raises InvalidUrl / UnsupportedPlatform
    await resolve(url, client, timeout) -> Normalized
                                            normalize + short-link redirects (#7);
                                            also raises LinkUnresolved
    await extract_signals(n, client) -> list[RuleSignal]   never raises

Adding a platform: drop a module `server/rules/<platform>.py` that exposes `RULESET`
(see base.RuleSet). It is discovered automatically; no edit here is needed.
"""
from __future__ import annotations

import importlib
import logging
import pkgutil
from typing import TYPE_CHECKING

from .base import (InvalidUrl, LinkUnresolved, Normalized, RuleSet, RuleSignal,
                   UnsupportedPlatform)
from .normalize import normalize_with
from .shorturl import resolve_with

if TYPE_CHECKING:  # pragma: no cover
    import httpx

__all__ = ["RuleSignal", "Normalized", "InvalidUrl", "UnsupportedPlatform", "LinkUnresolved",
           "normalize", "resolve", "extract_signals", "REGISTRY"]

log = logging.getLogger(__name__)
_SKIP = {"base", "normalize", "shorturl", "tests"}


def _discover() -> dict[str, RuleSet]:
    reg: dict[str, RuleSet] = {}
    for mod in pkgutil.iter_modules(__path__):
        if mod.name in _SKIP or mod.name.startswith("_"):
            continue
        m = importlib.import_module(f"{__name__}.{mod.name}")
        rs = getattr(m, "RULESET", None)
        if rs is not None:
            reg[rs.platform] = rs
    return reg


REGISTRY: dict[str, RuleSet] = _discover()


def normalize(url: str) -> Normalized:
    return normalize_with(url, REGISTRY.values())


async def resolve(url: str, client: "httpx.AsyncClient | None", timeout: float) -> Normalized:
    return await resolve_with(url, REGISTRY.values(), client, timeout)


async def extract_signals(n: Normalized, client: "httpx.AsyncClient") -> list[RuleSignal]:
    rs = REGISTRY.get(n.platform)
    if rs is None:
        return []
    try:
        return await rs.extract(n, client)
    except Exception:  # RuleSet.extract should never raise; belt and braces
        log.exception("extract_signals failed for %s", n)
        return []


def use_store(path) -> None:
    """Persist rule caches (finished signals, bot-block cooldowns) in an SQLite file so they
    survive restarts and are shared by worker processes on this host (#9). Called once by the
    server at startup; without it everything stays in memory. A RuleSet opts in by exposing
    `use_store(store)`. Never raises."""
    from .store import SqliteStore

    store = SqliteStore(path)
    for rs in REGISTRY.values():
        hook = getattr(rs, "use_store", None)
        if hook is not None:
            hook(store)
