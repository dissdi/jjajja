import re
from pathlib import Path

import pytest
import yaml

from app.ensemble import EnsembleConfig, combine, verdict_for

ROOT = Path(__file__).resolve().parents[2]
W = yaml.safe_load((ROOT / "server/config/weights.yaml").read_text())
CFG = EnsembleConfig.from_weights(W)


def sig(id, score, weight=1.0, status="ok", decisive=False, kind="rule"):
    return {"id": id, "kind": kind, "status": status, "decisive": decisive, "score": score,
            "weight": weight}


def test_thresholds_match_contract_table():
    text = (ROOT / ".claude/skills/detect-api-contract/SKILL.md").read_text()
    assert "p ≥ 0.75" in text and "0.40 ≤ p < 0.75" in text
    assert (CFG.likely_ai, CFG.uncertain) == (0.75, 0.40)


@pytest.mark.parametrize("p,v", [(0.75, "likely_ai"), (0.7499, "uncertain"), (0.40, "uncertain"),
                                 (0.3999, "likely_real"), (None, "unknown"), (0.0, "likely_real")])
def test_verdict_bands(p, v):
    assert verdict_for(p, False, CFG) == v


def test_decisive_positive_wins_over_models():
    p, v = combine([sig("yt_c2pa_ai_label", 1.0, decisive=True), sig("d3", 0.0, 5, kind="model")], CFG)
    assert v == "likely_ai" and p == 0.95


def test_decisive_negative_score_is_not_positive():
    p, v = combine([sig("weird", 0.05, 3.0, decisive=True)], CFG)
    assert v == "likely_real" and p == 0.05


def test_weight_zero_and_non_ok_excluded():
    p, v = combine([sig("yt_no_ai_label", 0.5, 0.0), sig("x", None, 1, status="unavailable"),
                    sig("y", 0.9, 1, status="error"), sig("mock", 0.1, 1, kind="model"),
                    sig("yt_c2pa_camera", 0.1, 1)], CFG)
    assert p == 0.1 and v == "likely_real"


def test_no_signals_unknown():
    assert combine([], CFG) == (None, "unknown")


def test_cap_without_strong_signal():
    # uncalibrated models + hashtag alone must not reach likely_ai
    p, v = combine([sig("yt_self_report_ai", 0.85, 1.5), sig("d3", 0.99, 0.5, kind="model"),
                    sig("commfor_224", 0.99, 0.5, kind="model")], CFG)
    assert p == 0.74 and v == "uncertain"


def test_creator_disclosure_is_strong():
    p, v = combine([sig("yt_creator_ai_disclosure", 0.95, 3.0), sig("d3", 0.5, 0.5, kind="model")], CFG)
    assert v == "likely_ai" and p == pytest.approx((0.95 * 3 + 0.25) / 3.5, abs=1e-4)


def test_camera_signal_pulls_down():
    p, v = combine([sig("yt_c2pa_camera", 0.05, 3.0), sig("commfor_224", 0.9, 0.5, kind="model")], CFG)
    assert v == "likely_real"


def test_calibrated_model_becomes_strong():
    w = yaml.safe_load(yaml.safe_dump(W))
    w["detectors"]["d3"]["calibrated"] = True
    cfg = EnsembleConfig.from_weights(w)
    p, v = combine([sig("d3", 0.9, 0.5, kind="model")], cfg)
    assert v == "likely_ai" and p == 0.9


def test_floor_without_strong_negative():
    # uncalibrated models alone must not reach likely_real either (LOO eval 2026-09-28)
    assert CFG.floor_without_strong == 0.40
    p, v = combine([sig("commfor_224", 0.05, 0.25, kind="model")], CFG)
    assert p == 0.40 and v == "uncertain"
    p, v = combine([sig("yt_self_report_ai", 0.5, 0.0), sig("d3", 0.01, 0.0, kind="model"),
                    sig("commfor_224", 0.02, 0.25, kind="model")], CFG)
    assert v == "uncertain"


def test_strong_negative_lifts_floor():
    p, v = combine([sig("yt_c2pa_camera", 0.05, 3.0), sig("commfor_224", 0.2, 0.25, kind="model")], CFG)
    assert v == "likely_real" and p < 0.40


def test_calibrated_model_is_strong_negative_too():
    w = yaml.safe_load(yaml.safe_dump(W))
    w["detectors"]["commfor_224"]["calibrated"] = True
    cfg = EnsembleConfig.from_weights(w)
    p, v = combine([sig("commfor_224", 0.1, 0.25, kind="model")], cfg)
    assert v == "likely_real" and p == 0.1


def test_eval_calibration_models_not_trusted_alone():
    # d3 off (chance level on eval), commfor small weight, neither calibrated (cap 0.74 kept)
    d = W["detectors"]
    assert d["d3"]["weight"] == 0 and not d["d3"]["calibrated"]
    assert 0 < d["commfor_224"]["weight"] <= 0.5 and not d["commfor_224"]["calibrated"]
    assert W["ensemble"]["cap_without_strong"] == 0.74
