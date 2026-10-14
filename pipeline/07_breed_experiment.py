"""Breed-specific vs size-category vs adult-weight-scaled growth charts: held-out comparison.

The open extract carries disguised breed IDs, so true breed charts can be tested here but not shipped
under breed names. What can be shipped for any named breed is a chart indexed by the breed's expected
adult weight W. Four chart methods are compared on held-out dogs (20% of dogs, split by PET_ID):

  category      the 12 size-category charts (sex x category), refitted on training dogs
  breed         one chart per (disguised breed, sex): the upper bound of what breed curves can give
  scaled        the dog's category chart with M multiplied by W / W_c (W_c = category reference weight)
  interpolated  log M - log W, log S and L interpolated linearly in log W between category references,
                plus log W (equals 'scaled' at the reference weights, adjusts growth timing in between)

Tasks (training dogs fit the charts and the tracking parameters; test dogs are only predicted). The interpolated
chart and the tracking model are the app's: charts.chart_for_weight and tracking.py on log age. Charts are fitted
on the whole selection window as in 02; weights are scored in the app's chart range, 8 weeks to 2 years.
  T1  one early weigh-in (8-16 weeks) -> the dog's last weight from 1 to 2 years (the 'how big will it get' case)
  T2  all earlier weigh-ins (>= 2) -> the last weigh-in
  T3  centring: mean z of each breed's test dogs on the chart (how meaningful the centile label is)

Writes data/derived/breed_experiment.json. `--noise` then adds the T1 sensitivity to errors in the adult weight
(needs the file from a run without it).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import polars as pl

import lms
import tracking
from charts import CATS, GRID_Y, WEEKS_PER_YEAR, TableChart, category_of, chart_for_weight, shrink_factor, shrunk_weight

ROOT = Path(__file__).resolve().parents[1]
DER = ROOT / "data" / "derived"
AGE_POWER, AGE_MIN_Y, AGE_MAX_Y = 0.1, 0.10, 2.30
MIN_BREED_WEIGHTS = 1200


def tx(a):
    return np.power(a, AGE_POWER)


def predict(a_obs, z_obs, a_new, nug, ell):
    """Projected z at age a_new (years) from earlier z-scores, on log age as in the app: mean and sd."""
    mean, var = tracking.gp_predict(np.log(a_obs), z_obs, np.log(a_new), nug, ell)
    return mean, float(np.sqrt(max(var, 1e-8)))


def table_from_fit(fit):
    mu, sigma, nu = fit.params(tx(GRID_Y))
    return TableChart(nu, mu, sigma)


def fit_chart(sub, grid_mu=(1e3, 1e4, 1e5), grid_sigma=(3e2, 3e3, 3e4)):
    spec = lms.LMSSpec(xlo=AGE_MIN_Y ** AGE_POWER, xhi=AGE_MAX_Y ** AGE_POWER, nseg_mu=16, nseg_sigma=8, nseg_nu=3)
    return lms.select_lambdas(tx(sub["age_y"].to_numpy()), sub["kg"].to_numpy(), spec, grid_mu=list(grid_mu), grid_sigma=list(grid_sigma), lam_nu=1e3)


def make_scaled(cat_tables, refs, sex, W):
    """Category chart of W, median scaled by W / W_c."""
    c = category_of(W)
    t = cat_tables[(c, sex)]
    return TableChart(t.L, t.M * W / refs[(c, sex)], t.S)


def load_split():
    """Selected weights split 80/20 by dog. Charts are fitted on the training weights over the whole selection window
    (0.10-2.30 years, as in 02); z-scores, tracking and predictions use weights in the app's chart range (8 weeks to
    2 years), where the weekly tables are defined. Returns (train, test); test holds only weights in the chart range."""
    d = pl.read_parquet(DER / "visits_selected.parquet").with_columns(
        (pl.col("BREED_ID").cast(pl.Utf8) + "_" + pl.col("sex")).alias("bkey"), ((pl.col("PET_ID") * 2654435761) % 100 < 20).alias("test"),
        ((pl.col("age_y") >= GRID_Y[0]) & (pl.col("age_y") <= GRID_Y[-1])).alias("in_grid"))
    return d.filter(~pl.col("test")), d.filter(pl.col("test") & pl.col("in_grid"))


def summarise(errs, zres):
    errs, zres = np.asarray(errs), np.asarray(zres)
    return {"n": len(errs), "rmse_log_kg": round(float(np.sqrt(np.mean(errs ** 2))), 4), "median_abs_pct": round(float(100 * np.median(np.abs(np.expm1(errs)))), 2),
            "mean_bias_pct": round(float(100 * np.mean(np.expm1(errs))), 2),
            "cover50": round(float(np.mean(np.abs(zres) < 0.6745)), 3), "cover90": round(float(np.mean(np.abs(zres) < 1.645)), 3), "cover95": round(float(np.mean(np.abs(zres) < 1.96)), 3)}


def main():
    train, test = load_split()
    print(f"train {train.height} weights / {train['PET_ID'].n_unique()} dogs; test {test.height} / {test['PET_ID'].n_unique()} in the chart range")

    # category charts on training dogs, with their reference adult weights (geometric mean of breed W over weights)
    cat_tables, refs = {}, {}
    for c in CATS:
        for sex in ("F", "M"):
            sub = train.filter((pl.col("cat") == c) & (pl.col("sex") == sex))
            cat_tables[(c, sex)] = table_from_fit(fit_chart(sub, grid_mu=(3e3, 1e4), grid_sigma=(3e2, 3e3, 3e4)))
            refs[(c, sex)] = float(np.exp(np.mean(np.log(sub["breed_adult_kg"].to_numpy()))))
            print("category", c, sex, "W_ref", round(refs[(c, sex)], 2))
    # breed charts on training dogs
    counts = train.group_by("bkey").len()
    bkeys = counts.filter(pl.col("len") >= MIN_BREED_WEIGHTS)["bkey"].to_list()
    breed_tables = {k: table_from_fit(fit_chart(train.filter(pl.col("bkey") == k))) for k in bkeys}
    print(len(bkeys), "breed charts")

    def chart_for(method, row):
        sex, c, W, bk = row["sex"], row["cat"], row["breed_adult_kg"], row["bkey"]
        if method == "category":
            return cat_tables[(c, sex)]
        if method == "breed":
            return breed_tables.get(bk)
        if method == "scaled":
            return make_scaled(cat_tables, refs, sex, W)
        return chart_for_weight(cat_tables, refs, sex, W)

    methods = ["category", "breed", "scaled", "interpolated"]
    # restrict every comparison to dogs whose breed has a breed chart (same dogs for all methods)
    train_b, test_b = train.filter(pl.col("bkey").is_in(bkeys) & pl.col("in_grid")), test.filter(pl.col("bkey").is_in(bkeys))

    def dog_series(df, method):
        out = []
        for _, g in df.sort(["PET_ID", "age_y"]).group_by("PET_ID", maintain_order=True):
            row = g.row(0, named=True)
            ch = chart_for(method, row)
            a, kg = g["age_y"].to_numpy(), g["kg"].to_numpy()
            out.append((row, a, kg, ch.z(a, kg), ch))
        return out

    results, track = {}, {}
    for m in methods:
        tr = dog_series(train_b, m)
        nug, ell, _ = tracking.fit([(np.log(a), z) for _, a, _, z, _ in tr])
        track[m] = {"nugget": round(nug, 4), "ell": round(ell, 3)}
        te = dog_series(test_b, m)
        t1e, t1z, t2e, t2z, centring = [], [], [], [], {}
        for row, a, kg, z, ch in te:
            centring.setdefault(row["bkey"], []).extend(z.tolist())
            first = np.where((a * WEEKS_PER_YEAR >= 8) & (a * WEEKS_PER_YEAR <= 16))[0]
            late = np.where(a >= 1.0)[0]
            if len(first) and len(late):
                i, j = first[0], late[-1]
                mz, sd = predict(a[i:i + 1], z[i:i + 1], a[j], nug, ell)
                pred = float(ch.kg(a[j], mz)); t1e.append(np.log(kg[j]) - np.log(pred)); t1z.append((z[j] - mz) / sd)
            if len(a) >= 3:
                mz, sd = predict(a[:-1], z[:-1], a[-1], nug, ell)
                pred = float(ch.kg(a[-1], mz)); t2e.append(np.log(kg[-1]) - np.log(pred)); t2z.append((z[-1] - mz) / sd)
        cz = np.array([np.mean(v) for v in centring.values()])
        results[m] = {"T1_one_early_weighin_to_adult": summarise(t1e, t1z), "T2_last_from_previous": summarise(t2e, t2z),
                      "T3_breed_centring": {"median_abs_breed_mean_z": round(float(np.median(np.abs(cz))), 3), "max_abs_breed_mean_z": round(float(np.max(np.abs(cz))), 3)},
                      "tracking": track[m]}
        print(m, json.dumps(results[m]))

    out = {"split": "20% of dogs held out by PET_ID hash", "n_breed_charts": len(bkeys), "min_breed_weights": MIN_BREED_WEIGHTS,
           "n_test_dogs": test_b["PET_ID"].n_unique(), "results": results,
           "category_reference_weights": {f"{c}_{s}": round(w, 3) for (c, s), w in refs.items()}}
    (DER / "breed_experiment.json").write_text(json.dumps(out, indent=1))


def shrink_factors(d):
    """k_c = tau_c^2 / (tau_c^2 + sigma^2): tau_c = SD of log breed weight among the category's dogs (charts.shrink_factor)."""
    return {c: shrink_factor(float(np.var(np.log(d.filter(pl.col("cat") == c).group_by("PET_ID", maintain_order=True)
                                                    .agg(pl.col("breed_adult_kg").first())["breed_adult_kg"].to_numpy()))))
            for c in CATS}


