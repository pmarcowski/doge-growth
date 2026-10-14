"""Fit the centile-tracking model: how a puppy's z-score at one age predicts its z-score at another.

Model (tracking.py): z(s) = eta(s) + e, with cov(eta(s), eta(s')) = (1 - nugget) * exp(-|s - s'| / ell) and
var(e) = nugget, on s = transformed age. Parameters (nugget, ell) are fitted by maximum likelihood over all dogs
with >= 2 weights, for Box-Cox transforms of age in years with power q = -0.5, -0.25, 0 (log age), 0.1,
0.25 and 0.5; the best-fitting one is kept.

Validation: for every dog with >= 3 weights, predict the last z from the earlier ones; report the
error, interval coverage and the comparison with 'same centile forever'. These dogs are also the fitting
dogs (two parameters fitted on 38,608 dogs); the held-out check is T2 in 07_breed_experiment.py.

Reads  data/derived/visits_z.parquet
Writes app/model/tracking.json, data/derived/tracking_fit.json, data/derived/figures/tracking_*.png
"""
from __future__ import annotations

import json
from itertools import pairwise
from pathlib import Path

import numpy as np
import polars as pl
from scipy.stats import norm

import tracking

ROOT = Path(__file__).resolve().parents[1]
DER = ROOT / "data" / "derived"
FIG = DER / "figures"
APP_MODEL = ROOT / "app" / "model"

def _boxcox(q):
    return (lambda a: (np.power(a, q) - 1.0) / q) if q != 0 else np.log


# Box-Cox transforms of age in years: q = 0 is log age; negative q stretches early ages more, positive q less.
TRANSFORMS = {"log": np.log, **{f"boxcox{q:g}": _boxcox(q) for q in (-0.5, -0.25, 0.1, 0.25, 0.5)}}


def dog_blocks(df: pl.DataFrame, transform):
    """Return list of (s, z) arrays per dog with >= 2 weights, sorted by age."""
    df = df.sort(["PET_ID", "age_y"], maintain_order=True)
    blocks = []
    for _, g in df.group_by("PET_ID", maintain_order=True):
        if g.height < 2:
            continue
        blocks.append((transform(g["age_y"].to_numpy()), g["z"].to_numpy()))
    return blocks


def empirical_corr(blocks, lag_edges, s_lo=None, s_hi=None):
    """Correlation of z pairs by lag bin, optionally restricted to a starting-age window."""
    pairs = []
    for s, z in blocks:
        n = len(s)
        for i in range(n):
            if s_lo is not None and not (s_lo <= s[i] < s_hi):
                continue
            for j in range(i + 1, n):
                pairs.append((s[j] - s[i], z[i], z[j]))
    p = np.array(pairs)
    out = []
    for lo, hi in pairwise(lag_edges):
        m = (p[:, 0] >= lo) & (p[:, 0] < hi)
        if m.sum() >= 200:
            out.append({"lag_mid": float((lo + hi) / 2), "n": int(m.sum()), "corr": float(np.corrcoef(p[m, 1], p[m, 2])[0, 1])})
    return out


