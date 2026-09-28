"""Platt calibration + ensemble weight selection with leave-one-out CV (small-sample eval).

  cd server && python -m tools.calibrate_loo --raw ../_workspace/05_raw_scores.csv \
      --rules ../_workspace/04_eval_results.csv [--json out.json]

* Per detector: p = sigmoid(a * (raw - b))  (== weights.yaml `calibration: {a, b}`), fitted by
  L2-regularised logistic regression (Newton). Features are standardised inside each fit.
* LOO: for every held-out video, fit calibration (and choose ensemble weights by an inner LOO
  on the remaining videos), then score only the held-out video. Metrics are pooled over the
  held-out predictions — nothing is evaluated on data it was fitted on.
* Verdicts are recomputed with the real ensemble (app.ensemble.combine) using the rule signals
  recorded in 04_eval_results.csv (signals_detail) plus the detector scores.
* Unverified-label rows (EXCLUDE_IDS) are never used for fitting; reported separately.
"""
from __future__ import annotations

import argparse
import csv
import itertools
import json
import math
import sys
from pathlib import Path

import numpy as np
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ensemble import EnsembleConfig, combine  # noqa: E402

EXCLUDE_IDS = {"IUbJ0EPwUro", "ys84TpoCz10"}   # 2026 news shorts, label not human-verified
DETS = {"d3": "d3_raw", "commfor_224": "commfor_raw"}
WEIGHT_GRID = [0.0, 0.25, 0.5, 1.0]
L2 = 1.0