def noise_sensitivity(sigmas=(0.0, 0.05, 0.10, 0.15, 0.20), seeds=(1, 2, 3, 4, 5, 6, 7, 8)):
    """T1 when the adult weight W is known only with log-normal error per breed (as from breed standards).

    Methods: category; interpolated at the noisy W; shrunk = interpolated at W shrunk toward the category
    reference by k_c (from the within-category spread of breed weights and an assumed 10% error).
    Each sigma is averaged over several draws of the per-breed errors.
    """
    train, test = load_split()
    k = shrink_factors(train)
    cat_tables, refs = {}, {}
    for c in CATS:
        for sex in ("F", "M"):
            sub = train.filter((pl.col("cat") == c) & (pl.col("sex") == sex))
            cat_tables[(c, sex)] = table_from_fit(fit_chart(sub, grid_mu=(3e3, 1e4), grid_sigma=(3e2, 3e3, 3e4)))
            refs[(c, sex)] = float(np.exp(np.mean(np.log(sub["breed_adult_kg"].to_numpy()))))
    exp = json.loads((DER / "breed_experiment.json").read_text())["results"]
    trk = {"category": exp["category"]["tracking"], "interpolated": exp["interpolated"]["tracking"], "shrunk": exp["interpolated"]["tracking"]}
    cases = []
    for _, g in test.sort(["PET_ID", "age_y"]).group_by("PET_ID", maintain_order=True):
        a, kg = g["age_y"].to_numpy(), g["kg"].to_numpy()
        first = np.where((a * WEEKS_PER_YEAR >= 8) & (a * WEEKS_PER_YEAR <= 16))[0]
        late = np.where(a >= 1.0)[0]
        if len(first) and len(late):
            row = g.row(0, named=True)
            cases.append((row["BREED_ID"], row["sex"], row["breed_adult_kg"], a[first[0]], kg[first[0]], a[late[-1]], kg[late[-1]]))
    breeds = sorted({c[0] for c in cases})
    out = {}
    for sigma in sigmas:
        agg = {m: {"rmse": [], "mae": []} for m in ("category", "interpolated", "shrunk")}
        for seed in seeds:
            rng = np.random.default_rng(seed)
            noise = {b: float(np.exp(sigma * rng.standard_normal())) for b in breeds}
            errs = {m: [] for m in agg}
            for b, sex, w_true, a0, kg0, a1, kg1 in cases:
                W = w_true * noise[b]
                charts = {"category": cat_tables[(category_of(W), sex)], "interpolated": chart_for_weight(cat_tables, refs, sex, W),
                          "shrunk": chart_for_weight(cat_tables, refs, sex, shrunk_weight(W, refs, sex, k))}
                for m, ch in charts.items():
                    z0 = float(ch.z(np.array([a0]), np.array([kg0]))[0])
                    mz, _ = predict(np.array([a0]), np.array([z0]), a1, trk[m]["nugget"], trk[m]["ell"])
                    errs[m].append(np.log(kg1) - np.log(float(ch.kg(a1, mz))))
            for m, v in errs.items():
                v = np.array(v)
                agg[m]["rmse"].append(float(np.sqrt(np.mean(v ** 2)))); agg[m]["mae"].append(float(100 * np.median(np.abs(np.expm1(v)))))
        out[str(sigma)] = {m: {"rmse_log_kg": round(float(np.mean(v["rmse"])), 4), "median_abs_pct": round(float(np.mean(v["mae"])), 2)} for m, v in agg.items()}
        print("sigma", sigma, out[str(sigma)], flush=True)
    res = json.loads((DER / "breed_experiment.json").read_text())
    res["T1_adult_weight_error_sensitivity"] = {"n_dogs": len(cases), "draws_per_sigma": len(seeds), "shrink_factors": {c: round(v, 3) for c, v in k.items()},
                                                "sigma_assumed_for_shrinkage": 0.10, "results": out}
    (DER / "breed_experiment.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Held-out comparison of size-group, breed, scaled and interpolated growth charts.")
    ap.add_argument("--noise", action="store_true", help="add the T1 sensitivity to adult-weight errors to data/derived/breed_experiment.json")
    if ap.parse_args().noise:
        if not (DER / "breed_experiment.json").exists():
            ap.error("--noise needs data/derived/breed_experiment.json from a run without --noise")
        noise_sensitivity()
    else:
        main()
