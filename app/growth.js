/* growth.js — centile standards, centile-tracking projection and energy requirements.
 * Pure functions, no DOM. Loaded as a classic script in the page and via require() in tests.
 *
 * Sources (see README): Salt et al. 2017 PLOS ONE (standards, refitted from the open Banfield extract) and 2020
 * (centile-crossing rule); FEDIAF Nutritional Guidelines 2025 Tables VII-6/7/8b (Klein et al. 2019); NRC 2006;
 * AAHA 2021 Box 1.
 */
/* global module */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Growth = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const WEEKS_PER_YEAR = 365.25 / 7;
  const WEEKS_PER_MONTH = WEEKS_PER_YEAR / 12;
  const KG_PER_LB = 0.45359237;
  const KJ_PER_KCAL = 4.184;

  // ---- normal distribution ----------------------------------------------------------------
  // CDF: Zelen & Severo (Abramowitz-Stegun 26.2.17), |error| < 7.5e-8
  function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const p = 1 - Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
    return z >= 0 ? p : 1 - p;
  }
  // Inverse CDF: Acklam's algorithm with one Newton refinement, relative error ~1e-15 after refinement
  function normInv(p) {
    if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const plow = 0.02425, phigh = 1 - plow;
    let q, r, x;
    if (p < plow) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= phigh) { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const e = normCdf(x) - p;
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
    return x - u / (1 + x * u / 2);
  }

  // ---- LMS standards ----------------------------------------------------------------------
  /** Interpolate L, M, S at an age (weeks) on a chart's weekly grid; ages are clamped to the grid. */
  function lmsAt(chart, ageWeeks, ageGrid) {
    const lo = ageGrid[0], hi = ageGrid[ageGrid.length - 1];
    const a = Math.min(Math.max(ageWeeks, lo), hi);
    const i = Math.min(Math.floor(a - lo), ageGrid.length - 2);
    const f = a - ageGrid[i];
    return { L: chart.L[i] + f * (chart.L[i + 1] - chart.L[i]), M: chart.M[i] + f * (chart.M[i + 1] - chart.M[i]), S: chart.S[i] + f * (chart.S[i + 1] - chart.S[i]) };
  }
  function zFromWeight(lms, kg) {
    return Math.abs(lms.L) < 1e-6 ? Math.log(kg / lms.M) / lms.S : (Math.pow(kg / lms.M, lms.L) - 1) / (lms.L * lms.S);
  }
  function weightFromZ(lms, z) {
    if (Math.abs(lms.L) < 1e-6) return lms.M * Math.exp(lms.S * z);
    const inner = 1 + lms.L * lms.S * z;
    return inner <= 0 ? 0 : lms.M * Math.pow(inner, 1 / lms.L);
  }
  function centileFromZ(z) { return 100 * normCdf(z); }

  // ---- centile tracking (GP on z with exponential correlation + nugget) --------------------
  /** Age transform used by the tracking model: "log" or "boxcox<q>" (Box-Cox with power q), age in years. */
  function transformAge(ageWeeks, transform) {
    const y = ageWeeks / WEEKS_PER_YEAR;
    if (transform === "log") return Math.log(y);
    if (/^boxcox-?\d/.test(transform)) { const q = parseFloat(transform.slice(6)); return q === 0 ? Math.log(y) : (Math.pow(y, q) - 1) / q; }
    throw new Error(`unknown age transform: ${transform}`);
  }
  /** Solve K x = b for small symmetric positive-definite K (Cholesky). */
  function solveSPD(K, b) {
    const n = b.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = K[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) { if (s <= 0) throw new Error("matrix not positive definite"); L[i][i] = Math.sqrt(s); }
        else L[i][j] = s / L[j][j];
      }
    }
    const y = new Array(n), x = new Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
    return x;
  }
  /** Predictive mean and sd of a new z measurement at sNew given observed (sObs, zObs). */
  function gpPredict(sObs, zObs, sNew, tracking) {
    const n = sObs.length, nug = tracking.nugget, ell = tracking.ell;
    if (n === 0) return { mean: 0, sd: 1 };
    const K = sObs.map((si, i) => sObs.map((sj, j) => (1 - nug) * Math.exp(-Math.abs(si - sj) / ell) + (i === j ? nug : 0)));
    const k = sObs.map((si) => (1 - nug) * Math.exp(-Math.abs(si - sNew) / ell));
    const w = solveSPD(K, k);
    let mean = 0, kk = 0;
    for (let i = 0; i < n; i++) { mean += w[i] * zObs[i]; kk += w[i] * k[i]; }
    return { mean, sd: Math.sqrt(Math.max(1 - kk, 1e-8)) };
  }

  /**
   * Project a puppy's weight trajectory.
   * @param chart   {L,M,S} arrays on model.age_weeks
   * @param weighIns [{ageWeeks, kg}] (any order)
   * @param tracking {transform, nugget, ell}
   * @param ageGrid  weekly grid of the chart
   * @param quantiles e.g. [0.05, 0.25, 0.5, 0.75, 0.95]
   * @returns {points:[{ageWeeks, zMean, zSd, kg:{q5, q25, q50, q75, q95}}], observations:[{ageWeeks, kg, z, centile, lms}]}
   */
  function project(chart, weighIns, tracking, ageGrid, quantiles) {
    quantiles = quantiles || [0.05, 0.25, 0.5, 0.75, 0.95];
    const obs = weighIns
      .filter((w) => w && w.kg > 0 && w.ageWeeks >= ageGrid[0] && w.ageWeeks <= ageGrid[ageGrid.length - 1])
      .sort((a, b) => a.ageWeeks - b.ageWeeks)
      .map((w) => { const lms = lmsAt(chart, w.ageWeeks, ageGrid); const z = zFromWeight(lms, w.kg); return { ageWeeks: w.ageWeeks, kg: w.kg, z, centile: centileFromZ(z), lms }; });
    const sObs = obs.map((o) => transformAge(o.ageWeeks, tracking.transform));
    const zObs = obs.map((o) => o.z);
    const zq = quantiles.map(normInv);
    const points = ageGrid.map((a) => {
      const pred = gpPredict(sObs, zObs, transformAge(a, tracking.transform), tracking);
      const lms = lmsAt(chart, a, ageGrid);
      const kg = {};
      quantiles.forEach((q, i) => { kg["q" + Math.round(q * 100)] = weightFromZ(lms, pred.mean + pred.sd * zq[i]); });
      return { ageWeeks: a, zMean: pred.mean, zSd: pred.sd, kg };
    });
    return { points, observations: obs };
  }

  /** z-scores of the centile lines drawn on the chart: 2nd, 9th, 25th, 50th, 75th, 91st and 98th. */
  const CENTILE_LINES = [0.02, 0.09, 0.25, 0.5, 0.75, 0.91, 0.98];
  const LINE_Z = CENTILE_LINES.map(normInv);
  /** Number of drawn centile lines strictly between two z-scores. */
  function linesBetween(z1, z2) {
    const lo = Math.min(z1, z2), hi = Math.max(z1, z2);
    return LINE_Z.filter((c) => c > lo && c < hi).length;
  }
  /**
   * Statements about a sequence of observations (z-scores), as defined by Salt et al. 2020:
   * latest weight outside the 2nd–98th centiles; more than two centile lines crossed between the first weight
   * and the weight furthest from it (on these charts, 3% of healthy colony puppies and 8% of healthy clinic
   * puppies with three or more weights: pipeline/06_validate.py); no gain over at least 3 weeks where a puppy
   * staying on its centile gains more than 5%.
   */
  function growthFlags(observations) {
    const flags = [];
    if (!observations.length) return flags;
    const last = observations[observations.length - 1], zEdge = LINE_Z[LINE_Z.length - 1];
    if (last.z > zEdge) flags.push({ code: "above98", text: "Latest weight is above the 98th centile for this chart." });
    if (last.z < -zEdge) flags.push({ code: "below2", text: "Latest weight is below the 2nd centile for this chart." });
    if (observations.length >= 2) {
      const first = observations[0];
      let far = null, crossed = 0;
      observations.slice(1).forEach((o) => { const n = linesBetween(first.z, o.z); if (n > crossed) { crossed = n; far = o; } });
      if (crossed > 2) {
        const up = far.z > first.z;
        flags.push({ code: up ? "crossing_up" : "crossing_down", text: `Since the first weigh-in, weight has crossed ${crossed} centile lines ${up ? "upwards" : "downwards"}; fewer than 1 in 10 healthy puppies cross more than two.` });
      }
      const prev = observations[observations.length - 2];
      const weeks = last.ageWeeks - prev.ageWeeks;
      // gain of a puppy that stays on the previous weigh-in's centile over the same weeks (from the chart)
      const expectedKg = weightFromZ(last.lms, prev.z);
      if (weeks >= 3 && expectedKg > prev.kg * 1.05 && last.kg <= prev.kg) {
        flags.push({ code: "no_gain", text: `No weight gain in the ${Math.round(weeks)} weeks since the previous weigh-in; a puppy staying on its centile gains about ${Math.round(100 * (expectedKg / prev.kg - 1))}% in that time.` });
      }
    }
    return flags;
  }

  /** Pick the chart (by sex) whose centiles the observations fit best — used when breed and adult weight are unknown. */
  function bestFittingChart(charts, sex, weighIns, ageGrid) {
    let best = null;
    for (const key of Object.keys(charts)) {
      const ch = charts[key];
      if (ch.sex !== sex) continue;
      const zs = weighIns.map((w) => zFromWeight(lmsAt(ch, w.ageWeeks, ageGrid), w.kg));
      const score = zs.reduce((s, z) => s + z * z, 0) / Math.max(zs.length, 1);
      if (!best || score < best.score) best = { key, score };
    }
    return best;
  }

  /**
   * Breed-adjusted chart for a sexes-pooled adult weight `w` (same algorithm as pipeline/charts.py):
   * between the charts' reference weights, log M − log w, log S and L are interpolated linearly in log w,
   * then log w is added; beyond the lightest/heaviest reference, that chart's M is scaled by w / ref.
   */
  function chartForWeight(charts, sex, w) {
    const keys = Object.keys(charts).filter((k) => charts[k].sex === sex).sort((a, b) => charts[a].ref_adult_kg - charts[b].ref_adult_kg);
    const lw = keys.map((k) => Math.log(charts[k].ref_adult_kg));
    const x = Math.log(w);
    const meta = { sex, w };
    if (x <= lw[0] || x >= lw[lw.length - 1]) {
      const c = charts[keys[x <= lw[0] ? 0 : keys.length - 1]];
      const f = w / c.ref_adult_kg;
      return Object.assign({ L: c.L.slice(), M: c.M.map((v) => v * f), S: c.S.slice() }, meta);
    }
    let i = 0;
    while (lw[i] < x) i++;
    const j = i - 1, f = (x - lw[j]) / (lw[j + 1] - lw[j]);
    const a = charts[keys[j]], b = charts[keys[j + 1]];
    return Object.assign({
      L: a.L.map((v, k) => (1 - f) * v + f * b.L[k]),
      M: a.M.map((v, k) => Math.exp((1 - f) * (Math.log(v) - lw[j]) + f * (Math.log(b.M[k]) - lw[j + 1]) + x)),
      S: a.S.map((v, k) => Math.exp((1 - f) * Math.log(v) + f * Math.log(b.S[k]))),
    }, meta);
  }
  /** Median weight at the end of the chart (2 years). */
  function adultMedian(chart) { return chart.M[chart.M.length - 1]; }
  /** The pooled weight w whose breed-adjusted chart has median `adultKg` at 2 years (bisection in log w). */
  function weightForAdultMedian(charts, sex, adultKg) {
    let lo = Math.log(0.3), hi = Math.log(200);
    for (let it = 0; it < 60; it++) {
      const mid = (lo + hi) / 2;
      if (adultMedian(chartForWeight(charts, sex, Math.exp(mid))) < adultKg) lo = mid; else hi = mid;
    }
    return Math.exp((lo + hi) / 2);
  }

  // ---- energy -----------------------------------------------------------------------------
  /** FEDIAF 2025 Table VII-8b (Klein et al. 2019): puppies 8 weeks to 1 year, p = current / expected adult weight. */
  function meGrowthFediaf(kg, adultKg) {
    const p = Math.min(kg / adultKg, 1);
    return (254.1 - 135.0 * p) * Math.pow(kg, 0.75);
  }
  /** NRC 2006 growth equation (after weaning). */
  function meGrowthNrc(kg, adultKg) {
    const p = Math.min(kg / adultKg, 1);
    return 130 * Math.pow(kg, 0.75) * 3.2 * (Math.exp(-0.87 * p) - 0.1);
  }
  /**
   * FEDIAF 2025 adult maintenance, kcal per kg^0.75 per day.
   * Table VII-6 (by age, in completed years: 1–2, 3–7, over 7) and Table VII-7 (by activity).
   */
  const ADULT_FACTORS = {
    age_1_2: { k: 130, range: [125, 140], label: "1–2 years" },
    age_3_7: { k: 110, range: [95, 130], label: "3–7 years" },
    age_8plus: { k: 95, range: [80, 120], label: "over 7 years" },
    low: { k: 95, range: [95, 95], label: "low activity" },
    moderate_low: { k: 110, range: [110, 110], label: "1–3 h/day, low impact" },
    moderate_high: { k: 125, range: [125, 125], label: "1–3 h/day, high impact" },
    high: { k: 162.5, range: [150, 175], label: "working, 3–6 h/day" }, // the table gives 150–175; k is its midpoint
    obese_prone: { k: 90, range: [90, 90], label: "obese-prone" }, // the table gives 90 or less
  };
  /** Age band of FEDIAF Table VII-6 from age in weeks (completed years). */
  function adultAgeBand(ageWeeks) {
    const years = Math.floor(ageWeeks / WEEKS_PER_YEAR);
    return years <= 2 ? "age_1_2" : years <= 7 ? "age_3_7" : "age_8plus";
  }
  /** `factorKey` "by_age" (default) picks the Table VII-6 band from the age. */
  function meAdultFediaf(kg, factorKey, ageWeeks) {
    const key = !factorKey || factorKey === "by_age" ? adultAgeBand(ageWeeks || 104) : factorKey;
    const f = ADULT_FACTORS[key] || ADULT_FACTORS.age_1_2;
    const m = Math.pow(kg, 0.75);
    return { kcal: f.k * m, low: f.range[0] * m, high: f.range[1] * m, label: f.label };
  }
  /** NRC 2006 adult maintenance: inactive 95 to active 130 kcal per kg^0.75 (as quoted by WSAVA 2020). */
  function meAdultNrc(kg) {
    const m = Math.pow(kg, 0.75);
    return { low: 95 * m, high: 130 * m };
  }
  /** AAHA 2021 Box 1: RER = 70 kg^0.75 and life-stage factors. */
  function rer(kg) { return 70 * Math.pow(kg, 0.75); }
  const AAHA_FACTORS = {
    growth_lt4mo: [3.0, 3.0], growth_ge4mo: [2.0, 2.0], neutered_adult: [1.4, 1.6], intact_adult: [1.6, 1.8],
  };
  function meAaha(kg, factorKey) {
    const f = AAHA_FACTORS[factorKey];
    const r = rer(kg);
    return { low: f[0] * r, high: f[1] * r, kcal: (f[0] + f[1]) / 2 * r };
  }
  /** Growing while under 1 year, or under 2 years and below 95% of the expected adult weight. */
  function isGrowing(kg, adultKg, ageWeeks) {
    return ageWeeks < 52 || (adultKg > 0 && kg / adultKg < 0.95 && ageWeeks < 104);
  }
  /**
   * Daily energy estimate for a dog of known age, weight and expected adult weight.
   * Primary: FEDIAF 2025. Comparisons: NRC 2006 and AAHA 2021, each as a value or a [low, high] range.
   */
  function energyEstimate({ kg, adultKg, ageWeeks, neutered, adultFactor }) {
    if (isGrowing(kg, adultKg, ageWeeks)) {
      const fed = meGrowthFediaf(kg, adultKg), nrc = meGrowthNrc(kg, adultKg);
      const young = ageWeeks < 4 * WEEKS_PER_MONTH; // AAHA switches factor at 4 months
      const aaha = meAaha(kg, young ? "growth_lt4mo" : "growth_ge4mo");
      return {
        stage: "growth", kcal: fed, basisLabel: "growing",
        comparisons: [{ name: "NRC 2006", kcal: nrc }, { name: `AAHA 2021 · RER × ${young ? 3 : 2}`, kcal: aaha.kcal }],
        low: Math.min(fed, nrc, aaha.low), high: Math.max(fed, nrc, aaha.high),
        extrapolated: ageWeeks > 52,
      };
    }
    const fed = meAdultFediaf(kg, adultFactor, ageWeeks);
    const nrc = meAdultNrc(kg);
    const aaha = meAaha(kg, neutered ? "neutered_adult" : "intact_adult");
    return {
      stage: "adult", kcal: fed.kcal, basisLabel: `adult, ${fed.label}`,
      comparisons: [{ name: "NRC 2006 · inactive–active", low: nrc.low, high: nrc.high }, { name: `AAHA 2021 · ${neutered ? "neutered" : "intact"}`, low: aaha.low, high: aaha.high }],
      low: Math.min(fed.low, nrc.low, aaha.low), high: Math.max(fed.high, nrc.high, aaha.high),
      extrapolated: false,
    };
  }
  /** Food energy given on a label, converted to kcal per gram; `per` is "kcal/kg", "kcal/100g", "kJ/100g" or "kcal/cup". */
  const FOOD_UNITS = {
    "kcal/kg": { toKcalPerUnit: (v) => v / 1000, unit: "g" },
    "kcal/100g": { toKcalPerUnit: (v) => v / 100, unit: "g" },
    "kJ/100g": { toKcalPerUnit: (v) => v / KJ_PER_KCAL / 100, unit: "g" },
    "kcal/cup": { toKcalPerUnit: (v) => v, unit: "cup" },
  };
  /** Amount of food per day (grams, or cups for kcal/cup) for an energy target and a share of energy from treats. */
  function foodPerDay(kcal, value, per, treatShare) {
    const u = FOOD_UNITS[per] || FOOD_UNITS["kcal/kg"];
    const perUnit = u.toKcalPerUnit(value);
    return { amount: (kcal * (1 - (treatShare || 0))) / perUnit, unit: u.unit, treatsKcal: kcal * (treatShare || 0) };
  }

  return {
    WEEKS_PER_YEAR, WEEKS_PER_MONTH, KG_PER_LB, KJ_PER_KCAL, CENTILE_LINES,
    normCdf, normInv, lmsAt, zFromWeight, weightFromZ, centileFromZ, transformAge, gpPredict, project, linesBetween, growthFlags,
    bestFittingChart, chartForWeight, adultMedian, weightForAdultMedian, meGrowthFediaf, meGrowthNrc, meAdultFediaf, meAdultNrc, adultAgeBand, rer, meAaha,
    isGrowing, energyEstimate, foodPerDay, ADULT_FACTORS, AAHA_FACTORS, FOOD_UNITS,
  };
});