# ------------------------------------------------------------------ stats helpers
def auc(y, s) -> float:
    y, s = np.asarray(y), np.asarray(s, dtype=float)
    pos, neg = s[y == 1], s[y == 0]
    if not len(pos) or not len(neg):
        return float("nan")
    gt = (pos[:, None] > neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum()
    return float(gt / (len(pos) * len(neg)))


def fit_platt(x, y, l2=L2) -> tuple[float, float]:
    """Return (a, b) such that p = sigmoid(a * (x - b)). Standardised Newton-IRLS with L2 on slope."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    mu, sd = x.mean(), x.std() or 1.0
    z = (x - mu) / sd
    # Platt target smoothing (Platt 1999) to avoid infinite slopes on separable tiny data
    n1, n0 = y.sum(), len(y) - y.sum()
    t = np.where(y == 1, (n1 + 1) / (n1 + 2), 1 / (n0 + 2))
    w = np.zeros(2)  # [intercept, slope]
    X = np.stack([np.ones_like(z), z], 1)
    R = np.diag([0.0, l2])
    for _ in range(100):
        p = 1 / (1 + np.exp(-(X @ w)))
        g = X.T @ (p - t) + R @ w
        H = X.T @ (X * (p * (1 - p))[:, None]) + R + 1e-9 * np.eye(2)
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-10:
            break
    c0, c1 = w
    a = c1 / sd
    if abs(a) < 1e-12:
        return 0.0, 0.0
    b = mu - c0 * sd / c1
    return float(a), float(b)


def platt(x, ab) -> np.ndarray:
    a, b = ab
    return 1 / (1 + np.exp(-np.clip(a * (np.asarray(x, float) - b), -60, 60)))


def logloss(y, p) -> float:
    p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
    y = np.asarray(y, float)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def model_only(scores: dict[str, np.ndarray], wts: dict[str, float]) -> np.ndarray:
    tw = sum(wts.values())
    if tw <= 0:
        return np.full(len(next(iter(scores.values()))), 0.5)
    return sum(wts[d] * scores[d] for d in wts) / tw


def choose_weights(x: dict[str, np.ndarray], y: np.ndarray) -> dict[str, float]:
    """Inner LOO: pick the weight pair minimising held-out log-loss of the model-only mix."""
    best, best_w = math.inf, {d: 0.0 for d in DETS}
    n = len(y)
    for combo in itertools.product(WEIGHT_GRID, repeat=len(DETS)):
        wts = dict(zip(DETS, combo))
        if sum(combo) == 0:
            continue
        preds = np.zeros(n)
        for i in range(n):
            tr = np.arange(n) != i
            sc = {d: platt(x[d][i:i + 1], fit_platt(x[d][tr], y[tr])) for d in DETS}
            preds[i] = model_only(sc, wts)[0]
        # tie-break toward smaller total weight (prefer rules/less model influence)
        ll = logloss(y, preds) + 1e-4 * sum(combo)
        if ll < best:
            best, best_w = ll, wts
    return best_w


# ------------------------------------------------------------------ ensemble replay
def parse_rules(detail: str) -> list[dict]:
    out = []
    for part in (detail or "").split(";"):
        f = part.split(":")
        if len(f) < 4 or f[0] in DETS:
            continue
        out.append({"id": f[0], "status": f[1],
                    "score": None if f[2] == "None" else float(f[2]),
                    "weight": float(f[3]), "decisive": len(f) > 4 and f[4] == "D"})
    return out


def verdict(rule_sigs, det_scores: dict, det_weights: dict, cfg: EnsembleConfig):
    sigs = list(rule_sigs)
    for d, s in det_scores.items():
        if s is not None and not np.isnan(s):
            sigs.append({"id": d, "status": "ok", "score": float(s), "weight": det_weights[d],
                         "decisive": False})
    return combine(sigs, cfg)


def summarise(rows, verdicts, key) -> dict:
    y = np.array([r["y"] for r in rows])
    v = np.array(verdicts)
    real, ai = y == 0, y == 1
    dist = {k: int((v == k).sum()) for k in ("likely_ai", "uncertain", "likely_real", "unknown")}
    return {
        "set": key,
        "n": len(rows),
        "FPR_real_to_likely_ai": f"{int(((v == 'likely_ai') & real).sum())}/{int(real.sum())}",
        "FNR_ai_to_likely_real": f"{int(((v == 'likely_real') & ai).sum())}/{int(ai.sum())}",
        "real_to_uncertain_or_worse": f"{int((np.isin(v, ['likely_ai', 'uncertain']) & real).sum())}/{int(real.sum())}",
        "dist_ai": {k: int(((v == k) & ai).sum()) for k in dist},
        "dist_real": {k: int(((v == k) & real).sum()) for k in dist},
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--rules", required=True)
    ap.add_argument("--weights", default=str(Path(__file__).resolve().parents[1] / "config" / "weights.yaml"))
    ap.add_argument("--json")
    a = ap.parse_args()

    rules = {r["url"]: parse_rules(r["signals_detail"]) for r in csv.DictReader(open(a.rules, encoding="utf-8"))}
    allrows = []
    for r in csv.DictReader(open(a.raw, encoding="utf-8")):
        if r.get("fetch_status") != "ok" or not r.get("d3_raw") or not r.get("commfor_raw"):
            continue
        allrows.append({"url": r["url"], "vid": r["video_id"], "y": 1 if r["label"] == "ai" else 0,
                        "label_source": r["label_source"],
                        "d3": float(r["d3_raw"]), "commfor_224": float(r["commfor_raw"]),
                        "rules": rules.get(r["url"], [])})
    rows = [r for r in allrows if r["vid"] not in EXCLUDE_IDS]
    held = [r for r in allrows if r["vid"] in EXCLUDE_IDS]
    y = np.array([r["y"] for r in rows])
    X = {d: np.array([r[d] for r in rows]) for d in DETS}
    n = len(rows)
    rep: dict = {"n_fit": n, "n_ai": int(y.sum()), "n_real": int(n - y.sum()),
                 "excluded_unverified": [r["vid"] for r in held]}

    # 1. raw AUC (rank only, no fitting)
    rep["raw_auc"] = {d: auc(y, X[d]) for d in DETS}

    # 2. BEFORE: current weights.yaml (provisional calibration), whole pipeline
    w = yaml.safe_load(Path(a.weights).read_text())
    cfg_before = EnsembleConfig.from_weights(w)
    dcfg = w["detectors"]

    def cur_cal(d, x):
        c = dcfg[d].get("calibration")
        return float(platt([x], (c["a"], c["b"]))[0]) if c else float(min(max(x, 0), 1))

    before_scores = {d: np.array([cur_cal(d, r[d]) for r in rows]) for d in DETS}
    before_w = {d: float(dcfg[d]["weight"]) for d in DETS}
    vb = [verdict(r["rules"], {d: before_scores[d][i] for d in DETS}, before_w, cfg_before)[1]
          for i, r in enumerate(rows)]
    mb = model_only(before_scores, before_w)
    rep["before"] = {"auc_per_det": {d: auc(y, before_scores[d]) for d in DETS},
                     "auc_model_mix": auc(y, mb), "logloss_model_mix": logloss(y, mb),
                     "model_only_FPR@0.75": f"{int(((mb >= 0.75) & (y == 0)).sum())}/{int((y == 0).sum())}",
                     "pipeline": summarise(rows, vb, "before"),
                     "pipeline_models_only": summarise(rows, [
                         verdict([], {d: before_scores[d][i] for d in DETS}, before_w, cfg_before)[1]
                         for i in range(n)], "before_models_only")}

    # 3. LOO: calibrate per detector + choose weights with inner LOO, predict held-out only
    loo = {d: np.zeros(n) for d in DETS}
    loo_mix = np.zeros(n)
    chosen = []
    for i in range(n):
        tr = np.arange(n) != i
        Xtr = {d: X[d][tr] for d in DETS}
        wts = choose_weights(Xtr, y[tr])
        chosen.append(wts)
        for d in DETS:
            loo[d][i] = platt(X[d][i:i + 1], fit_platt(Xtr[d], y[tr]))[0]
        loo_mix[i] = model_only({d: loo[d][i:i + 1] for d in DETS}, wts)[0] if sum(wts.values()) else 0.5
    rep["loo"] = {"auc_per_det": {d: auc(y, loo[d]) for d in DETS},
                  "logloss_per_det": {d: logloss(y, loo[d]) for d in DETS},
                  "auc_model_mix": auc(y, loo_mix), "logloss_model_mix": logloss(y, loo_mix),
                  "base_rate_logloss": logloss(y, np.full(n, y.mean())),
                  "chosen_weights_freq": {json.dumps(k): sum(json.dumps(c, sort_keys=True) == k for c in chosen)
                                          for k in {json.dumps(c, sort_keys=True) for c in chosen}},
                  "model_mix_FPR@0.75": f"{int(((loo_mix >= 0.75) & (y == 0)).sum())}/{int((y == 0).sum())}",
                  "real_mix_max": float(loo_mix[y == 0].max()) if (y == 0).any() else None}
    # pipeline verdicts with LOO scores (cap kept, models NOT strong)
    cfg_cap = EnsembleConfig.from_weights({**w, "detectors": {d: {**dcfg[d], "calibrated": False} for d in dcfg}})
    va = [verdict(r["rules"], {d: loo[d][i] for d in DETS}, chosen[i], cfg_cap)[1] for i, r in enumerate(rows)]
    rep["loo"]["pipeline"] = summarise(rows, va, "after_loo_cap_kept")
    rep["loo"]["pipeline_models_only"] = summarise(
        rows, [verdict([], {d: loo[d][i] for d in DETS}, chosen[i], cfg_cap)[1] for i in range(n)],
        "after_loo_models_only_cap_kept")
    # what-if: cap released (models strong) -> FPR check only
    cfg_nocap = EnsembleConfig.from_weights({**w, "detectors": {d: {**dcfg[d], "calibrated": True} for d in dcfg}})
    rep["loo"]["pipeline_models_only_cap_released"] = summarise(
        rows, [verdict([], {d: loo[d][i] for d in DETS}, chosen[i], cfg_nocap)[1] for i in range(n)],
        "whatif_models_strong")

    # 4. final fit on all verified rows (what goes into weights.yaml)
    final_cal = {d: fit_platt(X[d], y) for d in DETS}
    final_w = choose_weights(X, y)
    rep["final"] = {"calibration": {d: {"a": round(v[0], 4), "b": round(v[1], 4)} for d, v in final_cal.items()},
                    "weights": final_w}

    # 5. per-row table + held-out unverified rows scored with the final fit
    rep["rows"] = [{"vid": r["vid"], "y": r["y"], "src": r["label_source"], "d3_raw": r["d3"],
                    "cf_raw": r["commfor_224"], "d3_loo": round(float(loo["d3"][i]), 3),
                    "cf_loo": round(float(loo["commfor_224"][i]), 3), "mix_loo": round(float(loo_mix[i]), 3),
                    "verdict_before": vb[i], "verdict_after": va[i]} for i, r in enumerate(rows)]
    rep["unverified"] = []
    for r in held:
        sc = {d: float(platt([r[d]], final_cal[d])[0]) for d in DETS}
        rep["unverified"].append({"vid": r["vid"], "d3_raw": r["d3"], "cf_raw": r["commfor_224"],
                                  **{f"{d}_cal": round(v, 3) for d, v in sc.items()},
                                  "verdict_before": verdict(r["rules"], {d: cur_cal(d, r[d]) for d in DETS}, before_w, cfg_before)[1],
                                  "verdict_after": verdict(r["rules"], sc, final_w, cfg_cap)[1]})
    txt = json.dumps(rep, ensure_ascii=False, indent=1, default=float)
    if a.json:
        Path(a.json).write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
