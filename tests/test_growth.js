// Run with: node --test tests/test_growth.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const G = require(path.join(__dirname, "..", "app", "growth.js"));
const MODEL = path.join(__dirname, "..", "app", "model");
const CH = JSON.parse(fs.readFileSync(path.join(MODEL, "centiles.json"), "utf8"));
const TR = JSON.parse(fs.readFileSync(path.join(MODEL, "tracking.json"), "utf8"));
const BR = JSON.parse(fs.readFileSync(path.join(MODEL, "breeds.json"), "utf8"));
const GRID = CH.age_weeks;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} expected ${b} got ${a}`);
const zAt = (chart, wk, kg) => G.zFromWeight(G.lmsAt(chart, wk, GRID), kg);

test("normal distribution helpers", () => {
  close(G.normCdf(1.959964), 0.975, 1e-6);
  close(G.normCdf(-1), 0.158655, 1e-6);
  close(G.normInv(0.975), 1.959964, 5e-6);
  close(G.normInv(0.004), -2.652070, 5e-6);
  for (const p of [0.001, 0.02, 0.09, 0.25, 0.5, 0.75, 0.91, 0.98, 0.999]) close(G.normCdf(G.normInv(p)), p, 1e-8, "round trip");
});

test("category tables are complete, ordered and carry reference weights", () => {
  assert.equal(GRID[0], 8); assert.equal(GRID[GRID.length - 1], 104); assert.equal(GRID.length, 97);
  for (const key of ["I_F", "I_M", "II_F", "II_M", "III_F", "III_M", "IV_F", "IV_M", "V_F", "V_M", "VI_F", "VI_M"]) {
    const ch = CH.charts[key];
    assert.equal(ch.M.length, GRID.length, key);
    assert.ok(ch.ref_adult_kg > 0, key);
    for (let i = 1; i < GRID.length; i++) assert.ok(ch.M[i] >= ch.M[i - 1] * 0.999, `${key}: median non-decreasing at week ${GRID[i]}`);
    for (let i = 0; i < GRID.length; i++) assert.ok(ch.S[i] > 0.03 && ch.S[i] < 0.6, `${key}: S plausible`);
    const lms = G.lmsAt(ch, 30, GRID);
    const q = [-2.67, -2, -1.33, -0.67, 0, 0.67, 1.33, 2, 2.67].map((z) => G.weightFromZ(lms, z));
    for (let i = 1; i < q.length; i++) assert.ok(q[i] > q[i - 1], `${key}: centiles ordered`);
  }
  for (const c of ["I", "II", "III", "IV", "V", "VI"]) assert.ok(CH.charts[`${c}_M`].M[96] > CH.charts[`${c}_F`].M[96], `${c}: males heavier`);
  for (const k of Object.values(CH.shrink)) assert.ok(k >= 0 && k <= 1);
});

test("breed-adjusted charts match the Python pipeline (pipeline/charts.py)", () => {
  const ref = [["M", 18.5, 16, 7.5, -0.168231, 19.0743], ["F", 3.6, 20, 1.9, 0.123353, 2.8687], ["M", 60.0, 30, 38.0, -1.109291, 62.2194],
    ["F", 34.09, 52, 27.0, 0.077705, 29.2119], ["M", 4.72, 12, 1.4, -0.414455, 4.6978]];
  for (const [sex, w, wk, kg, z, med] of ref) {
    const ch = G.chartForWeight(CH.charts, sex, w);
    close(zAt(ch, wk, kg), z, 1e-5, `z ${sex} ${w}`);
    close(G.adultMedian(ch), med, 1e-3, `median ${sex} ${w}`);
  }
  // equals the category chart at its reference weight
  const c = CH.charts.III_F, ch = G.chartForWeight(CH.charts, "F", c.ref_adult_kg);
  for (let i = 0; i < GRID.length; i += 8) { close(ch.M[i], c.M[i], 1e-9); close(ch.S[i], c.S[i], 1e-9); close(ch.L[i], c.L[i], 1e-9); }
  // adult median increases with the weight index, and inverts
  let prev = 0;
  for (const w of [2, 3, 5, 8, 12, 20, 30, 40, 55, 70]) { const m = G.adultMedian(G.chartForWeight(CH.charts, "M", w)); assert.ok(m > prev); prev = m; }
  for (const e of [3, 9.5, 25, 33.6, 60]) close(G.adultMedian(G.chartForWeight(CH.charts, "M", G.weightForAdultMedian(CH.charts, "M", e))), e, 1e-6, "inverse");
});

test("tracking model: GP prediction and behaviour", () => {
  for (const kind of ["weight", "category"]) { assert.ok(TR[kind].nugget > 0 && TR[kind].nugget < 0.2); assert.ok(TR[kind].ell > 0.5); }
  const tr = { transform: "boxcox-0.25", nugget: 0.0639, ell: 3.9399 };
  const s = [12, 20, 30].map((w) => G.transformAge(w, tr.transform));
  close(s[0], -1.77614, 1e-5); close(G.transformAge(104, tr.transform), 0.63353, 1e-5);
  const p = G.gpPredict(s, [0.8, 1.1, 0.6], G.transformAge(104, tr.transform), tr);
  close(p.mean, 0.484771, 1e-5); close(p.sd, 0.724669, 1e-5);
  close(G.transformAge(52.1786, "log"), 0, 1e-4);
  assert.throws(() => G.transformAge(20, "pow0.1"), /unknown age transform/);
  close(G.WEEKS_PER_MONTH * 12, G.WEEKS_PER_YEAR, 1e-12);
  const none = G.gpPredict([], [], 0, tr);
  assert.equal(none.mean, 0); assert.equal(none.sd, 1);
  const same = G.gpPredict([s[0]], [1.0], s[0], tr);
  close(same.mean, 1 - tr.nugget, 1e-9); close(same.sd, Math.sqrt(1 - (1 - tr.nugget) ** 2), 1e-9);
  const far = G.gpPredict([s[0]], [2.0], 50, tr);
  assert.ok(far.mean < 0.1 && far.sd > 0.99);
});

test("project() uses in-range weigh-ins and returns ordered bands", () => {
  const ch = G.chartForWeight(CH.charts, "M", 34.15);
  const r = G.project(ch, [{ ageWeeks: 12, kg: 8.9 }, { ageWeeks: 20, kg: 17.5 }, { ageWeeks: 5, kg: 2 }], TR.weight, GRID);
  assert.equal(r.observations.length, 2);
  assert.equal(r.points.length, GRID.length);
  const last = r.points[GRID.length - 1];
  assert.ok(last.kg.q5 < last.kg.q25 && last.kg.q25 < last.kg.q50 && last.kg.q50 < last.kg.q75 && last.kg.q75 < last.kg.q95);
  assert.ok(last.zSd > 0.4 && last.zSd < 1);
});

test("growth flags", () => {
  const ch = CH.charts.III_F;
  const crossing = G.growthFlags(G.project(ch, [{ ageWeeks: 12, kg: 3.0 }, { ageWeeks: 30, kg: 12.0 }], TR.category, GRID).observations);
  assert.ok(crossing.some((f) => f.code === "crossing_up"));
  const nogain = G.growthFlags(G.project(ch, [{ ageWeeks: 12, kg: 4.0 }, { ageWeeks: 16, kg: 3.9 }], TR.category, GRID).observations);
  assert.ok(nogain.some((f) => f.code === "no_gain"));
  for (const f of crossing.concat(nogain)) assert.ok(!/vet|should|keep|adjust/i.test(f.text), "flags state facts, not advice");
  // lines are the drawn centiles; extremes at the 2nd and 98th centile (z = 2.054), not z = 2
  assert.deepEqual(G.CENTILE_LINES, [0.02, 0.09, 0.25, 0.5, 0.75, 0.91, 0.98]);
  assert.equal(G.linesBetween(-0.1, 0.1), 1); assert.equal(G.linesBetween(0.1, 1.5), 2); assert.equal(G.linesBetween(1.5, -0.7), 4);
  const obs = (zs) => zs.map((z, i) => ({ ageWeeks: 12 + 4 * i, kg: 10 + i, z, lms: { L: 1, M: 10 + i, S: 0.1 } }));
  const codes = (zs) => G.growthFlags(obs(zs)).map((f) => f.code);
  assert.ok(!codes([0, 2.03]).includes("above98")); assert.ok(codes([0, 2.06]).includes("above98")); assert.ok(codes([0, -2.06]).includes("below2"));
  assert.ok(!codes([-0.1, 1.0]).includes("crossing_up"), "two lines crossed is not flagged");
  assert.ok(codes([-0.1, 1.4]).includes("crossing_up"), "three lines crossed is flagged");
  assert.ok(codes([0.1, -1.4, 0.0]).includes("crossing_down"), "counted at the weight furthest from the first");
});

test("size groups and breed table", () => {
  // one definition (pipeline/charts.py SIZE_GROUPS), exported as centiles.json size_groups: contiguous, I-VI, one chart pair each
  const groups = CH.size_groups;
  assert.deepEqual(groups.map((g) => g.id), ["I", "II", "III", "IV", "V", "VI"]);
  assert.equal(groups[0].min_kg, 0); assert.equal(groups[groups.length - 1].max_kg, null);
  groups.forEach((g, i) => {
    if (i) assert.equal(g.min_kg, groups[i - 1].max_kg, `${g.id} starts where the previous group ends`);
    for (const sex of ["F", "M"]) assert.equal(CH.charts[`${g.id}_${sex}`].category, g.id);
  });
  assert.equal(Object.keys(CH.charts).length, 2 * groups.length);
  const groupOf = (w) => groups.find((g) => w >= g.min_kg && (g.max_kg === null || w < g.max_kg)).id;
  assert.equal(groupOf(6.49), "I"); assert.equal(groupOf(6.5), "II"); assert.equal(groupOf(14.99), "III");
  assert.equal(groupOf(29.9), "IV"); assert.equal(groupOf(39.9), "V"); assert.equal(groupOf(40), "VI");
  assert.equal(BR.breeds["Labrador Retriever"].category, "V");
  assert.equal(BR.breeds["Chihuahua"].category, "I");
  assert.equal(BR.breeds["Beagle"].category, "III");
  assert.equal(BR.breeds["Great Dane"].category, "VI");
  assert.ok(Object.keys(BR.breeds).length > 150);
  for (const [n, e] of Object.entries(BR.breeds)) {
    assert.ok(e.w > 1 && e.w < 90, n);
    assert.equal(groupOf(e.w), e.category, `${n}: weight sits in its size group`);
  }
  // shrinkage as in pipeline/charts.py
  const k = CH.shrink.I, ref = CH.charts.I_M.ref_adult_kg;
  close(Math.exp(Math.log(ref) + k * (Math.log(3.6) - Math.log(ref))), 3.74506, 1e-4);
});

test("energy formulas against hand calculation", () => {
  const m = Math.pow(10, 0.75);
  close(G.meGrowthFediaf(10, 30), (254.1 - 135 / 3) * m, 1e-6);
  close(G.meGrowthNrc(10, 30), 130 * m * 3.2 * (Math.exp(-0.87 / 3) - 0.1), 1e-6);
  close(G.rer(10), 70 * m, 1e-9);
  assert.ok(G.meGrowthFediaf(5, 30) < G.meGrowthNrc(5, 30));
  close(G.meGrowthFediaf(5, 30) / G.meGrowthNrc(5, 30), 0.74, 0.03);
  const grow = G.energyEstimate({ kg: 10, adultKg: 30, ageWeeks: 16, neutered: false, adultFactor: "by_age" });
  assert.equal(grow.stage, "growth"); close(grow.kcal, G.meGrowthFediaf(10, 30), 1e-9);
  assert.equal(grow.comparisons.length, 2);
  // adults by FEDIAF age band (completed years): 1-2 -> 130, 3-7 -> 110, 8+ -> 95
  const kg = 30, b = Math.pow(kg, 0.75), wpy = G.WEEKS_PER_YEAR;
  close(G.energyEstimate({ kg, adultKg: kg, ageWeeks: 1.5 * wpy, adultFactor: "by_age" }).kcal, 130 * b, 1e-6);
  close(G.energyEstimate({ kg, adultKg: kg, ageWeeks: 2.9 * wpy, adultFactor: "by_age" }).kcal, 130 * b, 1e-6);
  close(G.energyEstimate({ kg, adultKg: kg, ageWeeks: 4.5 * wpy, adultFactor: "by_age" }).kcal, 110 * b, 1e-6);
  close(G.energyEstimate({ kg, adultKg: kg, ageWeeks: 8.2 * wpy, adultFactor: "by_age" }).kcal, 95 * b, 1e-6);
  close(G.energyEstimate({ kg, adultKg: kg, ageWeeks: 4.5 * wpy, adultFactor: "low" }).kcal, 95 * b, 1e-6);
  const ad = G.energyEstimate({ kg, adultKg: kg, ageWeeks: 4.5 * wpy, neutered: true, adultFactor: "by_age" });
  close(ad.comparisons[0].low, 95 * b, 1e-6); close(ad.comparisons[0].high, 130 * b, 1e-6);
  close(ad.comparisons[1].low, 1.4 * 70 * b, 1e-6); close(ad.comparisons[1].high, 1.6 * 70 * b, 1e-6);
  // growing past 1 year while below 95% of adult weight
  assert.equal(G.energyEstimate({ kg: 40, adultKg: 50, ageWeeks: 60 }).stage, "growth");
  assert.equal(G.energyEstimate({ kg: 49, adultKg: 50, ageWeeks: 60 }).stage, "adult");
});

test("food amount from label units", () => {
  close(G.foodPerDay(1000, 4000, "kcal/kg", 0.1).amount, 225, 1e-9);
  close(G.foodPerDay(1000, 400, "kcal/100g", 0).amount, 250, 1e-9);
  close(G.foodPerDay(1000, 1673.6, "kJ/100g", 0).amount, 250, 1e-6);
  const cups = G.foodPerDay(1000, 400, "kcal/cup", 0);
  assert.equal(cups.unit, "cup"); close(cups.amount, 2.5, 1e-9);
  close(G.foodPerDay(1000, 4000, "kcal/kg", 0.1).treatsKcal, 100, 1e-9);
});
