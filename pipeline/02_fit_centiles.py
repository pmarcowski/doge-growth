"""Fit LMS growth centiles by sex x expected-adult-weight category (Salt et al. 2017 categories).

Reads  data/derived/visits_selected.parquet (from 01_prepare.py)
Writes data/derived/centiles_fit.json       full fit objects (knots, coefficients, edf, calibration)
       data/derived/visits_z.parquet        every retained weight with its z-scores: z_cat on the category chart,
                                            z_w on the breed-adjusted chart for the breed's adult weight (input to 03)
       data/derived/figures/centiles_*.png  centile fans over the data, one per model
       app/model/centiles.json              weekly L, M, S tables 8-104 weeks, reference adult weights for the app

`--reuse` rebuilds the exports from data/derived/centiles_fit.json without refitting.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import polars as pl

import charts as chartlib
import lms

ROOT = Path(__file__).resolve().parents[1]
DER = ROOT / "data" / "derived"
FIG = DER / "figures"
FIG.mkdir(parents=True, exist_ok=True)
APP_MODEL = ROOT / "app" / "model"
APP_MODEL.mkdir(parents=True, exist_ok=True)

WEEKS_PER_YEAR, GRID_WEEKS = chartlib.WEEKS_PER_YEAR, chartlib.GRID_WEEKS  # 8 weeks to 2 years, weekly
AGE_POWER = 0.1  # Salt et al. 2017: age transformed as age^0.1
AGE_MIN_Y, AGE_MAX_Y = 0.10, 2.30

CENTILES = [0.004, 0.02, 0.09, 0.25, 0.5, 0.75, 0.91, 0.98, 0.996]


def tx(age_y: np.ndarray) -> np.ndarray:
    return np.power(age_y, AGE_POWER)


def fit_one(sub: pl.DataFrame, key: str) -> tuple[lms.LMSFit, dict]:
    x = tx(sub["age_y"].to_numpy())
    y = sub["kg"].to_numpy()
    spec = lms.LMSSpec(xlo=AGE_MIN_Y ** AGE_POWER, xhi=AGE_MAX_Y ** AGE_POWER, nseg_mu=16, nseg_sigma=8, nseg_nu=3)
    t0 = time.time()
    fit = lms.select_lambdas(
        x, y, spec,
        grid_mu=[3e2, 1e3, 3e3, 1e4, 3e4, 1e5], grid_sigma=[1e2, 3e2, 1e3, 3e3, 1e4, 3e4], lam_nu=1e3,
    )
    z = fit.zscore(x, y)
    calib = lms.calibration_table(z, x)
    info = {
        "n_weights": len(y), "n_dogs": int(sub["PET_ID"].n_unique()), "n_breeds": int(sub["BREED_ID"].n_unique()),
        "lambdas": list(fit.lambdas), "edf": [round(e, 2) for e in fit.edf], "loglik": round(fit.loglik, 1),
        "sbc": round(fit.gaic, 1), "fit_seconds": round(time.time() - t0, 1), "calibration": calib,
        "z_mean": float(z.mean()), "z_sd": float(z.std()), "z_excess_kurtosis": float(((z - z.mean()) ** 4).mean() / z.std() ** 4 - 3),
    }
    print(f"{key}: n={len(y)} dogs={info['n_dogs']} lambdas={fit.lambdas} edf={info['edf']} sbc={info['sbc']} ({info['fit_seconds']}s)")
    return fit, info


def plot_model(fit: lms.LMSFit, sub: pl.DataFrame, key: str, title: str) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from scipy.stats import norm

    rng = np.random.default_rng(1)
    n = min(sub.height, 6000)
    idx = rng.choice(sub.height, n, replace=False)
    age_wk = sub["age_y"].to_numpy()[idx] * WEEKS_PER_YEAR
    kg = sub["kg"].to_numpy()[idx]
    fig, ax = plt.subplots(figsize=(9, 5.5), dpi=110)
    ax.scatter(age_wk, kg, s=3, alpha=0.15, color="#555", linewidths=0)
    grid_y = GRID_WEEKS / WEEKS_PER_YEAR
    for c in CENTILES:
        yy = fit.centile(tx(grid_y), norm.ppf(c))
        ax.plot(GRID_WEEKS, yy, color="#1a73e8" if c == 0.5 else "#8ab4f8", lw=2 if c == 0.5 else 1)
        ax.text(GRID_WEEKS[-1] + 1, yy[-1], f"{c * 100:g}", fontsize=7, va="center", color="#1a73e8")
    ax.set_xlabel("Age (weeks)")
    ax.set_ylabel("Body weight (kg)")
    ax.set_title(title)
    ax.set_xlim(8, 110)
    ax.set_ylim(0, None)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(FIG / f"centiles_{key}.png")
    plt.close(fig)


def load_fits() -> tuple[dict, dict]:
    full = json.loads((DER / "centiles_fit.json").read_text())["models"]
    fits, infos = {}, {}
    for key, m in full.items():
        fits[key] = lms.LMSFit(lms.LMSSpec(**m["spec"]), np.array(m["knots_mu"]), np.array(m["knots_sigma"]), np.array(m["knots_nu"]),
                               np.array(m["beta_mu"]), np.array(m["beta_sigma"]), np.array(m["beta_nu"]), tuple(m["lambdas"]), m["loglik"],
                               tuple(m["edf"]), m["sbc"], m["n_weights"])
        infos[key] = {k: v for k, v in m.items() if not k.startswith(("knots_", "beta_", "spec"))}
    return fits, infos


def main() -> None:
    ap = argparse.ArgumentParser(description="Fit the 12 LMS centile models and export the app's chart tables.")
    ap.add_argument("--reuse", action="store_true", help="rebuild the exports from data/derived/centiles_fit.json without refitting")
    reuse = ap.parse_args().reuse
    if reuse and not (DER / "centiles_fit.json").exists():
        ap.error("--reuse needs data/derived/centiles_fit.json from an earlier full run")
    # sorted, so every output (and the z-score table that 03 fits) comes out in the same order on every run
    d = pl.read_parquet(DER / "visits_selected.parquet").filter((pl.col("age_y") >= AGE_MIN_Y) & (pl.col("age_y") <= AGE_MAX_Y)).sort(["PET_ID", "age_y", "kg"])
    if reuse:
        fits, infos = load_fits()
    else:
        fits, infos = {}, {}
        groups = {g["id"]: g for g in chartlib.size_groups_json()}
        for cat in chartlib.CATS:
            g = groups[cat]
            span = (f"under {g['max_kg']:g} kg" if not g["min_kg"] else f"{g['min_kg']:g} kg and over; provisional" if g["max_kg"] is None
                    else f"{g['min_kg']:g} to under {g['max_kg']:g} kg")
            for sex in ("F", "M"):
                key = f"{cat}_{sex}"
                sub = d.filter((pl.col("cat") == cat) & (pl.col("sex") == sex))
                fit, info = fit_one(sub, key)
                fits[key], infos[key] = fit, info
                plot_model(fit, sub, key, f"{g['label']} ({span}), {'female' if sex == 'F' else 'male'}: centiles 0.4-99.6 over {sub.height:,} weights from {info['n_dogs']:,} dogs")

    # ---- reference adult weight of each chart and the breed-weight range of each category ----
    refs, ranges = {}, {}
    for key in fits:
        cat, sex = key.split("_")
        sub = d.filter((pl.col("cat") == cat) & (pl.col("sex") == sex))
        refs[(cat, sex)] = float(np.exp(np.mean(np.log(sub["breed_adult_kg"].to_numpy()))))
    shrink = {}
    for cat in chartlib.CATS:
        w = d.filter(pl.col("cat") == cat)["breed_adult_kg"]
        ranges[cat] = [round(float(w.min()), 2), round(float(w.max()), 2)]
        per_dog = d.filter(pl.col("cat") == cat).group_by("PET_ID", maintain_order=True).agg(pl.col("breed_adult_kg").first())["breed_adult_kg"].to_numpy()
        shrink[cat] = chartlib.shrink_factor(float(np.var(np.log(per_dog))))
    print("shrink factors", {c: round(v, 3) for c, v in shrink.items()})

    # ---- weekly tables (what the app uses) and z-scores on category and breed-adjusted charts ----
    grid_y = GRID_WEEKS / WEEKS_PER_YEAR
    tables = {}
    for key, fit in fits.items():
        cat, sex = key.split("_")
        mu, sigma, nu = fit.params(tx(grid_y))
        tables[(cat, sex)] = chartlib.TableChart(np.round(nu, 4), np.round(mu, 4), np.round(sigma, 5))
    zparts = []
    in_grid = d.filter((pl.col("age_y") >= GRID_WEEKS[0] / WEEKS_PER_YEAR) & (pl.col("age_y") <= GRID_WEEKS[-1] / WEEKS_PER_YEAR))
    for (_, sex), g in in_grid.group_by(["BREED_ID", "sex"], maintain_order=True):
        a, kg = g["age_y"].to_numpy(), g["kg"].to_numpy()
        cat = g["cat"][0]
        z_cat = tables[(cat, sex)].z(a, kg)
        w_used = chartlib.shrunk_weight(float(g["breed_adult_kg"][0]), refs, sex, shrink)
        z_w = chartlib.chart_for_weight(tables, refs, sex, w_used).z(a, kg)
        zparts.append(g.with_columns(pl.Series("z_cat", z_cat), pl.Series("z_w", z_w), pl.lit(f"{cat}_{sex}").alias("model")))
    z = pl.concat(zparts)
    z.write_parquet(DER / "visits_z.parquet")
    print("z_cat mean/sd", round(float(z["z_cat"].mean()), 3), round(float(z["z_cat"].std()), 3), "| z_w mean/sd", round(float(z["z_w"].mean()), 3), round(float(z["z_w"].std()), 3))

    # ---- full fit objects for reproducibility (a --reuse run leaves the saved file as it is) ----
    if not reuse:
        full = {
            key: {
                **infos[key],
                "spec": fits[key].spec.__dict__,
                "knots_mu": fits[key].knots_mu.tolist(), "knots_sigma": fits[key].knots_sigma.tolist(), "knots_nu": fits[key].knots_nu.tolist(),
                "beta_mu": fits[key].beta_mu.tolist(), "beta_sigma": fits[key].beta_sigma.tolist(), "beta_nu": fits[key].beta_nu.tolist(),
            }
            for key in fits
        }
        (DER / "centiles_fit.json").write_text(json.dumps({"age_power": AGE_POWER, "models": full}, indent=1))

    # ---- app tables: weekly L (nu), M (mu), S (sigma) ---------------------------------
    charts = {}
    for key in fits:
        cat, sex = key.split("_")
        t = tables[(cat, sex)]
        charts[key] = {
            "category": cat, "sex": sex, "n_weights": infos[key]["n_weights"], "n_dogs": infos[key]["n_dogs"],
            "ref_adult_kg": round(refs[(cat, sex)], 3), "breed_weight_range": ranges[cat],
            "L": [float(v) for v in t.L], "M": [float(v) for v in t.M], "S": [float(v) for v in t.S],
        }
    out = {
        "source": "Refitted from Salt C, Morris PJ, German AJ et al. (2017) supporting data, University of Liverpool Data Catalogue "
                  "doi:10.17638/datacat.liverpool.ac.uk/377 (CC BY 4.0), using the selection rules of PLOS ONE 12(9):e0182064.",
        "method": "Box-Cox Cole-Green (LMS) distribution; log M, log S and L as P-splines in age^0.1; smoothing by SBC; "
                  "weights taken while intact from healthy purebred dogs in normal body condition to 3 years.",
        "age_weeks": GRID_WEEKS.tolist(),
        "centiles_drawn": CENTILES,
        "size_groups": chartlib.size_groups_json(),
        "breed_adjusted": "Chart for a sexes-pooled breed mean adult weight W: log M - log W, log S and L interpolated linearly in log W "
                          "between the charts' reference weights (ref_adult_kg), plus log W; scaled from the end charts beyond them. "
                          "Breed weights from the breed table are first shrunk toward their category's reference weight by shrink[category].",
        "shrink": {c: round(v, 4) for c, v in shrink.items()},
        "shrink_sigma_assumed": chartlib.SIGMA_ASSUMED,
        "charts": charts,
    }
    (APP_MODEL / "centiles.json").write_text(json.dumps(out, separators=(",", ":")))
    print("wrote", APP_MODEL / "centiles.json", (APP_MODEL / "centiles.json").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
