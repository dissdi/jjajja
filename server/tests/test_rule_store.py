"""The server turns on the persistent rule store at startup (#9)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.pipeline import Pipeline
from rules import youtube as yt
from tests.helpers import FakeFetcher, base_settings


@pytest.fixture(autouse=True)
def _reset_fetcher():
    yt.FETCHER.clear()
    yield
    yt.FETCHER.clear()


def test_startup_enables_store_in_cache_dir(tmp_path):
    s = base_settings(tmp_path)
    pipe = Pipeline(s, fetcher=FakeFetcher("blocked"))
    with TestClient(create_app(s, pipe)):
        assert yt.FETCHER.store is not None
        assert yt.FETCHER.store.path == s.cache_dir / "rules.sqlite3"
        assert (s.cache_dir / "rules.sqlite3").exists()
