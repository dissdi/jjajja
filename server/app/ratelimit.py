"""Tiny per-client sliding-window limiter -> 429 rate_limited."""
from __future__ import annotations

import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, client: str) -> bool:
        if self.per_minute <= 0:
            return True
        now = time.monotonic()
        q = self._hits[client]
        while q and now - q[0] > 60.0:
            q.popleft()
        if len(q) >= self.per_minute:
            return False
        q.append(now)
        return True
