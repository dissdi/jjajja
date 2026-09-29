import json
import pathlib
import sys

import pytest

SERVER_DIR = pathlib.Path(__file__).resolve().parents[2]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def _reset_fetcher():
    from rules import youtube
    youtube.FETCHER.clear()
    youtube.FETCHER.min_interval = 0.0
    youtube.MONITOR.clear()
    yield
    youtube.FETCHER.clear()
    youtube.MONITOR.clear()
