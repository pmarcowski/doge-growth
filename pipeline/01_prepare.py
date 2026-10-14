"""Prepare the open Banfield growth extract (Liverpool DataCat 377, CC BY 4.0) for centile fitting.

Replicates the dog-selection rules of Salt et al. 2017 (PLOS ONE 12:e0182064) as far as the
anonymised extract allows:
  * purebred dogs (the extract is purebred only); weights taken while intact (never neutered, or
    dated before a recorded neuter date),
  * visits for preventive care or with a 'Healthy pet' diagnosis,
  * body condition 'Normal' (recorded, else predicted) at every visit with a score,
    and at least one 'Normal' score at 2-3 years of age,
  * weights between AGE_MIN and AGE_MAX years,
  * outlier removal: > 3x the category median adult weight; outside 150% of the box-plot
    whiskers within 40 age bins; within-dog residual z-score > 3.

Outputs:
  data/derived/visits_selected.parquet   one row per retained weight
  data/derived/prepare_summary.json      counts at each selection step
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import polars as pl

from charts import SIZE_GROUPS

ROOT = Path(__file__).resolve().parents[1]
RAW_DEFAULT = ROOT / "data" / "raw" / "datacat377" / "Final_Data_PLOS.csv"
OUT = ROOT / "data" / "derived"
OUT.mkdir(parents=True, exist_ok=True)

AGE_MIN, AGE_MAX = 0.10, 2.30  # years kept for modelling (charts are drawn 8 wk - 2 y)


def category(expr: pl.Expr) -> pl.Expr:
    """Size group of an expected adult weight (charts.SIZE_GROUPS)."""
    out, lo = pl.lit(None, dtype=pl.Utf8), 0.0
    for name, _, hi in SIZE_GROUPS:
        out = pl.when((expr >= lo) & (expr < hi) if hi is not None else expr >= lo).then(pl.lit(name)).otherwise(out)
        lo = hi
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Apply the selection rules of Salt et al. 2017 to the open Banfield extract.")
    ap.add_argument("raw_csv", nargs="?", type=Path, default=RAW_DEFAULT, help="Final_Data_PLOS.csv from DataCat 377 (default: %(default)s)")
    args = ap.parse_args()
    summary: dict[str, object] = {}
    lf = pl.scan_csv(
        args.raw_csv,
        schema_overrides={
            "BREED_ID": pl.Int32, "PET_ID": pl.Int64, "GENDER": pl.Utf8, "NEUTER_DATE": pl.Utf8,
            "VISIT_DATE": pl.Utf8, "VISIT_AGE": pl.Float64, "WEIGHT": pl.Float64,
            "BCS_RECORDED": pl.Utf8, "BCS_PREDICTED": pl.Utf8, "PREVENTIVE_CARE_VISIT": pl.Utf8,
            "HEALTHY_PET_DIAGNOSIS": pl.Utf8, "AV_BREED_WEIGHT": pl.Float64,
        },
        null_values=[""],
    ).with_columns(
        pl.col("VISIT_DATE").str.slice(0, 10).str.to_date(strict=False).alias("visit_date"),
        pl.col("NEUTER_DATE").str.to_date(strict=False).alias("neuter_date"),
        pl.coalesce(
            pl.when(pl.col("BCS_RECORDED") != "None").then(pl.col("BCS_RECORDED")),
            pl.when(pl.col("BCS_PREDICTED") != "None").then(pl.col("BCS_PREDICTED")),
        ).cast(pl.Categorical).alias("BCS"),
        pl.col("VISIT_AGE").cast(pl.Float32).alias("age_y"),
        pl.col("WEIGHT").cast(pl.Float32),
        pl.col("AV_BREED_WEIGHT").cast(pl.Float32),
        ((pl.col("PREVENTIVE_CARE_VISIT") == "Y") | (pl.col("HEALTHY_PET_DIAGNOSIS") == "Y")).alias("healthy_visit"),
    ).with_columns(
        # weight taken while the dog was intact: never neutered, or before a known neuter date
        (pl.col("GENDER").is_in(["M", "F"]) | (pl.col("neuter_date").is_not_null() & (pl.col("visit_date") < pl.col("neuter_date")))).alias("intact_at_visit"),
        pl.col("GENDER").cast(pl.Categorical),
    ).select("BREED_ID", "PET_ID", "GENDER", "age_y", "WEIGHT", "BCS", "healthy_visit", "intact_at_visit", "AV_BREED_WEIGHT")
    df = lf.collect(engine="streaming")
    summary["rows_raw"] = df.height
    summary["dogs_raw"] = df["PET_ID"].n_unique()
    summary["breeds_raw"] = df["BREED_ID"].n_unique()
    summary["gender_counts"] = df.group_by(pl.col("GENDER").cast(pl.Utf8)).len().sort("GENDER").to_dict(as_series=False)
    summary["age_quantiles_y"] = {str(q): float(df["age_y"].quantile(q)) for q in (0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99)}
    bins = np.arange(0, 3.05, 0.05)
    hist, _ = np.histogram(df["age_y"].to_numpy(), bins=bins)
    summary["age_hist_0.05y"] = {f"{b:.2f}": int(h) for b, h in zip(bins[:-1], hist, strict=True)}

    # ---- dog-level criteria -------------------------------------------------------------
    dog = df.group_by("PET_ID").agg(
        pl.col("GENDER").cast(pl.Utf8).last().alias("gender"),
        pl.col("BREED_ID").first().alias("breed_id"),
        pl.col("AV_BREED_WEIGHT").first().alias("breed_adult_kg"),
        (pl.col("BCS").cast(pl.Utf8).is_in(["Thin", "Heavy"])).any().alias("ever_abnormal_bcs"),
        ((pl.col("BCS").cast(pl.Utf8) == "Normal") & (pl.col("age_y") >= 2.0) & (pl.col("age_y") < 3.0)).any().alias("normal_bcs_2to3y"),
        pl.len().alias("n_visits"),
    )
    summary["dogs_never_neutered"] = int(dog.filter(pl.col("gender").is_in(["M", "F"])).height)
    keep = dog.filter(
        ~pl.col("ever_abnormal_bcs") & pl.col("normal_bcs_2to3y") & pl.col("breed_adult_kg").is_not_null()
    ).with_columns(pl.col("gender").str.slice(0, 1).alias("gender"))  # MN -> M, FS -> F
    summary["dogs_after_dog_criteria"] = keep.height
    sel = df.join(keep.select("PET_ID", "gender", "breed_adult_kg"), on="PET_ID", how="inner")
    # ---- visit-level criteria -----------------------------------------------------------
    sel = sel.filter(
        pl.col("intact_at_visit") & pl.col("healthy_visit")
        & (pl.col("age_y") >= AGE_MIN) & (pl.col("age_y") <= AGE_MAX)
        & pl.col("WEIGHT").is_not_null() & (pl.col("WEIGHT") > 0.2)
    ).with_columns(pl.col("age_y").cast(pl.Float64), pl.col("WEIGHT").cast(pl.Float64), pl.col("breed_adult_kg").cast(pl.Float64)).with_columns(
        category(pl.col("breed_adult_kg")).alias("cat"),
        pl.col("gender").alias("sex"),
        pl.col("WEIGHT").alias("kg"),
    ).select("PET_ID", "BREED_ID", "sex", "cat", "breed_adult_kg", "age_y", "kg")
    summary["rows_after_visit_criteria"] = sel.height
    summary["dogs_after_visit_criteria"] = sel["PET_ID"].n_unique()

    # ---- outlier rules (per sex x category) ---------------------------------------------
    # (a) > 3x median weight of dogs older than 1 year in the group
    med_adult = sel.filter(pl.col("age_y") > 1.0).group_by("sex", "cat").agg(pl.col("kg").median().alias("med_adult"))
    sel = sel.join(med_adult, on=["sex", "cat"]).filter(pl.col("kg") <= 3 * pl.col("med_adult")).drop("med_adult")
    n_a = sel.height
    # (b) 150% of box-plot whiskers in 40 equal-count age bins, on log weight
    sel = sel.with_columns(pl.col("kg").log().alias("log_kg"))
    sel = sel.with_columns(
        ((pl.col("age_y").rank(method="ordinal").over("sex", "cat") - 1) * 40 // pl.len().over("sex", "cat")).cast(pl.Int32).alias("abin")
    )
    q = sel.group_by("sex", "cat", "abin").agg(
        pl.col("log_kg").quantile(0.25).alias("q1"), pl.col("log_kg").quantile(0.75).alias("q3")
    ).with_columns((pl.col("q3") - pl.col("q1")).alias("iqr"))
    sel = sel.join(q, on=["sex", "cat", "abin"]).filter(
        (pl.col("log_kg") >= pl.col("q1") - 1.5 * 1.5 * pl.col("iqr")) & (pl.col("log_kg") <= pl.col("q3") + 1.5 * 1.5 * pl.col("iqr"))
    ).drop("q1", "q3", "iqr")
    n_b = sel.height
    # (c) within-dog: residual from the bin median; z > 3 relative to the dog's own residuals (dogs with >= 3 weights)
    binmed = sel.group_by("sex", "cat", "abin").agg(pl.col("log_kg").median().alias("bmed"))
    sel = sel.join(binmed, on=["sex", "cat", "abin"]).with_columns((pl.col("log_kg") - pl.col("bmed")).alias("r"))
    sel = sel.with_columns(
        pl.col("r").mean().over("PET_ID").alias("r_mean"), pl.col("r").std().over("PET_ID").alias("r_sd"),
        pl.len().over("PET_ID").alias("n_dog"),
    ).filter(
        (pl.col("n_dog") < 3) | pl.col("r_sd").is_null() | (pl.col("r_sd") == 0)
        | (((pl.col("r") - pl.col("r_mean")) / pl.col("r_sd")).abs() <= 3)
    ).drop("bmed", "r", "r_mean", "r_sd", "n_dog", "abin")
    summary["rows_after_outlier_a"] = n_a
    summary["rows_after_outlier_b"] = n_b
    summary["rows_final"] = sel.height
    summary["dogs_final"] = sel["PET_ID"].n_unique()
    summary["per_model"] = (
        sel.group_by("sex", "cat").agg(pl.len().alias("rows"), pl.col("PET_ID").n_unique().alias("dogs"),
                                       pl.col("BREED_ID").n_unique().alias("breeds"))
        .sort("cat", "sex").to_dicts()
    )
    sel.sort(["PET_ID", "age_y", "kg"]).write_parquet(OUT / "visits_selected.parquet")  # sorted: the same file on every run
    (OUT / "prepare_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: v for k, v in summary.items() if k != "age_hist_0.05y"}, indent=2))


if __name__ == "__main__":
    main()
