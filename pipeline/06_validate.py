"""Independent validation on the colony datasets of Salt et al. 2020 (Liverpool DataCat 1091, CC BY):
weekly weights of healthy research-colony puppies that were never part of the Banfield data.

Three chart paths are scored for every weight:
  size group (label)  the size-group chart named in the dataset (SizeClass I-V, assigned by the colony)
  size group (table)  the size group the app would pick from its breed table (the alternative to breed adjustment)
  breed-adjusted      the app's path: colony breed name -> breed table weight (shrunk for Salt-placed breeds) -> chart
Healthy dogs should centre near z = 0 with SD near 1, and few should cross more than two of the chart's centile
lines (2nd, 9th, 25th, 50th, 75th, 91st, 98th) between the first weight and the weight furthest from it, counted
over dogs with at least three weights from 8 weeks to 2 years (Salt et al. 2020: under 4% of the healthy colony
dogs crossed more than two). The healthy Banfield dogs the charts were fitted on give the rate for clinic weights.
The Labrador feeding trial and the Banfield dogs later in abnormal body condition test direction.

Writes data/derived/validation_colony.json and prints a table.
"""
from __future__ import annotations

import json
from pathlib import Path
from statistics import NormalDist

import numpy as np
import polars as pl

import charts as chartlib

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DER = ROOT / "data" / "derived"
LINE_Z = np.array([NormalDist().inv_cdf(p) for p in (0.02, 0.09, 0.25, 0.5, 0.75, 0.91, 0.98)])  # the app's centile lines

cent = json.loads((ROOT / "app" / "model" / "centiles.json").read_text())
breeds = json.loads((ROOT / "app" / "model" / "breeds.json").read_text())["breeds"]
TABLES, REFS = chartlib.tables_from_json(cent)
SHRINK = cent["shrink"]
# colony breed names -> breed table names (UK colony 'Cocker Spaniel' is the English Cocker)
ALIASES = {"Standard Dacshund": "Dachshund", "Cocker Spaniel": "English Cocker Spaniel"}


def breed_chart(name: str, sex: str):
    e = breeds.get(ALIASES.get(name, name))
    if e is None:
        return None
    w = chartlib.shrunk_weight(e["w"], REFS, sex, SHRINK) if e["shrink"] else e["w"]
    return chartlib.chart_for_weight(TABLES, REFS, sex, w)


def lines_crossed(z: np.ndarray) -> int:
    """Centile lines crossed between the first weight and the weight furthest from it (Salt et al. 2020)."""
    lo, hi = np.minimum(z[0], z[1:]), np.maximum(z[0], z[1:])
    return int(((LINE_Z > lo[:, None]) & (LINE_Z < hi[:, None])).sum(axis=1).max())


def crossing(df: pl.DataFrame, dog: str, age: str, zcol: str) -> tuple[int, int]:
    """(dogs with >= 3 weights, of them crossing more than two lines)."""
    per_dog = df.sort([dog, age, zcol]).group_by(dog, maintain_order=True).agg(pl.col(zcol)).filter(pl.col(zcol).list.len() >= 3)
    n_cross = sum(lines_crossed(np.asarray(z)) > 2 for z in per_dog[zcol].to_list())
    return per_dog.height, int(n_cross)


def score(df: pl.DataFrame, name: str, by_breed: bool) -> list[dict]:
    df = df.filter((pl.col("age_wk") >= 8) & (pl.col("age_wk") <= 104))
    rows = []
    keys = ["Breed", "sex"] if by_breed and "Breed" in df.columns else ["size", "sex"]
    for key, g in df.group_by(keys):
        sex = key[-1]
        for path in ("size group (label)", "size group (table)", "breed-adjusted"):
            if path == "size group (label)":
                if g["size"][0] not in chartlib.CATS:
                    continue
                ch = TABLES[(g["size"][0], sex)]
            elif path == "size group (table)":
                e = breeds.get(ALIASES.get(g["Breed"][0], g["Breed"][0])) if "Breed" in g.columns else None
                if e is None:
                    continue
                ch = TABLES[(e["category"], sex)]
            else:
                if "Breed" not in g.columns:
                    continue
                ch = breed_chart(g["Breed"][0], sex)
                if ch is None:
                    continue
            z = ch.z(g["age_wk"].to_numpy() / chartlib.WEEKS_PER_YEAR, g["kg"].to_numpy())
            n3, n_cross = crossing(g.with_columns(pl.Series("z", z)), "dog", "age_wk", "z")
            rows.append({"dataset": name, "group": " ".join(str(k) for k in key), "path": path, "n_weights": g.height, "n_dogs": g["dog"].n_unique(),
                         "z_mean": round(float(z.mean()), 2), "z_sd": round(float(z.std()), 2), "n_dogs_3plus_weights": n3, "n_crossing": n_cross,
                         "pct_crossing_over_2_lines": round(100 * n_cross / n3, 1) if n3 else None})
    return sorted(rows, key=lambda r: (r["dataset"], r["group"], r["path"]))