def fit_kind(df: pl.DataFrame, zcol: str, transforms: dict) -> dict:
    """Fit the tracking model to one kind of z-score; returns params, fit table, empirical correlations, validation."""
    df = df.select("PET_ID", "age_y", pl.col(zcol).alias("z"))
    results = {}
    for name, tf in transforms.items():
        blocks = dog_blocks(df, tf)
        nug, ell, nll = tracking.fit(blocks)
        results[name] = {"nugget": nug, "ell": ell, "negloglik": nll, "n_dogs": len(blocks), "n_weights": int(sum(len(b[0]) for b in blocks))}
        print(zcol, name, results[name], flush=True)
    best_name = min(results, key=lambda k: results[k]["negloglik"])
    nug, ell = results[best_name]["nugget"], results[best_name]["ell"]
    blocks = dog_blocks(df, transforms[best_name])

    # empirical correlation by starting age, for the figure
    s_all = np.concatenate([b[0] for b in blocks])
    smax = float(s_all.max() - s_all.min())
    lag_edges = np.linspace(0, smax, 16)
    windows = {"all": (None, None)}
    qs = np.quantile(s_all, [0, 1 / 3, 2 / 3, 1])
    for i in range(3):
        windows[f"start_tercile_{i + 1}"] = (float(qs[i]), float(qs[i + 1]) + (1e-9 if i == 2 else 0))
    emp = {w: empirical_corr(blocks, lag_edges, *windows[w]) for w in windows}

    # validation: predict the last weight of each dog with >= 3 weights from the earlier ones
    rows = []
    for s, z in blocks:
        if len(s) < 3:
            continue
        m, v = tracking.gp_predict(s[:-1], z[:-1], s[-1], nug, ell)
        rows.append({"lag": s[-1] - s[-2], "z_true": z[-1], "z_pred": m, "sd_pred": np.sqrt(v), "z_naive": z[-2], "n_obs": len(s) - 1})
    v = pl.DataFrame(rows)
    err = (v["z_true"] - v["z_pred"]).to_numpy()
    err_naive = (v["z_true"] - v["z_naive"]).to_numpy()
    zres = err / v["sd_pred"].to_numpy()
    validation = {
        "n_dogs": v.height, "rmse_gp": float(np.sqrt(np.mean(err ** 2))), "rmse_same_centile": float(np.sqrt(np.mean(err_naive ** 2))),
        "rmse_population_median": float(np.sqrt(np.mean(v["z_true"].to_numpy() ** 2))), "mean_pred_sd": float(v["sd_pred"].mean()),
        "coverage": {f"{int(c * 100)}%": float(np.mean(np.abs(zres) < norm.ppf(0.5 + c / 2))) for c in (0.5, 0.8, 0.95)},
    }
    by_n = []
    for k in (2, 3, 4, 5):
        m = (v["n_obs"].to_numpy() == k) if k < 5 else (v["n_obs"].to_numpy() >= 5)
        if m.sum() > 50:
            by_n.append({"n_prior_weights": k if k < 5 else "5+", "n": int(m.sum()), "rmse_gp": float(np.sqrt(np.mean(err[m] ** 2))),
                         "rmse_same_centile": float(np.sqrt(np.mean(err_naive[m] ** 2))), "cover95": float(np.mean(np.abs(zres[m]) < 1.96))})
    validation["by_n_prior"] = by_n
    print(zcol, json.dumps(validation), flush=True)
    return {"transform": best_name, "nugget": nug, "ell": ell, "fits": results, "empirical_corr": emp, "validation": validation, "smax": smax,
            "n_dogs": results[best_name]["n_dogs"], "n_weights": results[best_name]["n_weights"]}


def main() -> None:
    df = pl.read_parquet(DER / "visits_z.parquet")
    kinds = {"weight": fit_kind(df, "z_w", TRANSFORMS), "category": fit_kind(df, "z_cat", TRANSFORMS)}

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    k = kinds["weight"]
    fig, ax = plt.subplots(figsize=(8, 5), dpi=110)
    lag = np.linspace(0, k["smax"], 200)
    ax.plot(lag, (1 - k["nugget"]) * np.exp(-lag / k["ell"]), color="#1a73e8", lw=2, label=f"fitted: (1 - {k['nugget']:.2f}) exp(-lag / {k['ell']:.2f})")
    for w, pts in k["empirical_corr"].items():
        if pts:
            ax.plot([p["lag_mid"] for p in pts], [p["corr"] for p in pts], "o-", ms=4, lw=1, alpha=0.8, label=f"empirical, {w}")
    ax.set_xlabel(f"lag in transformed age ({k['transform']})")
    ax.set_ylabel("correlation of z-scores within dog")
    ax.set_ylim(0, 1)
    ax.grid(alpha=0.3)
    ax.legend(fontsize=8)
    ax.set_title("Centile tracking on breed-adjusted charts: within-dog correlation by age gap")
    fig.tight_layout()
    fig.savefig(FIG / "tracking_correlation.png")
    plt.close(fig)

    out = {
        "note": "corr(z(s), z(s')) = (1 - nugget) * exp(-|s - s'| / ell), s = transformed age in years; nugget = share of z variance that is "
                "measurement/short-term noise. 'weight' = z on breed-adjusted charts (used when a breed or adult weight is known); "
                "'category' = z on the size-category charts (used when the chart is fitted to the weigh-ins). Maximum likelihood on dogs with >= 2 weights.",
    }
    for name, kd in kinds.items():
        out[name] = {"transform": kd["transform"], "nugget": round(kd["nugget"], 4), "ell": round(kd["ell"], 4), "n_dogs": kd["n_dogs"], "n_weights": kd["n_weights"],
                     "validation": {key: kd["validation"][key] for key in ("n_dogs", "rmse_gp", "rmse_same_centile", "rmse_population_median", "coverage")}}
    APP_MODEL.mkdir(parents=True, exist_ok=True)
    (APP_MODEL / "tracking.json").write_text(json.dumps(out, indent=1))
    (DER / "tracking_fit.json").write_text(json.dumps({name: {key: v for key, v in kd.items() if key != "smax"} for name, kd in kinds.items()}, indent=1))


if __name__ == "__main__":
    main()
