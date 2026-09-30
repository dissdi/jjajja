import os
import sys
from pathlib import Path

# never load server/.env (real API keys) during tests; Settings.from_env honours this
os.environ["JJAJJA_ENV_FILE"] = ""

import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from tests.helpers import make_video  # noqa: E402


@pytest.fixture(scope="session")
def sample_video(tmp_path_factory) -> Path:
    return make_video(tmp_path_factory.mktemp("media") / "vertical.mp4")


@pytest.fixture(scope="session")
def long_video(tmp_path_factory) -> Path:
    # 190 s > contract max_duration_s (180), tiny so it encodes fast
    return make_video(tmp_path_factory.mktemp("media") / "long.mp4", seconds=190, size="64x96",
                      rate=1, src="testsrc")
