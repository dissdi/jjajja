"""Per-request temp directory that is safe against abandoned worker threads (#1).

When the response budget runs out we stop awaiting yt-dlp / ffmpeg, but their worker threads
keep running (Python threads cannot be killed). Those workers `mkdir` their output folders, so a
plain `rmtree` in the request's `finally` could be undone by a late thread and leak files.

WorkDir counts active workers. `close()` marks it closed; the folder is deleted by whoever
finishes last (the request if nothing is running, otherwise the last worker thread). A worker
that only gets to start after `close()` does nothing. Workers never touch the result cache --
only the request coroutine stores results, and it does so only for results it returned.
"""
from __future__ import annotations

import asyncio
import logging
import shutil
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger(__name__)


class WorkDirClosed(RuntimeError):
    """The request already gave up on this folder; the job was not run."""


class WorkDir:
    def __init__(self, root: Path, prefix: str = "job_"):
        Path(root).mkdir(parents=True, exist_ok=True)
        self.path = Path(tempfile.mkdtemp(prefix=prefix, dir=root))
        self._lock = threading.Lock()
        self._active = 0
        self._closed = False
        self._removed = False

    # counted inside the worker thread: a job cancelled before it starts never enters
    def _enter(self) -> None:
        with self._lock:
            if self._closed:
                raise WorkDirClosed(str(self.path))
            self._active += 1

    def _exit(self) -> None:
        with self._lock:
            self._active -= 1
            last = self._closed and self._active == 0
        if last:
            self._remove()

    def _remove(self) -> None:
        with self._lock:
            if self._removed:
                return
            self._removed = True
        shutil.rmtree(self.path, ignore_errors=True)

    def call(self, fn: Callable[..., Any], *args: Any, **kw: Any) -> Any:
        """Run blocking `fn` in the current (worker) thread under the guard."""
        self._enter()
        try:
            return fn(*args, **kw)
        finally:
            self._exit()

    async def run(self, fn: Callable[..., Any], *args: Any, **kw: Any) -> Any:
        """`asyncio.to_thread(fn, ...)` under the guard. Safe to abandon via wait_for/cancel."""
        return await asyncio.to_thread(self.call, fn, *args, **kw)

    def close(self) -> None:
        with self._lock:
            self._closed = True
            idle = self._active == 0
        if idle:
            self._remove()
        else:
            log.info("workdir %s: %d worker(s) still running; they will delete it",
                     self.path.name, self._active)

    @property
    def active(self) -> int:
        with self._lock:
            return self._active

    @property
    def removed(self) -> bool:
        with self._lock:
            return self._removed