def load(fname: str, weeks_col: str | None = None) -> pl.DataFrame:
    d = pl.read_csv(RAW / fname, separator="\t").rename({"DogID": "dog", "SizeClass": "size", "WeightKG": "kg"})
    d = d.rename({"Sex": "sex"}) if "Sex" in d.columns else d
    age = pl.col(weeks_col).cast(pl.Float64) if weeks_col else pl.col("AgeYrs") * chartlib.WEEKS_PER_YEAR
    return d.with_columns(age.alias("age_wk"), pl.col("kg").cast(pl.Float64))


def healthy_fitting() -> dict:
    """Crossing rate of the healthy Banfield dogs the charts were fitted on, on the app's two chart paths."""
    z = pl.read_parquet(DER / "visits_z.parquet").with_columns((pl.col("age_y") * chartlib.WEEKS_PER_YEAR).alias("age_wk"))
    out = {}
    for path, col in (("size group", "z_cat"), ("breed-adjusted", "z_w")):
        n3, n_cross = crossing(z, "PET_ID", "age_wk", col)
        out[path] = {"n_dogs_3plus_weights": n3, "pct_crossing_over_2_lines": round(100 * n_cross / n3, 1)}
    return out


def main() -> None:
    out = []
    out += score(load("WCPN.txt", "AgeWks"), "WALTHAM colony", by_breed=True)
    out += score(load("RC.txt"), "Royal Canin colony", by_breed=True)
    out += score(load("VitaminA.txt"), "Vitamin A trial", by_breed=True)
    for sub, g in sorted(load("EnergyIntake.txt").group_by("SubSet"), key=lambda t: t[0]):
        out += score(g, f"Labrador feeding trial: {sub[0]}", by_breed=True)
    abnormal = []
    for grp, g in load("BanfieldBCS.txt").group_by("BCSGp"):
        rows = score(g, f"Banfield later {grp[0]}", by_breed=False)
        w = np.array([r["n_weights"] for r in rows])
        n3 = sum(r["n_dogs_3plus_weights"] for r in rows)
        abnormal.append({"group": grp[0], "n_weights": int(w.sum()), "z_mean": round(float((w * np.array([r["z_mean"] for r in rows])).sum() / w.sum()), 2),
                         "n_dogs_3plus_weights": n3, "pct_crossing_over_2_lines": round(100 * sum(r["n_crossing"] for r in rows) / n3, 1)})
    abnormal.sort(key=lambda a: a["group"])
    summary = {}
    for path in ("size group (label)", "size group (table)", "breed-adjusted"):
        rows = [r for r in out if r["path"] == path and r["dataset"] in ("WALTHAM colony", "Royal Canin colony", "Vitamin A trial") and r["n_dogs"] >= 5]
        w = np.array([r["n_dogs"] for r in rows])
        z = np.array([abs(r["z_mean"]) for r in rows])
        summary[path] = {"groups": len(rows), "dogs": int(w.sum()), "dog_weighted_mean_abs_z": round(float((w * z).sum() / w.sum()), 3)}
    healthy = healthy_fitting()
    (DER / "validation_colony.json").write_text(json.dumps({"centring_summary": summary, "by_group": out, "banfield_abnormal_bcs": abnormal,
                                                            "banfield_healthy_fitting_data": healthy}, indent=1))
    for r in out:
        print(f"{r['dataset']:<38} {r['group']:<28} {r['path']:<19} dogs={r['n_dogs']:>4}  z {r['z_mean']:>5} sd {r['z_sd']:>4}  "
              f"crossing >2 lines {r['pct_crossing_over_2_lines']}% of {r['n_dogs_3plus_weights']}")
    print(summary)
    for a in abnormal:
        print(a)
    print("healthy fitting data", healthy)


if __name__ == "__main__":
    main()
