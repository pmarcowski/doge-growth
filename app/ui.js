/* ui.js — state, form handling, dropdowns and SVG charts for the Doge Growth page. */
(function () {
  "use strict";
  const G = window.Growth;
  const MODEL = window.DOGE_MODEL;
  const CH = MODEL.centiles, TR = MODEL.tracking, BR = MODEL.breeds;
  const GRID = CH.age_weeks;
  const AGE_MIN = GRID[0], AGE_MAX = GRID[GRID.length - 1];
  const GROUPS = CH.size_groups; // adult-size groups I-VI: {id, label, min_kg, max_kg}, from pipeline/charts.py
  const FOOD_PER = [["kcal/kg", "kcal/kg"], ["kcal/cup", "kcal/cup"], ["kcal/100g", "kcal/100 g"], ["kJ/100g", "kJ/100 g"]];
  const FOOD_PLAUSIBLE = { "kcal/kg": [600, 6000], "kcal/cup": [150, 700], "kcal/100g": [60, 600], "kJ/100g": [250, 2500] };
  const ACTIVITY = [["by_age", "By age (FEDIAF)"], ["low", "Low activity, under 1 h/day"], ["moderate_low", "1–3 h/day, low impact"],
    ["moderate_high", "1–3 h/day, high impact"], ["high", "Working, 3–6 h/day"], ["obese_prone", "Obese-prone"]];
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Material Symbols paths (Apache 2.0), inlined so the page has no icon-font dependency
  const ICONS = {
    add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    warning: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
    expand_more: "M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z",
    code: "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
    dark_mode: "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z",
    light_mode: "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z",
    download: "M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z",
    help: "M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z",
    close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    pets: "M4.5 12a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm4.5-4a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm6 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm4.5 4a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm-2.16 2.86c-.87-1.02-1.6-1.89-2.48-2.91-.46-.54-1.05-1.08-1.75-1.32-.11-.04-.22-.07-.33-.09-.25-.04-.52-.04-.78-.04s-.53 0-.79.05c-.11.02-.22.05-.33.09-.7.24-1.28.78-1.75 1.32-.87 1.02-1.6 1.89-2.48 2.91-1.31 1.31-2.92 2.76-2.62 4.79.29 1.02 1.02 2.03 2.33 2.32.73.15 3.06-.44 5.54-.44h.18c2.48 0 4.81.58 5.54.44 1.31-.29 2.04-1.31 2.33-2.32.31-2.04-1.3-3.49-2.61-4.8z",
  };
  const iconSvg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
  const icon = (name, cls) => `<span class="icon ${cls || ""}">${iconSvg(name)}</span>`;

  // ---- state ------------------------------------------------------------------------------
  const pad2 = (n) => String(n).padStart(2, "0");
  const today = ((d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`)(new Date()); // the local date
  const DEFAULTS = {
    name: "", sex: "M", breed: "", adultKg: null, adultSource: "none", birthDate: "", ageMode: "date", weighIns: [{ date: today, kg: null }],
    unit: "kg", eunit: "kcal", food: { value: null, per: "kcal/kg" }, treatShare: 0, activity: "by_age", neutered: false, mixedChosen: false,
  };
  const STORE_KEY = "doge-growth-state", STORE_VERSION = 1;
  /** Saved inputs, field by field: anything missing, malformed or out of range falls back to the default. */
  function loadState() {
    const s = JSON.parse(JSON.stringify(DEFAULTS));
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return s; }
    if (!saved || typeof saved !== "object" || (saved.v !== undefined && saved.v !== STORE_VERSION)) return s;
    const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
    const positive = (v, max) => typeof v === "number" && isFinite(v) && v > 0 && v <= max ? v : null;
    if (typeof saved.name === "string") s.name = saved.name.slice(0, 40);
    if (saved.sex === "F") s.sex = "F";
    if (typeof saved.breed === "string" && BR.breeds[saved.breed]) s.breed = saved.breed;
    s.adultKg = positive(saved.adultKg, 150);
    s.adultSource = saved.adultSource === "user" && s.adultKg ? "user" : s.breed ? "breed" : "none";
    if (s.adultSource !== "user") s.adultKg = null;
    if (isDate(saved.birthDate)) s.birthDate = saved.birthDate;
    if (saved.ageMode === "months") s.ageMode = "months";
    if (Array.isArray(saved.weighIns)) {
      const w = saved.weighIns.filter((o) => o && typeof o === "object").slice(0, 200).map((o) => ({ date: isDate(o.date) ? o.date : "", kg: positive(o.kg, 150) }));
      if (w.length) s.weighIns = w;
    }
    if (saved.unit === "lb") s.unit = "lb";
    if (saved.eunit === "kJ") s.eunit = "kJ";
    if (saved.food && typeof saved.food === "object") {
      s.food.value = positive(saved.food.value, 100000);
      if (FOOD_PER.some(([v]) => v === saved.food.per)) s.food.per = saved.food.per;
    }
    if (typeof saved.treatShare === "number" && saved.treatShare >= 0 && saved.treatShare <= 0.25) s.treatShare = saved.treatShare;
    if (ACTIVITY.some(([v]) => v === saved.activity)) s.activity = saved.activity;
    s.neutered = saved.neutered === true;
    s.mixedChosen = saved.mixedChosen === true && !s.breed;
    return s;
  }
  let state = loadState();
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: STORE_VERSION, ...state })); } catch { /* storage unavailable */ } }

  // ---- units and formatting ---------------------------------------------------------------
  const toUnit = (kg) => state.unit === "lb" ? kg / G.KG_PER_LB : kg;
  const fromUnit = (v) => state.unit === "lb" ? v * G.KG_PER_LB : v;
  const fmtW = (kg, d) => { const v = toUnit(kg); return v.toFixed(d !== undefined ? d : (v < 10 ? 2 : 1)); };
  const unitLabel = () => state.unit;
  const toE = (kcal) => state.eunit === "kJ" ? kcal * G.KJ_PER_KCAL : kcal;
  /** Energy shown to the precision the estimates support: 10 kcal or 50 kJ. */
  const fmtE = (kcal) => { const step = state.eunit === "kJ" ? 50 : 10; return (Math.round(toE(kcal) / step) * step).toLocaleString(); };
  const ordinal = (n) => { const r = Math.round(n); const s = ["th", "st", "nd", "rd"], v = r % 100; return r + (s[(v - 20) % 10] || s[v] || s[0]); };
  const fmtAge = (w) => {
    if (w < 16) return `${w.toFixed(w < 10 ? 1 : 0)} wk`;
    const m = w / G.WEEKS_PER_MONTH; return m < 24 ? `${m.toFixed(m < 10 ? 1 : 0)} mo` : `${(w / G.WEEKS_PER_YEAR).toFixed(1)} y`;
  };
  /** Food per day to the precision shown on screen and in the table: 0.1 cup, or 5 g (10 g from 1 kg). */
  const foodAmount = (f) => {
    if (f.unit === "cup") return Math.round(f.amount * 10) / 10;
    const step = f.amount >= 1000 ? 10 : 5;
    return Math.max(step, Math.round(f.amount / step) * step);
  };
  const fmtAmount = (f) => { const v = foodAmount(f); return f.unit === "cup" ? `${v.toFixed(1)} ${v === 1 ? "cup" : "cups"}` : `${v.toLocaleString()} g`; };
  function ageWeeksAt(dateStr) {
    if (!state.birthDate || !dateStr) return null;
    const d = (new Date(dateStr) - new Date(state.birthDate)) / (7 * 86400e3);
    return isFinite(d) ? d : null;
  }
  /** Age today in months (to 0.1), shown when the age is entered in months; the birth date stays the stored value. */
  function ageMonthsToday() { const w = ageWeeksAt(today); return w === null || w < 0 ? null : Math.round(w / G.WEEKS_PER_MONTH * 10) / 10; }
  /** Birth date for an age today in months, to the day. */
  function birthDateForMonths(m) {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - Math.round(m * G.WEEKS_PER_MONTH * 7));
    return d.toISOString().slice(0, 10);
  }
  const ageWhat = () => state.ageMode === "months" ? "the age in months" : "the date of birth";

  // ---- chart choice -----------------------------------------------------------------------
  function breedEntry() { return state.breed && BR.breeds[state.breed] ? BR.breeds[state.breed] : null; }
  /** Breed weight for charting: breeds placed in a size group by Salt et al. are shrunk toward its reference weight. */
  function breedChartWeight(b) {
    if (!b.shrink) return b.w;
    const ref = CH.charts[`${b.category}_${state.sex}`].ref_adult_kg;
    const k = CH.shrink[b.category];
    return Math.exp(Math.log(ref) + k * (Math.log(b.w) - Math.log(ref)));
  }
  /** The chart in use: breed-adjusted when a breed or adult weight is known, else the size chart that fits the weigh-ins. */
  function chartChoice(usable) {
    if (state.adultSource === "user" && state.adultKg) {
      const w = G.weightForAdultMedian(CH.charts, state.sex, state.adultKg);
      return { chart: G.chartForWeight(CH.charts, state.sex, w), mode: "user", tracking: TR.weight };
    }
    const b = breedEntry();
    if (b) return { chart: G.chartForWeight(CH.charts, state.sex, breedChartWeight(b)), mode: "breed", tracking: TR.weight };
    if (usable.length) {
      const best = G.bestFittingChart(CH.charts, state.sex, usable, GRID);
      return { chart: CH.charts[best.key], mode: "fitted", tracking: TR.category };
    }
    return { chart: CH.charts[`IV_${state.sex}`], mode: "none", tracking: TR.category };
  }
  /** Typical healthy adult weight at 2 years for the chart in use (what the adult-weight field shows). */
  function expectedAdultKg() {
    if (state.adultSource === "user" && state.adultKg) return state.adultKg;
    const b = breedEntry();
    return b ? G.adultMedian(G.chartForWeight(CH.charts, state.sex, breedChartWeight(b))) : null;
  }

  // ---- computation ------------------------------------------------------------------------
  function compute() {
    const obsIn = state.weighIns
      .map((w) => ({ ...w, ageWeeks: ageWeeksAt(w.date) }))
      .filter((w) => w.kg > 0 && w.ageWeeks !== null && w.ageWeeks >= 0)
      .sort((a, b) => a.ageWeeks - b.ageWeeks);
    const usable = obsIn.filter((w) => w.ageWeeks >= AGE_MIN && w.ageWeeks <= AGE_MAX);
    const choice = chartChoice(usable);
    const proj = G.project(choice.chart, usable, choice.tracking, GRID);
    const flags = G.growthFlags(proj.observations);
    const todayAge = ageWeeksAt(today);
    const last = proj.observations[proj.observations.length - 1] || null;
    const latest = obsIn[obsIn.length - 1] || null;
    const adult = proj.points[proj.points.length - 1];
    const adultKgEst = usable.length ? adult.kg.q50 : expectedAdultKg();
    let status = "empty";
    if (latest && latest.ageWeeks > AGE_MAX) status = "adult";
    else if (usable.length) status = "growing";
    else if (latest) status = "early";
    // weight the energy estimate is for: an adult weigh-in; else the projected median today; else the latest weigh-in
    let basis = null;
    if (status === "adult") basis = { kg: latest.kg, ageWeeks: Math.max(latest.ageWeeks, todayAge || 0), projected: false };
    else if (last) {
      if (todayAge !== null && todayAge > last.ageWeeks + 1) {
        const a = Math.min(todayAge, AGE_MAX);
        basis = { kg: proj.points[Math.round(a) - AGE_MIN].kg.q50, ageWeeks: todayAge, projected: true };
      } else basis = { kg: last.kg, ageWeeks: last.ageWeeks, projected: false };
    }
    let energy = null;
    if (basis) {
      const adultKg = adultKgEst || basis.kg;
      energy = G.energyEstimate({ kg: basis.kg, adultKg, ageWeeks: basis.ageWeeks, neutered: state.neutered, adultFactor: state.activity });
    }
    return { ...choice, proj, flags, usable, obsIn, todayAge, last, latest, adult, adultKgEst, basis, energy, status };
  }

  // ---- rendering: form --------------------------------------------------------------------
  function renderForm() {
    $("#dogName").value = state.name;
    const sel = (els, key, val) => els.forEach((b) => { const on = b.dataset[key] === val; b.classList.toggle("is-selected", on); b.setAttribute("aria-pressed", on); });
    sel($$("[data-sex]"), "sex", state.sex); sel($$("[data-unit]"), "unit", state.unit); sel($$("[data-eunit]"), "eunit", state.eunit);
    $$(".unit-label").forEach((e) => e.textContent = unitLabel());
    if (document.activeElement !== $("#breed")) $("#breed").value = state.breed;
    const aw = $("#adultWeight");
    if (document.activeElement !== aw) { const e = expectedAdultKg(); aw.value = e ? (+fmtW(e, 1)) : ""; }
    const months = state.ageMode === "months";
    sel($$("[data-agemode]"), "agemode", state.ageMode);
    $("#birthDate").hidden = months; $("#ageMonths").hidden = !months;
    const ageLabel = $("#ageLabel");
    ageLabel.htmlFor = months ? "ageMonths" : "birthDate";
    ageLabel.textContent = months ? "Age today, months" : "Date of birth";
    $("#birthDate").value = state.birthDate;
    if (document.activeElement !== $("#ageMonths")) { const m = ageMonthsToday(); $("#ageMonths").value = m === null ? "" : m; }
    if (document.activeElement !== $("#foodValue")) $("#foodValue").value = state.food.value || "";
    $("#foodPer .dropdown__value").textContent = FOOD_PER.find(([v]) => v === state.food.per)[1];
    $("#foodValue").placeholder = { "kcal/kg": "e.g. 3800", "kcal/cup": "e.g. 400", "kcal/100g": "e.g. 380", "kJ/100g": "e.g. 1600" }[state.food.per];
    const plaus = FOOD_PLAUSIBLE[state.food.per], fv = state.food.value;
    const warn = $("#foodWarn");
    warn.hidden = !(fv > 0 && (fv < plaus[0] || fv > plaus[1]));
    warn.textContent = `Unusual for ${FOOD_PER.find(([v]) => v === state.food.per)[1]}. Check the unit on the label.`;
    $("#treatShare").value = Math.round(state.treatShare * 100);
    $("#treatShareValue").textContent = Math.round(state.treatShare * 100) + "%";
    $("#activity .dropdown__value").textContent = ACTIVITY.find(([v]) => v === state.activity)[1];
    $("#neutered").checked = state.neutered;
    refreshWeighInNotes();
  }
  function weighInNote(w, r) {
    const age = ageWeeksAt(w.date);
    if (!state.birthDate) return `Enter ${ageWhat()} to place this weigh-in.`;
    if (age === null) return "";
    if (age < 0) return "Before the date of birth.";
    if (age < AGE_MIN) return `${fmtAge(age)} · before 8 weeks, not charted`;
    if (age > AGE_MAX) return `${fmtAge(age)} · adult, beyond the 2-year chart`;
    const o = r && r.proj.observations.find((x) => Math.abs(x.ageWeeks - age) < 1e-6 && Math.abs(x.kg - w.kg) < 1e-9);
    return fmtAge(age) + (o ? ` · ${ordinal(o.centile)} centile` : "");
  }
  function refreshWeighInNotes(r) {
    $$(".weighin").forEach((row, i) => { const w = state.weighIns[i]; if (w) row.querySelector(".weighin__age").textContent = weighInNote(w, r); });
  }
  /** Rebuild the weigh-in rows (only on add/remove/unit change, so typing keeps focus). */
  function renderWeighIns() {
    const box = $("#weighIns"), keep = box.scrollTop;
    box.innerHTML = "";
    state.weighIns.forEach((w, i) => {
      const row = document.createElement("div");
      row.className = "weighin";
      row.innerHTML = `
        <div class="field"><input class="field__input wi-date" type="date" value="${esc(w.date || "")}" aria-label="Weigh-in date" max="${today}"></div>
        <div class="field"><input class="field__input wi-kg" type="number" inputmode="decimal" min="0.1" step="0.01" placeholder="${unitLabel()}" aria-label="Weight in ${unitLabel()}" value="${w.kg ? +fmtW(w.kg, 2) : ""}"></div>
        <button type="button" class="icon-btn wi-del" aria-label="Remove weigh-in" ${state.weighIns.length === 1 ? "disabled" : ""}>${icon("delete")}</button>
        <div class="weighin__age">${weighInNote(w)}</div>`;
      row.querySelector(".wi-date").addEventListener("change", (e) => { state.weighIns[i].date = e.target.value; update(false); });
      row.querySelector(".wi-kg").addEventListener("input", (e) => { const v = parseFloat(e.target.value); state.weighIns[i].kg = v > 0 ? fromUnit(v) : null; update(false); });
      row.querySelector(".wi-del").addEventListener("click", () => { state.weighIns.splice(i, 1); renderWeighIns(); update(); });
      box.appendChild(row);
    });
    box.scrollTop = keep;
    weighInScrollCue();
  }
  /** At two-column widths the list scrolls inside its card past three rows; fade the edge that hides rows. */
  function weighInScrollCue() {
    const b = $("#weighIns"), over = b.scrollHeight > b.clientHeight + 1;
    b.classList.toggle("fade-top", over && b.scrollTop > 1);
    b.classList.toggle("fade-bottom", over && b.scrollTop + b.clientHeight < b.scrollHeight - 1);
  }

  // ---- rendering: summary -----------------------------------------------------------------
  function chartName(r) {
    const sexWord = state.sex === "M" ? "male" : "female";
    if (r.mode === "breed") return `${state.breed}, ${sexWord}`;
    if (r.mode === "user") return `${sexWord[0].toUpperCase() + sexWord.slice(1)}, ${fmtW(state.adultKg, 1)} ${unitLabel()} adult`;
    if (r.mode === "none") return `Median by adult size, ${sexWord}`;
    const g = GROUPS.find((s) => s.id === r.chart.category);
    return `${g.label} (${sizeLabel(g)}), ${sexWord}`;
  }
  // Growth flags sit under the weigh-ins they describe, inside the weigh-in card, so the grid never moves (the list
  // above them scrolls if they need the room). While typing they wait for a pause, so intermediate values ("1" on
  // the way to "16.9") do not flash warnings.
  let flagTimer = null, flagsShown = "";
  function renderFlags(r, lazy) {
    const box = $("#flags");
    const html = r.status === "growing" ? r.flags.map((f) => `<div class="flag">${icon("warning")}<span>${f.text}</span></div>`).join("") : "";
    const apply = () => {
      const grew = html.length > flagsShown.length;
      box.innerHTML = html; flagsShown = html;
      // if the list just got shorter, keep the row being edited in view, or else the latest weigh-ins
      const list = $("#weighIns"), a = document.activeElement;
      if (a && list.contains(a)) a.scrollIntoView({ block: "nearest" }); else if (grew) list.scrollTop = list.scrollHeight;
      weighInScrollCue();
    };
    clearTimeout(flagTimer);
    if (html === flagsShown) return;
    if (lazy) flagTimer = setTimeout(apply, 700); else apply();
  }
  /**
   * Getting started, before the first weigh-in: what the inputs so far predict, from the chart in use
   * (typical weight at 2 years after a breed, at today's age once the birth date is known), and the next input.
   */
  function guide(r) {
    const sexWord = state.sex === "M" ? "male" : "female";
    const w1 = (kg) => `${fmtW(kg, 1)} ${unitLabel()}`;
    const at = (chart, wk) => { const lms = G.lmsAt(chart, wk, GRID); return { m: lms.M, lo: G.weightFromZ(lms, -1.645), hi: G.weightFromZ(lms, 1.645) }; };
    const spread = (p) => `(90% of dogs: ${fmtW(p.lo, 1)}–${w1(p.hi)})`;
    const ageWords = (w) => { const m = w / G.WEEKS_PER_MONTH; return w < 16 ? `${Math.round(w)} weeks` : `${m < 10 ? m.toFixed(1) : Math.round(m)} months`; };
    const age = r.todayAge, charted = age !== null && age >= AGE_MIN && age <= AGE_MAX;
    const subject = r.mode === "breed" ? `a typical ${sexWord} ${esc(state.breed)}` : r.mode === "user" ? `a typical ${sexWord} growing to ${+fmtW(state.adultKg, 1)} ${unitLabel()}` : null;
    let pred = "";
    if (subject && charted) { const p = at(r.chart, age); pred = `At ${ageWords(age)}, ${subject} weighs <b>${w1(p.m)}</b> ${spread(p)}.`; }
    else if (r.mode === "breed") { const p = at(r.chart, AGE_MAX); pred = `At 2 years${age > AGE_MAX ? " and older" : ""}, ${subject} weighs <b>${w1(p.m)}</b> ${spread(p)}.`; }
    else if (!subject && charted) {
      const lo = at(CH.charts[`I_${state.sex}`], age).m, hi = at(CH.charts[`VI_${state.sex}`], age).m;
      pred = `At ${ageWords(age)}, a typical ${sexWord} weighs from <b>${w1(lo)}</b> in toy breeds to <b>${w1(hi)}</b> in giant breeds.`;
    }
    return { text: pred || "Charts your puppy's growth, projects its adult weight and estimates daily energy.", next: nextStepText(r, guideSteps(r)) };
  }
  /**
   * The inputs in form order. A step is done when it has a value; the first two also count as done once a later
   * step has one (the sex has a default and the breed and adult weight are optional). The current step is the
   * first one still to do; optional steps are flagged, never required.
   */
  function guideSteps(r) {
    const hasBreed = !!breedEntry();
    const steps = [
      { label: "Sex & breed", go: "#breed", has: hasBreed || state.mixedChosen },
      { label: "Adult weight", go: "#adultWeight", has: state.adultSource === "user" && state.adultKg > 0, optional: true },
      { label: "Age", go: "age", has: !!state.birthDate && r.todayAge !== null && r.todayAge >= 0 },
      { label: "Weigh-in", go: "weighin", has: r.status === "growing" || r.status === "adult" },
      { label: "Feeding", go: "#foodValue", has: state.food.value > 0, optional: true },
    ];
    steps.forEach((s, i) => {
      const passed = i < 2 && steps.slice(i + 1).some((t) => t.has);
      s.state = s.has || (passed && (i === 0 || hasBreed)) ? "done" : passed ? "skipped" : "todo";
    });
    return { steps, current: steps.findIndex((s) => s.state === "todo") };
  }
  function nextStepText(r, g) {
    const hasKg = state.weighIns.some((w) => w.kg > 0), age = r.todayAge;
    switch (g.current) {
      case 0: return "<b>Next:</b> choose the sex and the breed, or Mixed / other.";
      case 1: return `<b>Optional:</b> ${breedEntry() ? "adjust" : "enter"} the adult weight if you know the parents' size.`;
      case 2: return state.birthDate ? `<b>Next:</b> check ${ageWhat()}.` : `<b>Next:</b> enter ${ageWhat()}${hasKg ? " to place the weigh-in" : ""}.`;
      case 3: return hasKg && r.status === "empty" ? "<b>Next:</b> check the weigh-in date." : `<b>Next:</b> add a weigh-in${age !== null && age < AGE_MIN ? " from 8 weeks" : ""}.`;
      case 4: return "<b>Optional:</b> enter the food's energy from the label for food per day.";
      default: return "";
    }
  }
  function renderGuideRow(r) {
    const row = $("#guideRow"), g = guideSteps(r);
    if (g.current < 0) {
      row.innerHTML = `<div class="guide-done">${icon("check", "icon--sm")}<span>All set.<span class="guide-done__more"> Each new weigh-in updates the ${r.status === "adult" ? "energy estimate" : "projection"}.</span></span><button type="button" class="btn btn--text" data-download>${icon("download", "icon--sm")}Download table</button></div>`;
      return;
    }
    row.innerHTML = `<div class="steps">${g.steps.map((s, i) => {
      const cls = i === g.current ? "current" : s.state, name = s.label + (s.optional ? " (optional)" : "");
      return `${i ? '<span class="steps__sep"></span>' : ""}<button type="button" class="step is-${cls}" data-go="${s.go}" title="${name}" aria-label="Step ${i + 1}: ${name}${s.state === "done" ? ", done" : ""}"><span class="step__dot">${s.state === "done" ? iconSvg("check") : i + 1}</span><span class="step__label">${s.label}</span>${s.optional ? '<span class="step__opt">optional</span>' : ""}</button>`;
    }).join("")}</div>`;
  }
  /** Jump to a step's input (the age input in use; the first empty weigh-in for the weigh-in step). */
  function goTo(sel) {
    const el = sel === "weighin" ? ($$(".wi-kg").find((i) => !i.value) || $$(".wi-kg").pop())
      : sel === "age" ? $(state.ageMode === "months" ? "#ageMonths" : "#birthDate") : $(sel);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  }
  function renderSummary(r) {
    const tiles = $("#tiles"), card = $("#summaryCard");
    $("#chartChip").textContent = chartName(r);
    $("#chartTitle").textContent = state.name ? `${state.name}'s growth chart` : "Growth chart";
    $("#chartInfo").textContent = r.mode === "fitted" ? "No breed or weight: chart fitted to the weigh-ins." : "Pre-filled from breed. Change it if you know parents' size.";
    card.classList.toggle("is-empty", r.status === "empty");
    if (r.status === "empty") {
      const g = guide(r);
      tiles.innerHTML = `<div class="empty-state">
        <div class="ring ring--empty" aria-hidden="true"><svg viewBox="0 0 100 100"><circle class="ring__track" cx="50" cy="50" r="40"/><g transform="translate(35 35) scale(1.25)"><path class="ring__paw" d="${ICONS.pets}"/></g></svg></div>
        <div class="guide"><div class="title-medium">Getting started</div><div class="body-medium">${g.text}</div>${g.next ? `<div class="body-medium guide__next">${g.next}</div>` : ""}</div></div>`;
      return;
    }
    if (r.status === "adult" || r.status === "early") {
      const l = r.latest;
      tiles.innerHTML = `<div class="tile"><div class="tile__label">Latest weigh-in · ${fmtAge(l.ageWeeks)}</div><div class="tile__value">${fmtW(l.kg)}<small>${unitLabel()}</small></div><div class="tile__sub">${r.status === "adult" ? "Adult · growth charts cover 8 weeks to 2 years" : "Before 8 weeks · charts start at 8 weeks"}</div></div>`;
      return;
    }
    const last = r.last, a = r.adult;
    const grown = Math.max(0, Math.min(1, r.basis.kg / a.kg.q50));
    const C = 2 * Math.PI * 40;
    const ring = `<div class="ring" title="Share of the adult estimate reached${r.basis.projected ? " (projected today)" : ""}"><svg viewBox="0 0 100 100" role="img" aria-label="${Math.round(grown * 100)}% of adult weight">
        <circle class="ring__track" cx="50" cy="50" r="40"/>
        <circle class="ring__value" cx="50" cy="50" r="40" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - grown)).toFixed(2)}" transform="rotate(-90 50 50)"/>
        <text class="ring__num" x="50" y="52" text-anchor="middle">${Math.round(grown * 100)}%</text>
        <text class="ring__lab" x="50" y="67" text-anchor="middle">grown</text></svg></div>`;
    const todayLine = r.basis && r.basis.projected && r.todayAge <= AGE_MAX ? ` · today ≈ ${fmtW(r.basis.kg)} ${unitLabel()}` : "";
    tiles.innerHTML = `<div class="summary">${ring}
      <div class="tile"><div class="tile__label">Latest weigh-in · ${fmtAge(last.ageWeeks)}</div><div class="tile__value">${fmtW(last.kg)}<small>${unitLabel()}</small></div><div class="tile__sub">${ordinal(last.centile)} centile${todayLine}</div></div>
      <div class="tile"><div class="tile__label">Adult estimate · 2 years</div><div class="tile__value">${fmtW(a.kg.q50)}<small>${unitLabel()}</small></div><div class="tile__sub">90% range ${fmtW(a.kg.q5)}–${fmtW(a.kg.q95)} ${unitLabel()}</div></div></div>`;
  }

  // ---- charts: shared helpers ---------------------------------------------------------------
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; }
  function niceStep(range, target) { const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  const AGE_TICKS = [[8, "8 wk"], [13, "3 mo"], [26, "6 mo"], [39, "9 mo"], [52, "1 y"], [65, "15 mo"], [78, "18 mo"], [91, "21 mo"], [104, "2 y"]];
  const pathOf = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
  /**
   * Chart height in viewBox units. The box gets the chart's natural height (from its width) as a minimum, then
   * takes the height its grid row gives it at two-column widths; the drawing fills the box without distortion.
   */
  function fitHeight(wrap, W, H0, cw) {
    const natural = Math.round(H0 * cw / W);
    if (wrap.style.minHeight !== natural + "px") wrap.style.minHeight = natural + "px";
    const h = wrap.getBoundingClientRect().height || natural;
    return Math.max(1, Math.round(h * W / cw));
  }
  /** Age ticks whose labels would crowd the previous one (narrow charts) are dropped; the first and last stay. */
  function spaceTicks(ticks, x, minGap) {
    const kept = [];
    ticks.forEach((t, i) => {
      const last = i === ticks.length - 1;
      while (last && kept.length > 1 && x(t[0]) - x(kept[kept.length - 1][0]) < minGap) kept.pop();
      if (!kept.length || last || x(t[0]) - x(kept[kept.length - 1][0]) >= minGap) kept.push(t);
    });
    return kept;
  }
  /** Labels at the right end of the lines, nudged apart so none overlap; returns label y positions by index. */
  function spreadLabels(ys, gap, lo, hi) {
    const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
    if (order.length && order[order.length - 1].y > hi) {
      order[order.length - 1].y = hi;
      for (let k = order.length - 2; k >= 0; k--) order[k].y = Math.min(order[k].y, order[k + 1].y - gap);
    }
    const out = []; order.forEach((o) => { out[o.i] = Math.max(lo, o.y); }); return out;
  }
  function placeTip(tip, svg, ev) {
    const wrap = svg.parentElement.getBoundingClientRect();
    const left = ev.clientX - wrap.left + 14, top = ev.clientY - wrap.top - 10;
    tip.style.left = Math.max(0, Math.min(left, wrap.width - tip.offsetWidth - 4)) + "px";
    tip.style.top = Math.max(0, top - tip.offsetHeight / 2) + "px";
  }
  const hideReading = {}; // chart id -> hides its crosshair and tooltip (a tap elsewhere calls it: touch has no hover to end)
  /**
   * The frame both charts share: sizes the SVG to its box, draws the y grid with labels, the x ticks and the
   * y title, and returns the scales. hover(read) adds the crosshair and tooltip: read(v) gets the x value under the
   * pointer and returns {at, html} (the x value to mark and the tooltip) or null to hide them. A mouse reads on
   * hover; a finger reads on tap or a sideways drag, and the reading stays until a tap elsewhere or a scroll.
   */
  function drawFrame({ svg, tip, heights, margin, x0, x1, ymax, step, yText, ticks, yTitle }) {
    svg.innerHTML = ""; tip.hidden = true;
    const wrap = svg.parentElement, cw = wrap.getBoundingClientRect().width || 720;
    const W = Math.max(320, Math.min(760, Math.round(cw))), H = fitHeight(wrap, W, W < 520 ? heights[0] : heights[1], cw);
    const [ml, mr, mt, mb] = margin;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const x = (v) => ml + (v - x0) / (x1 - x0) * (W - ml - mr);
    const yu = (v) => mt + (1 - v / ymax) * (H - mt - mb);
    const grid = el("g", { class: "grid" }), axis = el("g", { class: "axis" });
    for (let v = 0; v <= ymax + 1e-9; v += step) {
      grid.appendChild(el("line", { x1: ml, x2: W - mr, y1: yu(v), y2: yu(v) }));
      axis.appendChild(el("text", { x: ml - 6, y: yu(v) + 4, "text-anchor": "end" }, yText(v)));
    }
    spaceTicks(ticks(W), x, 34).forEach(([v, lab]) => {
      grid.appendChild(el("line", { x1: x(v), x2: x(v), y1: mt, y2: H - mb }));
      axis.appendChild(el("text", { x: x(v), y: H - mb + 16, "text-anchor": "middle" }, lab));
    });
    if (yTitle) axis.appendChild(el("text", { x: ml - 6, y: mt - 10, "text-anchor": "end", class: "axis-title" }, yTitle));
    svg.appendChild(grid); svg.appendChild(axis);
    function hover(read) {
      const overlay = el("rect", { x: ml, y: mt, width: W - ml - mr, height: H - mt - mb, fill: "transparent" });
      const cross = el("line", { class: "crosshair", y1: mt, y2: H - mb, x1: -10, x2: -10 });
      svg.appendChild(cross); svg.appendChild(overlay);
      const hide = () => { tip.hidden = true; cross.setAttribute("x1", -10); cross.setAttribute("x2", -10); };
      const move = (ev) => {
        const rect = svg.getBoundingClientRect();
        const r = read(x0 + ((ev.clientX - rect.left) / rect.width * W - ml) / (W - ml - mr) * (x1 - x0));
        if (!r) return hide();
        cross.setAttribute("x1", x(r.at)); cross.setAttribute("x2", x(r.at));
        tip.innerHTML = r.html; tip.hidden = false; placeTip(tip, svg, ev);
      };
      overlay.addEventListener("pointerdown", move); overlay.addEventListener("pointermove", move);
      overlay.addEventListener("pointerleave", (ev) => { if (ev.pointerType === "mouse") hide(); });
      overlay.addEventListener("pointercancel", hide); // the browser took the touch to scroll
      hideReading[svg.id] = hide;
    }
    return { W, H, ml, mr, mt, mb, x, yu, hover };
  }
  /** A size group's adult-weight range in the display unit, e.g. "15–30 kg". */
  function sizeLabel(g) {
    const u = unitLabel(), f = (kg) => +toUnit(kg).toFixed(state.unit === "lb" ? 0 : 1);
    return !g.min_kg ? `under ${f(g.max_kg)} ${u}` : g.max_kg === null ? `${f(g.min_kg)}+ ${u}` : `${f(g.min_kg)}–${f(g.max_kg)} ${u}`;
  }

  // ---- growth chart -----------------------------------------------------------------------
  function renderGrowthChart(r) {
    // No breed, adult weight or charted weigh-in yet: show the median of each size group instead of an empty card.
    const overview = r.mode === "none";
    const lines = overview
      ? GROUPS.map((g) => ({ kg: CH.charts[`${g.id}_${state.sex}`].M, cls: "size-median", label: sizeLabel(g), labelCls: "size-label" }))
      : [0.02, 0.09, 0.25, 0.5, 0.75, 0.91, 0.98].map((c) => {
        const z = G.normInv(c), med = c === 0.5, ch = r.chart;
        return { kg: GRID.map((a, j) => G.weightFromZ({ L: ch.L[j], M: ch.M[j], S: ch.S[j] }, z)), cls: "centile" + (med ? " centile--median" : ""),
          label: (c * 100) + (med ? "th" : ""), labelCls: "centile-label" + (med ? " centile-label--median" : "") };
      });
    const curves = lines.map((l) => l.kg);
    let ymax = toUnit(Math.max(...curves.map((k) => k[GRID.length - 1]), ...r.usable.map((w) => w.kg), r.usable.length ? r.adult.kg.q95 : 0) * 1.05);
    const step = niceStep(ymax, 6);
    ymax = Math.ceil(ymax / step) * step;
    const svg = $("#growthChart");
    const f = drawFrame({ svg, tip: $("#chartTooltip"), heights: [300, 400], margin: [44, overview ? 74 : 40, 24, 36], x0: AGE_MIN, x1: AGE_MAX, ymax, step,
      yText: (v) => (+v.toFixed(2)).toString(), ticks: (W) => W < 520 ? AGE_TICKS.filter(([w]) => [8, 26, 52, 78, 104].includes(w)) : AGE_TICKS, yTitle: unitLabel() });
    const { W, H, mr, mt, mb, x } = f, y = (kg) => f.yu(toUnit(kg));
    const cg = el("g");
    const labelY = spreadLabels(lines.map((l) => y(l.kg[GRID.length - 1]) + 3), 11, mt, H - mb + 3);
    lines.forEach((l, i) => {
      cg.appendChild(el("path", { d: pathOf(GRID.map((a, j) => [x(a), y(l.kg[j])])), class: l.cls }));
      cg.appendChild(el("text", { x: W - mr + 4, y: labelY[i], class: l.labelCls }, l.label));
    });
    svg.appendChild(cg);
    if (r.usable.length) {
      const pts = r.proj.points.slice(Math.max(0, Math.floor(r.last.ageWeeks) - AGE_MIN));
      const band = (lo, hi, cls) => {
        const up = pts.map((p) => [x(p.ageWeeks), y(p.kg[hi])]), dn = pts.slice().reverse().map((p) => [x(p.ageWeeks), y(p.kg[lo])]);
        svg.appendChild(el("path", { d: pathOf(up.concat(dn)) + "Z", class: cls }));
      };
      band("q5", "q95", "band-90"); band("q25", "q75", "band-50");
      svg.appendChild(el("path", { d: pathOf(pts.map((p) => [x(p.ageWeeks), y(p.kg.q50)])), class: "proj" }));
      if (r.usable.length > 1) svg.appendChild(el("path", { d: pathOf(r.proj.observations.map((o) => [x(o.ageWeeks), y(o.kg)])), class: "obs-line" }));
      r.proj.observations.forEach((o, i) => svg.appendChild(el("circle", { cx: x(o.ageWeeks), cy: y(o.kg), r: i === r.proj.observations.length - 1 ? 6 : 4.5, class: "obs" })));
      svg.appendChild(el("circle", { cx: x(AGE_MAX), cy: y(r.adult.kg.q50), r: 4, class: "adult-marker" }));
      svg.appendChild(el("text", { x: x(AGE_MAX) - 8, y: y(r.adult.kg.q50) - 10, "text-anchor": "end", class: "adult-label" }, `≈ ${fmtW(r.adult.kg.q50)} ${unitLabel()}`));
    }
    f.hover((v) => {
      const w = Math.round(v);
      if (w < AGE_MIN || w > AGE_MAX) return null;
      const j = w - AGE_MIN;
      if (overview) return { at: w, html: `<b>${fmtAge(w)}</b> · median weight` + lines.slice().reverse().map((l) => `<br>${l.label} adults: ${fmtW(l.kg[j])} ${unitLabel()}`).join("") };
      let html = `<b>${fmtAge(w)}</b> · median ${fmtW(curves[3][j])} ${unitLabel()}<br>2nd–98th centile: ${fmtW(curves[0][j])}–${fmtW(curves[6][j])}`;
      if (r.usable.length && w >= r.last.ageWeeks) { const p = r.proj.points[j]; html += `<br><b>Projection</b> ${fmtW(p.kg.q50)} (90%: ${fmtW(p.kg.q5)}–${fmtW(p.kg.q95)})`; }
      const near = r.proj.observations.find((o) => Math.abs(o.ageWeeks - w) < 0.75);
      if (near) html += `<br><b>Weigh-in</b> ${fmtW(near.kg)} ${unitLabel()}, ${ordinal(near.centile)} centile`;
      return { at: w, html };
    });
    $("#chartLegend").innerHTML = overview
      ? `<span><i class="median"></i>median weight for each adult-size group</span>`
      : `<span><i class="cent"></i>centiles 2–98</span>` + (r.usable.length ? `<span><i class="dot"></i>weigh-ins</span><span><i class="dash"></i>projected median</span><span><i class="band"></i>50%, 90% ranges</span>` : "");
  }

  // ---- energy -----------------------------------------------------------------------------
  function foodText(kcal) {
    if (!(state.food.value > 0)) return null;
    return G.foodPerDay(kcal, state.food.value, state.food.per, state.treatShare);
  }
  function renderEnergy(r) {
    const box = $("#energySummary"), cmp = $("#energyCompare"), eu = state.eunit;
    document.body.classList.toggle("is-adult", r.status === "adult");
    const perLabel = FOOD_PER.find(([v]) => v === state.food.per)[1];
    const e = r.energy, f = e ? foodText(e.kcal) : null;
    const need = r.status === "early" ? "Needs a weigh-in from 8 weeks." : state.birthDate ? "Needs a weigh-in." : `Needs ${state.ageMode === "months" ? "the age" : "the date of birth"} and a weigh-in.`;
    // food per day, in the feeding card under the inputs it depends on; the same tile in every state
    $("#foodTile").innerHTML = f
      ? `<div class="stat"><div class="stat__label">Food per day</div><div class="stat__value">${fmtAmount(f)}</div><div class="stat__sub">at ${(+state.food.value).toLocaleString()} ${perLabel}${state.treatShare > 0 ? ` · treats ${fmtE(f.treatsKcal)} ${eu} (${Math.round(state.treatShare * 100)}%)` : ""}</div></div>`
      : state.food.value > 0
        ? `<div class="stat"><div class="stat__label">Food per day</div><div class="stat__value stat__value--empty">—</div><div class="stat__sub">at ${(+state.food.value).toLocaleString()} ${perLabel} · ${need.charAt(0).toLowerCase() + need.slice(1, -1)}</div></div>`
        : `<div class="stat stat--muted"><div class="stat__label">Food per day</div><div class="stat__sub">Enter the food's energy above.</div></div>`;
    if (!e) {
      // the same box and rows as with data, so the card keeps its size
      box.innerHTML = `<div class="stat"><div class="stat__label">Estimated energy per day</div><div class="stat__value stat__value--empty">—</div><div class="stat__sub">${need}</div></div>`;
      cmp.innerHTML = ["NRC 2006", "AAHA 2021"].map((n) => `<div class="compare__row"><span class="compare__name">${n}</span><span class="compare__val compare__val--empty">—</span></div>`).join("");
    } else {
      const b = r.basis;
      const weightTxt = `${fmtW(b.kg)} ${unitLabel()}${b.projected ? " today, projected" : ""}`;
      const basis = e.stage === "growth"
        ? `FEDIAF 2025 · ${weightTxt} · ${Math.min(100, Math.round(100 * b.kg / (r.adultKgEst || b.kg)))}% grown`
        : `FEDIAF 2025 · ${e.basisLabel} · ${weightTxt}`;
      box.innerHTML = `<div class="stat"><div class="stat__label">Estimated energy per day</div><div class="stat__value">${fmtE(e.kcal)}<small>${eu}</small></div><div class="stat__sub">${basis}${e.extrapolated ? " · growth equation extended past 1 year" : ""}</div></div>`;
      cmp.innerHTML = e.comparisons.map((c) => {
        const val = c.kcal !== undefined
          ? `${fmtE(c.kcal)} ${eu}<span class="compare__diff">${c.kcal >= e.kcal ? "+" : "−"}${Math.abs(Math.round(100 * (c.kcal / e.kcal - 1)))}%</span>`
          : `${fmtE(c.low)}–${fmtE(c.high)} ${eu}`;
        return `<div class="compare__row"><span class="compare__name">${c.name}</span><span class="compare__val">${val}</span></div>`;
      }).join("");
    }
    renderEnergyChart(r);
  }

  /**
   * What the energy chart shows. Growing dog: along its projected median to 2 years. Adult: by age at the current
   * weight. No weigh-in yet: along the median of the chart in use, or one line per size group when there is none.
   */
  function energySpec(r) {
    const sexWord = state.sex === "M" ? "male" : "female", WPY = G.WEEKS_PER_YEAR;
    const est = (kg, adultKg, wk) => G.energyEstimate({ kg, adultKg, ageWeeks: wk, neutered: state.neutered, adultFactor: state.activity });
    const band = (es) => ({ lo: es.map((v) => v.low), hi: es.map((v) => v.high), ys: es.map((v) => v.kcal) });
    const weekTicks = (from) => AGE_TICKS.filter(([w]) => w === from || w > from + 3);
    if (r.status === "growing") {
      const start = Math.max(AGE_MIN, Math.floor(Math.min(r.basis.ageWeeks, AGE_MAX - 2)));
      const pts = r.proj.points.filter((p) => p.ageWeeks >= start);
      const b = band(pts.map((p) => est(p.kg.q50, r.adultKgEst, p.ageWeeks)));
      return { title: "By age, at the projected weight", xs: pts.map((p) => p.ageWeeks), kg: pts.map((p) => p.kg.q50), lines: [{ ys: b.ys }], lo: b.lo, hi: b.hi,
        now: r.basis.ageWeeks, nowKcal: r.energy.kcal, ticks: weekTicks(start), compact: [26, 52, 78, 104] };
    }
    if (r.status === "adult") {
      const kg = r.basis.kg, end = Math.max(12, Math.ceil(r.basis.ageWeeks / WPY) + 1) * WPY;
      const xs = []; for (let w = WPY; w <= end + 1e-9; w += WPY / 12) xs.push(w);
      const b = band(xs.map((w) => est(kg, kg, w)));
      const ticks = []; for (let yr = 1; yr * WPY <= end + 1e-9; yr++) ticks.push([yr * WPY, `${yr} y`]);
      return { title: "By age, at the current weight", xs, kg: xs.map(() => kg), lines: [{ ys: b.ys }], lo: b.lo, hi: b.hi, years: true,
        now: r.basis.ageWeeks, nowKcal: r.energy.kcal, ticks, compact: ticks.filter((t, i) => i % 2 === 1).map((t) => t[0]) };
    }
    if (r.mode === "breed" || r.mode === "user") {
      const ch = r.chart, adultKg = ch.M[GRID.length - 1];
      const b = band(GRID.map((a, j) => est(ch.M[j], adultKg, a)));
      const now = r.todayAge !== null && r.todayAge >= AGE_MIN && r.todayAge <= AGE_MAX ? r.todayAge : null;
      const who = r.mode === "breed" ? state.breed : `dog growing to ${+fmtW(state.adultKg, 1)} ${unitLabel()}`;
      return { title: `By age, for a typical ${sexWord} ${who}`, xs: GRID, kg: ch.M, lines: [{ ys: b.ys }], lo: b.lo, hi: b.hi, typical: true,
        now, ticks: weekTicks(AGE_MIN), compact: [8, 26, 52, 78, 104] };
    }
    const lines = GROUPS.map((g) => {
      const ch = CH.charts[`${g.id}_${state.sex}`], adultKg = ch.M[GRID.length - 1];
      return { ys: GRID.map((a, j) => est(ch.M[j], adultKg, a).kcal), label: sizeLabel(g) };
    });
    return { title: "By age, for a typical dog of each adult size", xs: GRID, lines, groups: true, now: null, ticks: weekTicks(AGE_MIN), compact: [8, 26, 52, 78, 104] };
  }
  function renderEnergyChart(r) {
    const s = energySpec(r), eu = state.eunit;
    $("#energyCaption").textContent = s.title;
    $("#energyLegend").innerHTML = s.groups
      ? `<span><i></i>FEDIAF 2025 at the median weight per size group</span>`
      : `<span><i></i>FEDIAF 2025</span><span><i class="band"></i>range of the three guidelines</span>`;
    const x0 = s.xs[0], x1 = s.xs[s.xs.length - 1];
    const ymaxRaw = toE(Math.max(...(s.hi || []), ...s.lines.flatMap((l) => l.ys))) * 1.08;
    const step = niceStep(ymaxRaw, 4), ymax = Math.ceil(ymaxRaw / step) * step;
    const svg = $("#energyChart");
    const f = drawFrame({ svg, tip: $("#energyTooltip"), heights: [190, 220], margin: [52, s.groups ? 74 : 16, 12, 30], x0, x1, ymax, step,
      yText: (v) => v.toLocaleString(), ticks: (W) => s.ticks.filter(([w]) => W >= 520 || s.compact.some((c) => Math.abs(c - w) < 1e-6)) });
    const { W, H, mr, mt, mb, x } = f, y = (kcal) => f.yu(toE(kcal));
    if (s.hi) {
      const up = s.xs.map((w, i) => [x(w), y(s.hi[i])]), dn = s.xs.map((w, i) => [x(w), y(s.lo[i])]).reverse();
      svg.appendChild(el("path", { d: pathOf(up.concat(dn)) + "Z", class: "energy-band" }));
    }
    const labelY = spreadLabels(s.lines.map((l) => y(l.ys[l.ys.length - 1]) + 3), 11, mt, H - mb + 3);
    s.lines.forEach((l, li) => {
      svg.appendChild(el("path", { d: pathOf(s.xs.map((w, i) => [x(w), y(l.ys[i])])), class: s.groups ? "energy-size" : "energy-line" }));
      if (l.label) svg.appendChild(el("text", { x: W - mr + 4, y: labelY[li], class: "size-label" }, l.label));
    });
    const nearest = (w) => { let k = 0; s.xs.forEach((v, i) => { if (Math.abs(v - w) < Math.abs(s.xs[k] - w)) k = i; }); return k; };
    if (s.now !== null) { const k = nearest(s.now); svg.appendChild(el("circle", { cx: x(s.xs[k]), cy: y(s.nowKcal !== undefined ? s.nowKcal : s.lines[0].ys[k]), r: 5, class: "energy-now" })); }
    f.hover((v) => {
      if (v < x0 - 0.5 || v > x1 + 0.5) return null;
      const k = nearest(v), wk = s.xs[k];
      const age = s.years ? `${(wk / G.WEEKS_PER_YEAR).toFixed(1)} y` : fmtAge(wk);
      if (s.groups) return { at: wk, html: `<b>${age}</b> · typical dog` + s.lines.slice().reverse().map((l) => `<br>${l.label} adults: ${fmtE(l.ys[k])} ${eu}/day`).join("") };
      const kcal = s.lines[0].ys[k], ff = foodText(kcal);
      return { at: wk, html: `<b>${age}</b> · ${fmtW(s.kg[k])} ${unitLabel()}${s.typical ? " typical" : ""}<br>FEDIAF ${fmtE(kcal)} ${eu}/day${ff ? ` · ${fmtAmount(ff)}` : ""}<br>Range ${fmtE(s.lo[k])}–${fmtE(s.hi[k])} ${eu}` };
    });
  }

  // ---- download: key facts, weigh-ins and the monthly projection with energy and food, as one CSV table ----
  const csvCell = (v) => {
    let t = v === null || v === undefined ? "" : String(v);
    if (/^[=+@]/.test(t)) t = "'" + t; // keep spreadsheets from reading typed text as a formula
    return /[",\r\n]/.test(t) || /^\s|\s$/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  function buildCsv(r) {
    const u = unitLabel(), eu = state.eunit, food = state.food.value > 0;
    const num = (kg) => fmtW(kg);
    const en = (kcal) => { const step = eu === "kJ" ? 50 : 10; return String(Math.round(toE(kcal) / step) * step); };
    const fd = (kcal) => { const f = foodText(kcal), v = foodAmount(f); return f.unit === "cup" ? v.toFixed(1) : String(v); };
    const foodUnit = state.food.per === "kcal/cup" ? "cups" : "g";
    const dateAt = (wk) => { const d = new Date(state.birthDate + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Math.round(wk * 7)); return d.toISOString().slice(0, 10); };
    const out = [], row = (...c) => out.push(c.map(csvCell).join(","));
    row("Doge Growth", `table created ${today}`);
    if (state.name) row("Name", state.name);
    row("Sex", state.sex === "M" ? "male" : "female");
    row("Breed", state.breed || "Mixed / other");
    if (state.ageMode === "months") row("Date of birth", state.birthDate, "from the age entered in months"); else row("Date of birth", state.birthDate);
    row("Growth chart", chartName(r));
    if (r.status === "growing") { const a = r.adult.kg; row(`Adult estimate at 2 years (${u})`, num(a.q50)); row(`Adult estimate, 90% range (${u})`, `${num(a.q5)} to ${num(a.q95)}`); }
    if (r.energy) {
      row(`Energy today, FEDIAF 2025 (${eu}/day)`, en(r.energy.kcal));
      r.energy.comparisons.forEach((c) => row(`Energy today, ${c.name} (${eu}/day)`, c.kcal !== undefined ? en(c.kcal) : `${en(c.low)} to ${en(c.high)}`));
    }
    if (food) {
      row("Food energy", `${state.food.value} ${FOOD_PER.find(([v]) => v === state.food.per)[1]}`);
      row("Treats, share of daily energy", `${Math.round(state.treatShare * 100)}%`);
      if (r.energy) row(`Food today (${foodUnit}/day)`, fd(r.energy.kcal));
    }
    if (r.status === "adult") { row("Activity", ACTIVITY.find(([v]) => v === state.activity)[1]); row("Neutered", state.neutered ? "yes" : "no"); }
    row("Sources", "Growth standards refitted from Salt et al. 2017 (CC BY 4.0); energy: FEDIAF 2025, NRC 2006, AAHA 2021; github.com/pmarcowski/doge-growth");
    out.push("");
    const head = ["Date", "Age (weeks)", "Row", `Weight (${u})`, "Centile", `90% range low (${u})`, `90% range high (${u})`, `Energy, FEDIAF 2025 (${eu}/day)`];
    if (food) head.push(`Food (${foodUnit}/day)`);
    row(...head);
    const line = (cells, kcal) => row(...cells, kcal === undefined ? "" : en(kcal), ...(food ? [kcal === undefined ? "" : fd(kcal)] : []));
    r.obsIn.forEach((w) => {
      const o = r.proj.observations.find((x) => Math.abs(x.ageWeeks - w.ageWeeks) < 1e-6 && Math.abs(x.kg - w.kg) < 1e-9);
      line([w.date, w.ageWeeks.toFixed(1), "weigh-in", num(w.kg), o ? Math.round(o.centile) : "", "", ""]);
    });
    if (r.status === "growing") {
      const est = (p) => G.energyEstimate({ kg: p.kg.q50, adultKg: r.adultKgEst, ageWeeks: p.ageWeeks, neutered: state.neutered, adultFactor: state.activity }).kcal;
      const from = Math.round(Math.max(r.last.ageWeeks, r.todayAge !== null ? r.todayAge : 0));
      const weeks = r.basis.projected && from < AGE_MAX ? [from] : [];
      const WPM = G.WEEKS_PER_MONTH;
      for (let m = Math.floor(from / WPM) + 1; Math.round(m * WPM) < AGE_MAX; m++) { const wk = Math.round(m * WPM); if (wk > from) weeks.push(wk); }
      if (weeks[weeks.length - 1] !== AGE_MAX) weeks.push(AGE_MAX);
      weeks.forEach((wk, i) => {
        const p = r.proj.points[wk - AGE_MIN];
        const kind = i === 0 && r.basis.projected && wk === from ? "today, projected" : wk === AGE_MAX ? "projection, 2 years" : "projection";
        line([dateAt(wk), wk.toFixed(1), kind, num(p.kg.q50), "", num(p.kg.q5), num(p.kg.q95)], est(p));
      });
    } else if (r.status === "adult") {
      line([today, r.basis.ageWeeks.toFixed(1), "today", num(r.basis.kg), "", "", ""], r.energy.kcal);
    }
    return out.join("\r\n") + "\r\n";
  }
  async function downloadTable() {
    const r = compute();
    if (r.status !== "growing" && r.status !== "adult") return;
    const slug = (state.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const filename = `doge-growth-${slug ? slug + "-" : ""}${today}.csv`;
    const data = "\ufeff" + buildCsv(r); // byte-order mark so spreadsheet apps read UTF-8
    // In the Claude artifact viewer a framed page cannot download directly: it offers the file through the
    // viewer's downloads capability. Anywhere else (a static host, a file on disk) this is an ordinary download.
    const host = window.claude && typeof window.claude.use === "function" ? await window.claude.use("downloads").catch(() => null) : null;
    if (host) {
      try { await host.save({ filename, data }); } catch (e) { if (!e || e.code !== "declined") snack("The download is not available here."); }
      return;
    }
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---- dropdowns: one menu component for the breed combobox and the two selects ------------
  const menus = [];
  function attachMenu({ root, trigger, menu, getItems, onPick, filterable, emptyText }) {
    let open = false, active = -1, items = [];
    const optId = (i) => `${menu.id}-o${i}`;
    const render = () => {
      items = getItems(filterable ? trigger.value.trim() : "");
      if (active >= items.length) active = items.length - 1;
      menu.innerHTML = items.length
        ? items.map((it, i) => `<div class="menu__item${i === active ? " is-active" : ""}${it.selected ? " is-selected" : ""}" role="option" id="${optId(i)}" data-i="${i}" aria-selected="${!!it.selected}"><span class="menu__label">${it.html || esc(it.label)}</span>${it.sub ? `<span class="menu__sub">${esc(it.sub)}</span>` : ""}</div>`).join("")
        : `<div class="menu__hint">${emptyText || "No match"}</div>`;
      trigger.setAttribute("aria-activedescendant", active >= 0 ? optId(active) : "");
      const a = menu.querySelector(".is-active") || menu.querySelector(".is-selected");
      if (a) a.scrollIntoView({ block: "nearest" });
    };
    const show = () => {
      if (open) return;
      menus.forEach((m) => m !== api && m.hide());
      open = true; root.classList.add("is-open"); menu.hidden = false; trigger.setAttribute("aria-expanded", "true");
      items = getItems(filterable ? trigger.value.trim() : ""); active = filterable ? -1 : items.findIndex((it) => it.selected);
      render();
    };
    const hide = () => { if (!open) return; open = false; root.classList.remove("is-open"); menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); };
    const pick = (i) => { const it = items[i]; if (!it) return; hide(); onPick(it); };
    menu.addEventListener("mousedown", (ev) => { ev.preventDefault(); const t = ev.target.closest(".menu__item"); if (t) pick(+t.dataset.i); });
    trigger.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!open) { show(); return; }
        if (!items.length) return;
        active = ev.key === "ArrowDown" ? (active + 1) % items.length : (active <= 0 ? items.length - 1 : active - 1);
        render();
      } else if (ev.key === "Enter") {
        if (open && active >= 0) { ev.preventDefault(); pick(active); } else if (!filterable) { ev.preventDefault(); show(); }
      } else if (ev.key === "Escape") { if (open) { ev.preventDefault(); hide(); } }
      else if (ev.key === "Tab") hide();
      else if (!filterable && ev.key === " ") { ev.preventDefault(); open ? hide() : show(); }
    });
    if (filterable) {
      trigger.addEventListener("input", () => { if (!open) show(); active = trigger.value.trim() ? 0 : -1; render(); });
      trigger.addEventListener("focus", () => { trigger.select(); show(); });
      trigger.addEventListener("click", () => show());
    } else {
      trigger.addEventListener("click", () => (open ? hide() : show()));
    }
    document.addEventListener("mousedown", (ev) => { if (open && !root.contains(ev.target)) hide(); });
    const api = { hide, isOpen: () => open };
    menus.push(api);
    return api;
  }

  function breedItems(q) {
    const ql = q.toLowerCase();
    const names = Object.keys(BR.breeds);
    let list;
    if (!ql) list = names;
    else {
      const starts = [], words = [], incl = [];
      names.forEach((n) => {
        const nl = n.toLowerCase();
        if (nl.startsWith(ql)) starts.push(n);
        else if (nl.split(/[\s(-]+/).some((w) => w.startsWith(ql))) words.push(n);
        else if (nl.includes(ql)) incl.push(n);
      });
      list = starts.concat(words, incl);
    }
    const mark = (n) => { if (!ql) return esc(n); const i = n.toLowerCase().indexOf(ql); return i < 0 ? esc(n) : esc(n.slice(0, i)) + "<mark>" + esc(n.slice(i, i + ql.length)) + "</mark>" + esc(n.slice(i + ql.length)); };
    const items = list.map((n) => ({ value: n, label: n, html: mark(n), selected: n === state.breed,
      sub: `${fmtW(G.adultMedian(G.chartForWeight(CH.charts, state.sex, breedChartWeight(BR.breeds[n]))), 1)} ${unitLabel()}` }));
    if (!ql || "mixed / other".includes(ql)) items.unshift({ value: "", label: "Mixed / other", selected: !state.breed });
    return items;
  }
  function setBreed(name) {
    if (name && BR.breeds[name]) { state.breed = name; state.adultSource = "breed"; state.adultKg = null; state.mixedChosen = false; }
    else { state.breed = ""; state.mixedChosen = true; if (state.adultSource === "breed") { state.adultSource = "none"; state.adultKg = null; } }
    update();
  }

  // ---- update cycle -----------------------------------------------------------------------
  let raf = null, lastR = null;
  function update(rerenderForm) {
    persist();
    if (rerenderForm !== false) renderForm();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = compute();
      lastR = r;
      renderSummary(r); renderGuideRow(r); renderFlags(r, rerenderForm === false); renderGrowthChart(r); renderEnergy(r); refreshWeighInNotes(r); weighInScrollCue();
      $("#downloadBtn").hidden = !(r.status === "growing" || r.status === "adult");
      if (rerenderForm === false && document.activeElement !== $("#adultWeight")) { const e = expectedAdultKg(); $("#adultWeight").value = e ? (+fmtW(e, 1)) : ""; }
    });
  }

  // ---- events -----------------------------------------------------------------------------
  function init() {
    $$("[data-icon]").forEach((e) => { e.innerHTML = iconSvg(e.dataset.icon); });
    $("#dogName").addEventListener("input", (e) => { state.name = e.target.value.trim(); update(false); });
    $("#resetAll").addEventListener("click", () => {
      const keep = { unit: state.unit, eunit: state.eunit, ageMode: state.ageMode };
      state = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), keep);
      renderWeighIns(); update(); snack("Cleared.");
    });
    $$("[data-sex]").forEach((b) => b.addEventListener("click", () => { state.sex = b.dataset.sex; update(); }));
    $$("[data-unit]").forEach((b) => b.addEventListener("click", () => { state.unit = b.dataset.unit; renderWeighIns(); update(); }));
    $$("[data-eunit]").forEach((b) => b.addEventListener("click", () => { state.eunit = b.dataset.eunit; update(); }));

    const breedInput = $("#breed");
    attachMenu({
      root: $("#breedDropdown"), trigger: breedInput, menu: $("#breedMenu"), filterable: true, getItems: breedItems,
      emptyText: "Not in the list. Enter the expected adult weight instead.",
      onPick: (it) => { breedInput.value = it.value; breedInput.blur(); setBreed(it.value); },
    });
    breedInput.addEventListener("blur", () => {
      const v = breedInput.value.trim();
      const match = Object.keys(BR.breeds).find((n) => n.toLowerCase() === v.toLowerCase());
      if (match) { if (match !== state.breed) setBreed(match); else breedInput.value = match; }
      else if (!v || v.toLowerCase() === "mixed / other") { if (state.breed) setBreed(""); breedInput.value = ""; }
      else { breedInput.value = state.breed; snack(`"${v}" is not in the breed list. Enter the expected adult weight instead.`); }
    });
    attachMenu({
      root: $("#foodPerDropdown"), trigger: $("#foodPer"), menu: $("#foodPerMenu"),
      getItems: () => FOOD_PER.map(([v, l]) => ({ value: v, label: l, selected: v === state.food.per })),
      onPick: (it) => { state.food.per = it.value; update(); },
    });
    attachMenu({
      root: $("#activityDropdown"), trigger: $("#activity"), menu: $("#activityMenu"),
      getItems: () => ACTIVITY.map(([v, l]) => ({ value: v, label: l, selected: v === state.activity })),
      onPick: (it) => { state.activity = it.value; update(); },
    });

    $("#adultWeight").addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (v > 0) { state.adultKg = fromUnit(v); state.adultSource = "user"; }
      else { state.adultKg = null; state.adultSource = breedEntry() ? "breed" : "none"; }
      update(false);
    });
    $("#birthDate").addEventListener("change", (e) => { state.birthDate = e.target.value; update(); });
    $("#ageMonths").addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      state.birthDate = v >= 0 && v <= 240 ? birthDateForMonths(v) : "";
      update(false);
    });
    $$("[data-agemode]").forEach((b) => b.addEventListener("click", () => { state.ageMode = b.dataset.agemode; update(); }));
    $("#addWeighIn").addEventListener("click", () => { state.weighIns.push({ date: today, kg: null }); renderWeighIns(); update(); $$(".wi-kg").pop().focus(); });
    $("#foodValue").addEventListener("input", (e) => { const v = parseFloat(e.target.value); state.food.value = v > 0 ? v : null; update(false); renderForm(); });
    $("#treatShare").addEventListener("input", (e) => { state.treatShare = (+e.target.value) / 100; $("#treatShareValue").textContent = e.target.value + "%"; update(false); });
    $("#neutered").addEventListener("change", (e) => { state.neutered = e.target.checked; update(false); });

    $("#guideRow").addEventListener("click", (e) => {
      const go = e.target.closest("[data-go]");
      if (go) goTo(go.dataset.go); else if (e.target.closest("[data-download]")) downloadTable();
    });
    $("#downloadBtn").addEventListener("click", downloadTable);

    const dlg = $("#helpDialog");
    $("#helpBtn").addEventListener("click", () => { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); });
    $("#helpClose").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { const rc = dlg.getBoundingClientRect(); if (e.clientX < rc.left || e.clientX > rc.right || e.clientY < rc.top || e.clientY > rc.bottom) dlg.close(); });
    // Tab wraps within the dialog (first and last control), as the ARIA dialog pattern expects
    dlg.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const f = $$("#helpDialog a[href], #helpDialog button:not([disabled])");
      const first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (e.shiftKey && (a === first || a === dlg)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    });

    // the theme is set before first paint by the script in the page head (saved choice, else the system setting)
    const root = document.documentElement;
    let theme = root.dataset.theme;
    if (theme !== "dark" && theme !== "light") theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const applyTheme = (t) => {
      root.dataset.theme = t;
      const b = $("#themeToggle");
      b.setAttribute("aria-pressed", String(t === "dark"));
      b.querySelector(".icon").innerHTML = iconSvg(t === "dark" ? "light_mode" : "dark_mode");
    };
    applyTheme(theme);
    $("#themeToggle").addEventListener("click", () => { theme = theme === "dark" ? "light" : "dark"; try { localStorage.setItem("doge-growth-theme", theme); } catch { /* storage unavailable */ } applyTheme(theme); update(false); });

    renderWeighIns();
    const list = $("#weighIns");
    list.scrollTop = list.scrollHeight; // a long saved list opens at its latest weigh-ins
    list.addEventListener("scroll", weighInScrollCue, { passive: true });
    let resizeTimer = null;
    window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => update(false), 150); });
    document.addEventListener("pointerdown", (ev) => {
      for (const id in hideReading) if (!document.getElementById(id).parentElement.contains(ev.target)) hideReading[id]();
    });
    // redraw a chart whenever its box changes size (row height settling, fonts loading, flags, window resize)
    if ("ResizeObserver" in window) {
      let pending = null;
      const ro = new ResizeObserver(() => {
        if (pending || !lastR) return;
        pending = requestAnimationFrame(() => { pending = null; renderGrowthChart(lastR); renderEnergyChart(lastR); weighInScrollCue(); });
      });
      [$("#growthChartWrap"), $("#energyChartWrap"), list].forEach((el) => ro.observe(el));
    }
    update();
  }
  let snackTimer = null;
  function snack(msg) { const s = $("#snackbar"); s.textContent = msg; s.hidden = false; clearTimeout(snackTimer); snackTimer = setTimeout(() => { s.hidden = true; }, 5000); }

  document.addEventListener("DOMContentLoaded", init);
})();
