import json
import sys
from pathlib import Path

import pytest

OFFICES = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(OFFICES))
sys.path.insert(0, str(OFFICES.parent))

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def fixture_json():
    def load(name: str):
        return json.loads((FIXTURES / name).read_text(encoding="utf-8"))

    return load
