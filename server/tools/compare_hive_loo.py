"""Hive vs CommFor vs ensemble on eval/dataset.csv (issue #3). Small-sample, leave-one-out.

  cd server && python -m tools.compare_hive_loo --raw ../_workspace/06_hive_scores.csv \
      --rules ../_workspace/04_eval_results.csv [--json out.json]

1. Raw AUC (rank only, no fitting) with stratified bootstrap 95% CI.
2. Platt LOO (tools.calibrate_loo.fit_platt) AUC / log-loss per detector.
3. Ensemble policies replayed with the real app.ensemble.combine and the rule signals recorded in
   04_eval_results.csv. A policy = which detectors, their weights, and whether Hive is a "strong"
   signal (releases the 0.74 cap when Hive >= 0.5 and/or the 0.40 floor when Hive < 0.5).
   Policies have no continuous parameter fitted to this data except P_platt (fitted per LOO fold).
4. Nested LOO policy choice: for each held-out video the policy is picked on the other n-1 by
   cost = 10*FP(real->likely_ai) + FN_COST*FN(ai->likely_real) + 1*uncertain (--fn-cost, default 3); only the held-out video
   is scored. This is the honest estimate of "pick a policy from this data, then deploy it".
Unverified-label rows (tools.calibrate_loo.EXCLUDE_IDS) are reported separately.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ensemble import EnsembleConfig, combine  # noqa: E402
from tools.calibrate_loo import EXCLUDE_IDS, auc, fit_platt, logloss, parse_rules, platt  # noqa: E402

VERDICTS = ("likely_ai", "uncertain", "likely_real", "unknown")


def boot_ci(y, s, B=5000, seed=0) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    y, s = np.asarray(y), np.asarray(s, float)
    pos, neg = np.where(y == 1)[0], np.where(y == 0)[0]
    vals = []
    for _ in range(B):
        idx = np.concatenate([rng.choice(pos, len(pos)), rng.choice(neg, len(neg))])
        vals.append(auc(y[idx], s[idx]))
    return float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def cfg_for(w: dict, hive_strong_pos: bool, hive_strong_neg: bool) -> EnsembleConfig:
    base = EnsembleConfig.from_weights({**w, "detectors": {}})  # models never strong by default
    # hive strength is set by the policy only, never inherited from weights.yaml (v3 lists it)
    sp, sn = set(base.strong_signals) - {"hive"}, set(base.strong_negative_signals) - {"hive"}
    if hive_strong_pos:
        sp.add("hive")
    if hive_strong_neg:
        sn.add("hive")
    return EnsembleConfig(base.likely_ai, base.uncertain, base.decisive_floor, base.cap_without_strong,
                          base.floor_without_strong, frozenset(sp), frozenset(sn))


# name -> (weights {det: w}, hive strong+, hive strong-, hive score source)
POLICIES = {
    "E0_v2_rules+cf":                 ({"commfor_224": 0.25}, False, False, "raw"),
    "E1_rules+cf+hive_weak":          ({"commfor_224": 0.25, "hive": 0.25}, False, False, "raw"),
    "E1b_rules+cf+hive_weak_w1":      ({"commfor_224": 0.25, "hive": 1.0}, False, False, "raw"),
    "E2_hive_strong_both+cf":         ({"commfor_224": 0.25, "hive": 1.0}, True, True, "raw"),
    "E3_hive_strong_both":            ({"hive": 1.0}, True, True, "raw"),
    "E4_hive_strong_cap_only+cf":     ({"commfor_224": 0.25, "hive": 1.0}, True, False, "raw"),
    "E5_hive_strong_floor_only+cf":   ({"commfor_224": 0.25, "hive": 1.0}, False, True, "raw"),
    "E6_hive_strong_both_platt+cf":   ({"commfor_224": 0.25, "hive": 1.0}, True, True, "platt"),
    "E7_hive_cap_only_w0.5+cf":       ({"commfor_224": 0.25, "hive": 0.5}, True, False, "raw"),
    "E8_hive_cap_only_top25+cf":      ({"commfor_224": 0.25, "hive": 1.0}, True, False, "top25"),
    "E9_hive_cap_only_top25_w0.5+cf": ({"commfor_224": 0.25, "hive": 0.5}, True, False, "top25"),
}


def run_policy(row: dict, name: str, w: dict, hive_platt: float | None, models_only: bool):
    wts, sp, sn, src = POLICIES[name]
    sigs = [] if models_only else list(row["rules"])
    for d, wt in wts.items():
        s = row["cf"] if d == "commfor_224" else {"platt": hive_platt, "top25": row["hive_top25"]}.get(src, row["hive"])
        sigs.append({"id": d, "status": "ok", "score": float(s), "weight": wt, "decisive": False})
    return combine(sigs, cfg_for(w, sp, sn))


def summarise(y, v) -> dict:
    y, v = np.asarray(y), np.asarray(v)
    real, ai = y == 0, y == 1
    return {"FPR_real_to_likely_ai": f"{int(((v == 'likely_ai') & real).sum())}/{int(real.sum())}",
            "FNR_ai_to_likely_real": f"{int(((v == 'likely_real') & ai).sum())}/{int(ai.sum())}",
            "dist_ai": {k: int(((v == k) & ai).sum()) for k in VERDICTS},
            "dist_real": {k: int(((v == k) & real).sum()) for k in VERDICTS},
            "uncertain_share": round(float((v == "uncertain").mean()), 3)}


FN_COST = 3.0


def cost(y, v) -> float:
    y, v = np.asarray(y), np.asarray(v)
    return float(10 * ((v == "likely_ai") & (y == 0)).sum() + FN_COST * ((v == "likely_real") & (y == 1)).sum()
                 + 1 * (v == "uncertain").sum())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--rules", required=True)
    ap.add_argument("--weights", default=str(Path(__file__).resolve().parents[1] / "config" / "weights.yaml"))
    ap.add_argument("--hive-agg", default="ai_mean", choices=["ai_mean", "ai_top25", "ai_max"])
    ap.add_argument("--fn-cost", type=float, default=3.0, help="nested LOO cost of ai->likely_real")
    ap.add_argument("--json")
    a = ap.parse_args()
    global FN_COST
    FN_COST = a.fn_cost
    w = yaml.safe_load(Path(a.weights).read_text())
    rules = {r["url"]: parse_rules(r["signals_detail"]) for r in csv.DictReader(open(a.rules, encoding="utf-8"))}

    allrows = []
    for r in csv.DictReader(open(a.raw, encoding="utf-8")):
        if r.get("fetch_status") != "ok" or r.get("hive_status") != "ok" or not r.get("commfor_raw"):
            continue
        allrows.append({"url": r["url"], "vid": r["video_id"], "y": int(r["label"] == "ai"),
                        "src": r["label_source"], "hive": float(r[f"hive_{a.hive_agg}"]),
                        "hive_mean": float(r["hive_ai_mean"]), "hive_top25": float(r["hive_ai_top25"]),
                        "hive_max": float(r["hive_ai_max"]), "cf": float(r["commfor_raw"]),
                        "cf_top25": float(r["commfor_top25"]), "gen": r.get("hive_top_generator") or "",
                        "deepfake_max": r.get("hive_deepfake_max"), "audio": r.get("hive_audio_ai_max"),
                        "duration": r.get("duration"), "height": r.get("height"),
                        "rules": [s for s in rules.get(r["url"], []) if s["id"] not in ("hive",)]})
    rows = [r for r in allrows if r["vid"] not in EXCLUDE_IDS]
    held = [r for r in allrows if r["vid"] in EXCLUDE_IDS]
    y = np.array([r["y"] for r in rows])
    n = len(rows)
    rep: dict = {"hive_agg": a.hive_agg, "n": n, "n_ai": int(y.sum()), "n_real": int(n - y.sum()),
                 "unverified": [r["vid"] for r in held]}

    # 1. raw AUC
    feats = {k: np.array([r[k] for r in rows]) for k in ("hive_mean", "hive_top25", "hive_max", "cf", "cf_top25")}
    rep["raw_auc"] = {k: {"auc": round(auc(y, v), 3), "ci95": [round(x, 3) for x in boot_ci(y, v)]}
                      for k, v in feats.items()}
    # raw-as-probability standalone verdict bands (no fitting, no cap/floor)
    ens0 = EnsembleConfig(cap_without_strong=None, floor_without_strong=None)
    rep["standalone_raw_bands"] = {}
    for k in ("hive_mean", "hive_top25", "cf"):
        v = [combine([{"id": k, "status": "ok", "score": float(s), "weight": 1.0}], ens0)[1] for s in feats[k]]
        rep["standalone_raw_bands"][k] = summarise(y, v)

    # 2. Platt LOO
    loo = {k: np.zeros(n) for k in ("hive", "cf")}
    X = {"hive": np.array([r["hive"] for r in rows]), "cf": feats["cf"]}
    for i in range(n):
        tr = np.arange(n) != i
        for k in loo:
            loo[k][i] = platt(X[k][i:i + 1], fit_platt(X[k][tr], y[tr]))[0]
    rep["platt_loo"] = {k: {"auc": round(auc(y, loo[k]), 3), "logloss": round(logloss(y, loo[k]), 3)}
                        for k in loo}
    rep["platt_loo"]["base_rate_logloss"] = round(logloss(y, np.full(n, y.mean())), 3)
    rep["platt_loo"]["raw_logloss"] = {k: round(logloss(y, X[k]), 3) for k in X}
    rep["platt_loo"]["hive_standalone_bands"] = summarise(y, [
        combine([{"id": "hive", "status": "ok", "score": float(s), "weight": 1.0}], ens0)[1] for s in loo["hive"]])
    final_ab = fit_platt(X["hive"], y)
    rep["platt_full_fit_hive"] = {"a": round(final_ab[0], 4), "b": round(final_ab[1], 4)}

    # 3. fixed policies (full pipeline + models only)
    V: dict[tuple[str, bool], list[str]] = {}
    P: dict[tuple[str, bool], list] = {}
    rep["policies"] = {}
    for name in POLICIES:
        for mo in (False, True):
            out = [run_policy(r, name, w, float(loo["hive"][i]), mo) for i, r in enumerate(rows)]
            V[(name, mo)], P[(name, mo)] = [o[1] for o in out], [o[0] for o in out]
        rep["policies"][name] = {"pipeline": summarise(y, V[(name, False)]),
                                 "models_only": summarise(y, V[(name, True)]),
                                 "real_p_max_pipeline": max(p for p, yy in zip(P[(name, False)], y) if yy == 0),
                                 "ai_p_min_pipeline": min(p for p, yy in zip(P[(name, False)], y) if yy == 1)}

    # 4. nested LOO policy choice
    for mo in (False, True):
        picked, vv = [], []
        for i in range(n):
            tr = np.arange(n) != i
            best = min(POLICIES, key=lambda nm: (cost(y[tr], np.array(V[(nm, mo)])[tr]), list(POLICIES).index(nm)))
            picked.append(best)
            vv.append(V[(best, mo)][i])
        rep[f"nested_loo_{'models_only' if mo else 'pipeline'}"] = {
            **summarise(y, vv), "picked": {k: picked.count(k) for k in set(picked)}}

    # per-row table
    rep["rows"] = [{"vid": r["vid"], "y": r["y"], "src": r["src"], "hive_mean": round(r["hive_mean"], 4),
                    "hive_top25": round(r["hive_top25"], 4), "cf": round(r["cf"], 3), "gen": r["gen"],
                    "deepfake_max": r["deepfake_max"], "audio": r["audio"], "dur": r["duration"],
                    "h": r["height"], "hive_platt_loo": round(float(loo["hive"][i]), 3),
                    **{nm: V[(nm, False)][i] for nm in ("E0_v2_rules+cf", "E2_hive_strong_both+cf",
                                                          "E4_hive_strong_cap_only+cf")},
                    "E2_models_only": V[("E2_hive_strong_both+cf", True)][i],
                    "E4_models_only": V[("E4_hive_strong_cap_only+cf", True)][i],
                    "E4_p": P[("E4_hive_strong_cap_only+cf", False)][i],
                    "E7": V[("E7_hive_cap_only_w0.5+cf", False)][i],
                    "E7_models_only": V[("E7_hive_cap_only_w0.5+cf", True)][i],
                    "E7_p": P[("E7_hive_cap_only_w0.5+cf", False)][i],
                    "E7_p_models_only": P[("E7_hive_cap_only_w0.5+cf", True)][i]}
                   for i, r in enumerate(rows)]
    rep["unverified_rows"] = [{"vid": r["vid"], "hive_mean": r["hive_mean"], "hive_top25": r["hive_top25"],
                               "cf": r["cf"], "gen": r["gen"],
                               "E0": run_policy(r, "E0_v2_rules+cf", w, None, False)[1],
                               "E2": run_policy(r, "E2_hive_strong_both+cf", w, None, False)[1],
                               "E4": run_policy(r, "E4_hive_strong_cap_only+cf", w, None, False)[1]}
                              for r in held]
    txt = json.dumps(rep, ensure_ascii=False, indent=1, default=float)
    if a.json:
        Path(a.json).write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
