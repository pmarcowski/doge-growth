"""Build the breed -> expected-adult-weight lookup used to pre-fill the app's chart choice.

Sources
  * Hayward JJ et al. (2016) Nat Commun 7:10460, Supplementary Data 2 (CC BY 4.0): breed-average male
    body weight (stored as weight^0.38) for 159 breeds, assigned from AKC standards, CanMap and the
    Royal Canin encyclopedia.  https://doi.org/10.1038/ncomms10460
  * Salt C et al. (2017) PLOS ONE 12:e0182064, Table 1: the 33 breeds assigned to the growth-standard
    size categories from Banfield adult weights (overrides Hayward where both exist).

The breed MEAN adult weight (sexes pooled) is what the size categories were built on; male-average
weights are divided by the male/pooled ratio observed in the fitted standards (see centiles.json), then
calibrated to the clinic scale. Salt Table 1 breeds are clamped to the Banfield breed-weight range of their
category; for these 33 breeds the app shrinks w toward the category reference weight (centiles.json "shrink").

Writes app/model/breeds.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import openpyxl

from charts import category_of

ROOT = Path(__file__).resolve().parents[1]
XLSX_DEFAULT = ROOT / "data" / "raw" / "hayward2016_supp_data2.xlsx"
OUT = ROOT / "app" / "model" / "breeds.json"

SALT_TABLE1 = {
    "I": ["Chihuahua", "Yorkshire Terrier", "Maltese", "Toy Poodle", "Pomeranian", "Miniature Pinscher"],
    "II": ["Shih Tzu", "Pekingese", "Dachshund", "Bichon Frise", "Rat Terrier", "Jack Russell Terrier", "Lhasa Apso", "Miniature Schnauzer"],
    "III": ["Fox Terrier", "Pug", "Boston Terrier", "American Cocker Spaniel", "Beagle"],
    "IV": ["Australian Shepherd", "Chow Chow", "Basset Hound", "Siberian Husky", "English Bulldog", "Pit Bull type", "Boxer"],
    "V": ["German Shepherd Dog", "Golden Retriever", "Labrador Retriever", "American Bulldog"],
    "VI": ["Rottweiler", "Great Dane", "Mastiff"],
}

# Hayward slug -> display name where the automatic title-casing is wrong or the breed has a common name
RENAME = {
    "american_eskimo": "American Eskimo Dog", "australian_cattle": "Australian Cattle Dog", "bernese_mountain": "Bernese Mountain Dog",
    "bichon_frise": "Bichon Frise", "bouvier_des_flandres": "Bouvier des Flandres", "cardigan_welsh_corgi": "Cardigan Welsh Corgi",
    "cavalier_king_charles": "Cavalier King Charles Spaniel", "chinese_shar_pei": "Chinese Shar-Pei", "coton_de_tulear": "Coton de Tulear",
    "dandie_dinmont": "Dandie Dinmont Terrier", "dogue_de_bordeaux": "Dogue de Bordeaux", "english_cocker": "English Cocker Spaniel",
    "english_toy_spaniel": "English Toy Spaniel", "entlebucher": "Entlebucher Mountain Dog", "german_shepherd": "German Shepherd Dog",
    "german_shorthaired": "German Shorthaired Pointer", "german_wirehaired": "German Wirehaired Pointer", "glen_of_imaal": "Glen of Imaal Terrier",
    "greater_swiss_mountain": "Greater Swiss Mountain Dog", "jack_russell": "Jack Russell Terrier", "kerry_blue": "Kerry Blue Terrier",
    "nova_scotia_duck_toller": "Nova Scotia Duck Tolling Retriever", "old_english_sheepdog": "Old English Sheepdog",
    "pembroke_welsh_corgi": "Pembroke Welsh Corgi", "petit_basset_griffon_vendeen": "Petit Basset Griffon Vendeen",
    "portuguese_water": "Portuguese Water Dog", "shih_tzu": "Shih Tzu", "soft_coated_wheaten": "Soft Coated Wheaten Terrier",
    "st_bernard": "Saint Bernard", "staffordshire_bull": "Staffordshire Bull Terrier", "west_highland_white": "West Highland White Terrier",
    "wirehaired_pointing_griffon": "Wirehaired Pointing Griffon", "xoloitzcuintli": "Xoloitzcuintli", "shiba_inu": "Shiba Inu",
    "lhasa_apso": "Lhasa Apso", "chow_chow": "Chow Chow", "cocker_spaniel": "American Cocker Spaniel", "bulldog": "English Bulldog",
    "american_pit_bull": "Pit Bull type", "american_staffordshire": "American Staffordshire Terrier", "poodle": "Standard Poodle",
    "doberman": "Doberman Pinscher", "great_pyrenees": "Great Pyrenees", "rhodesian_ridgeback": "Rhodesian Ridgeback",
    "miniature_bull": "Miniature Bull Terrier", "bull_terrier": "Bull Terrier", "norwegian_elkhound": "Norwegian Elkhound",
    "treeing_walker_coonhound": "Treeing Walker Coonhound", "black_and_tan_coonhound": "Black and Tan Coonhound",
    "irish_wolfhound": "Irish Wolfhound", "scottish_deerhound": "Scottish Deerhound", "anatolian_shepherd": "Anatolian Shepherd Dog",
    "belgian_malinois": "Belgian Malinois", "belgian_tervuren": "Belgian Tervuren", "belgian_sheepdog": "Belgian Sheepdog",
    "bulldog_english": "English Bulldog", "bulldog_french": "French Bulldog", "dachshund_miniature": "Miniature Dachshund",
    "poodle_miniature": "Miniature Poodle", "poodle_toy": "Toy Poodle", "american_pit_bull_terrier": "American Pit Bull Terrier",
    "fox_terrier_smooth": "Fox Terrier (Smooth)", "fox_terrier_wire": "Fox Terrier (Wire)", "wire_fox_terrier": "Fox Terrier (Wire)",
    "smooth_fox_terrier": "Fox Terrier (Smooth)", "parson_russell": "Parson Russell Terrier", "russell_terrier": "Russell Terrier",
    "schnauzer_miniature": "Miniature Schnauzer", "schnauzer_standard": "Standard Schnauzer", "schnauzer_giant": "Giant Schnauzer",
    "mastiff": "Mastiff", "english_mastiff": "Mastiff", "saint_bernard": "Saint Bernard", "newfoundland": "Newfoundland",
    "chihuahua": "Chihuahua", "maltese": "Maltese", "pomeranian": "Pomeranian", "pekingese": "Pekingese",
}


def display_name(slug: str) -> str:
    if slug in RENAME:
        return RENAME[slug]
    return " ".join(w.capitalize() for w in slug.split("_"))


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the breed to adult-weight table the app uses to pick a chart.")
    ap.add_argument("xlsx", nargs="?", type=Path, default=XLSX_DEFAULT, help="Hayward et al. 2016 Supplementary Data 2 (default: %(default)s)")
    xlsx = ap.parse_args().xlsx
    cent = json.loads((ROOT / "app" / "model" / "centiles.json").read_text())
    # male / pooled ratio of the fitted medians at 104 weeks, averaged over categories I-V
    ratios = []
    for cat in ["I", "II", "III", "IV", "V"]:
        m = cent["charts"][f"{cat}_M"]["M"][-1]
        f = cent["charts"][f"{cat}_F"]["M"][-1]
        ratios.append(m / ((m + f) / 2))
    male_over_pooled = round(sum(ratios) / len(ratios), 3)

    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    # Calibration of standard-based breed means to the clinic population the categories were built on:
    # quantile-match the 31 (disguised) Banfield breed means against the standard-based means of the
    # Salt et al. breeds, log-linear. Toy breeds in clinics are heavier than their standards, giants lighter.
    import numpy as np
    import polars as pl
    banfield_means = sorted(pl.read_parquet(ROOT / "data" / "derived" / "visits_selected.parquet")
                            .group_by("BREED_ID").agg(pl.col("breed_adult_kg").first())["breed_adult_kg"].to_list())
    hayward_raw = {}
    for r in rows[4:]:
        if r and r[0] and r[1] not in (None, "NA"):
            try:
                hayward_raw[display_name(str(r[0]).strip())] = float(r[1]) ** (1 / 0.38) / male_over_pooled
            except (TypeError, ValueError):
                pass
    salt_names = [n for ns in SALT_TABLE1.values() for n in ns]
    hv = sorted(hayward_raw[n] for n in salt_names if n in hayward_raw)
    qs = np.linspace(0.05, 0.95, 19)
    bq, hq = np.quantile(banfield_means, qs), np.quantile(hv, qs)
    slope, intercept = np.polyfit(np.log(hq), np.log(bq), 1)
    calib = {"slope": round(float(slope), 4), "intercept": round(float(intercept), 4),
             "note": "Banfield-equivalent breed mean = exp(intercept + slope * log(standard-based pooled mean)); fitted on quantiles of "
                     f"{len(banfield_means)} Banfield breed means vs {len(hv)} standard-based means of the Salt et al. breeds."}
    print("calibration", calib)

    def clinic_equiv(pooled_kg: float) -> float:
        return float(np.exp(intercept + slope * np.log(pooled_kg)))

    breeds = {}
    for r in rows[4:]:
        if not r or not r[0] or r[1] in (None, "NA"):
            continue
        try:
            male_kg = float(r[1]) ** (1 / 0.38)
        except (TypeError, ValueError):
            continue
        slug = str(r[0]).strip()
        name = display_name(slug)
        breeds[name] = {"male_avg_kg": round(male_kg, 1), "standard_mean_kg": round(male_kg / male_over_pooled, 1),
                        "mean_adult_kg": round(clinic_equiv(male_kg / male_over_pooled), 1), "source": "hayward2016"}
    # Salt et al. 2017 Table 1: the category is known from Banfield data, so the weight is kept inside the range
    # of Banfield breed weights observed in that category (missing weights take the category's reference weight)
    for cat, names in SALT_TABLE1.items():
        lo, hi = cent["charts"][f"{cat}_M"]["breed_weight_range"]
        ref = float(np.sqrt(cent["charts"][f"{cat}_M"]["ref_adult_kg"] * cent["charts"][f"{cat}_F"]["ref_adult_kg"]))
        for name in names:
            entry = breeds.get(name, {"source": "salt2017"})
            entry["category"] = cat
            entry["source"] = "salt2017" if entry.get("source") == "salt2017" else "hayward2016+salt2017"
            if "mean_adult_kg" not in entry:
                entry["mean_adult_kg"] = round(ref, 2)
            elif not (lo <= entry["mean_adult_kg"] <= hi):
                entry["mean_adult_kg_hayward"] = entry["mean_adult_kg"]
                entry["mean_adult_kg"] = round(min(max(entry["mean_adult_kg"], lo), hi), 2)
            breeds[name] = entry
    for e in breeds.values():
        if "category" not in e:
            e["category"] = category_of(e["mean_adult_kg"])
    # the app uses w = mean_adult_kg (sexes pooled, clinic scale). Only breeds placed in a Banfield size group by
    # Salt et al. are shrunk toward that group's reference weight (their true weight lies in the group's range);
    # other breeds are charted at their own weight, which may fall between groups.
    for e in breeds.values():
        e["w"] = e.pop("mean_adult_kg")
        e["shrink"] = "salt2017" in e["source"]
    out = {
        "male_over_pooled_ratio": male_over_pooled,
        "clinic_calibration": calib,
        "sources": {
            "hayward2016": "Hayward JJ et al. 2016, Nat Commun 7:10460, Supplementary Data 2 (CC BY 4.0): male average weight from breed standards",
            "salt2017": "Salt C et al. 2017, PLOS ONE 12(9):e0182064, Table 1: size category from Banfield adult weights",
        },
        "breeds": dict(sorted(breeds.items())),
    }
    OUT.write_text(json.dumps(out, indent=0, separators=(",", ":")))
    moved = [(n, e) for n, e in breeds.items() if "mean_adult_kg_hayward" in e]
    for n in ("Labrador Retriever", "Golden Retriever", "German Shepherd Dog", "Chihuahua", "Yorkshire Terrier", "Beagle", "French Bulldog", "Great Dane", "Border Collie"):
        print(n, breeds.get(n))
    print(f"{len(breeds)} breeds written; male/pooled ratio {male_over_pooled}; Salt overrides that moved a Hayward value: {[(n, e['mean_adult_kg_hayward'], e['category']) for n, e in moved]}")


if __name__ == "__main__":
    main()
