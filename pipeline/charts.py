"""Size groups, weekly LMS chart tables and the adult-weight-indexed (breed-adjusted) chart, shared by the pipeline.

The app (growth.js, chartForWeight) implements the same interpolation on the same tables; tests check
that both give identical z-scores.

Breed-adjusted chart for a sexes-pooled breed mean adult weight W (the scale of AV_BREED_WEIGHT):
  categories are ordered by their reference weight W_c (geometric mean of W over the chart's weights);
  between two references, log M - log W, log S and L are interpolated linearly in log W, then log W is added;
  beyond the lightest/heaviest reference, that category's chart is used with M scaled by W / W_c.
At W = W_c the chart equals the category chart.
"""
from __future__ import annotations

import numpy as np

WEEKS_PER_YEAR = 365.25 / 7
GRID_WEEKS = np.arange(8, 105)
GRID_Y = GRID_WEEKS / WEEKS_PER_YEAR

# The one definition of the size groups (Salt et al. 2017 categories by expected adult weight, sexes pooled, plus the
# provisional giant group): id, label and upper bound in kg; each group starts at the previous group's upper bound.
# Exported to the app as centiles.json "size_groups".
SIZE_GROUPS = (("I", "Toy", 6.5), ("II", "Small", 9.0), ("III", "Medium", 15.0),
               ("IV", "Medium-large", 30.0), ("V", "Large", 40.0), ("VI", "Giant", None))
CATS = [c for c, _, _ in SIZE_GROUPS]
CAT_LABEL = {c: label for c, label, _ in SIZE_GROUPS}
CAT_UPPER = {c: float("inf") if hi is None else hi for c, _, hi in SIZE_GROUPS}


def size_groups_json() -> list[dict]:
    """The size groups as the app reads them: id, label, min_kg and max_kg (null: open-ended)."""
    out, lo = [], 0.0
    for c, label, hi in SIZE_GROUPS:
        out.append({"id": c, "label": label, "min_kg": lo, "max_kg": hi})
        lo = hi
    return out


def category_of(w_pooled: float) -> str:
    return next(c for c in CATS if w_pooled < CAT_UPPER[c])


class TableChart:
    def __init__(self, L, M, S):
        self.L, self.M, self.S = np.asarray(L, float), np.asarray(M, float), np.asarray(S, float)

    def lms(self, age_y):
        return np.interp(age_y, GRID_Y, self.L), np.interp(age_y, GRID_Y, self.M), np.interp(age_y, GRID_Y, self.S)

    def z(self, age_y, kg):
        L, M, S = self.lms(age_y)
        return np.where(np.abs(L) < 1e-6, np.log(kg / M) / S, (np.power(kg / M, L) - 1) / (L * S))

    def kg(self, age_y, z):
        L, M, S = self.lms(age_y)
        inner = np.maximum(1 + L * S * z, 1e-9)
        return np.where(np.abs(L) < 1e-6, M * np.exp(S * z), M * np.power(inner, 1 / L))


def chart_for_weight(tables: dict, refs: dict, sex: str, w: float) -> TableChart:
    """tables[(cat, sex)] -> TableChart; refs[(cat, sex)] -> W_c."""
    ws = np.array([refs[(c, sex)] for c in CATS])
    order = np.argsort(ws)
    cs = [CATS[i] for i in order]
    lw = np.log(ws[order])
    x = np.log(w)
    if x <= lw[0]:
        t = tables[(cs[0], sex)]
        return TableChart(t.L, t.M * w / np.exp(lw[0]), t.S)
    if x >= lw[-1]:
        t = tables[(cs[-1], sex)]
        return TableChart(t.L, t.M * w / np.exp(lw[-1]), t.S)
    j = int(np.searchsorted(lw, x)) - 1
    f = (x - lw[j]) / (lw[j + 1] - lw[j])
    a, b = tables[(cs[j], sex)], tables[(cs[j + 1], sex)]
    logm = (1 - f) * (np.log(a.M) - lw[j]) + f * (np.log(b.M) - lw[j + 1]) + x
    logs = (1 - f) * np.log(a.S) + f * np.log(b.S)
    return TableChart((1 - f) * a.L + f * b.L, np.exp(logm), np.exp(logs))


SIGMA_ASSUMED = 0.10  # assumed log-error of a breed weight taken from breed standards


def shrink_factor(log_w_var: float, sigma: float = SIGMA_ASSUMED) -> float:
    """Reliability of a breed weight within its category: tau^2 / (tau^2 + sigma^2)."""
    return float(log_w_var / (log_w_var + sigma ** 2))


def shrunk_weight(w: float, refs: dict, sex: str, k: dict) -> float:
    """Shrink log w toward the reference weight of its category by the category's factor k."""
    c = category_of(w)
    wc = refs[(c, sex)]
    return float(np.exp(np.log(wc) + k[c] * (np.log(w) - np.log(wc))))


def tables_from_json(cent: dict) -> tuple[dict, dict]:
    """Category tables and reference weights from app/model/centiles.json."""
    tables, refs = {}, {}
    for key, ch in cent["charts"].items():
        c, s = key.split("_")
        tables[(c, s)] = TableChart(ch["L"], ch["M"], ch["S"])
        refs[(c, s)] = ch["ref_adult_kg"]
    return tables, refs
