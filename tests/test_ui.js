// Page checks in Chromium (Playwright): the aligned two-column grid on desktop, phone layouts with touch, accessibility
// (axe-core) in both themes, the CSV table and saved inputs. Offline, with the clock fixed, so results do not depend
// on the network or the date. Run with: npm run test:ui
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, devices } = require("playwright");

const APP = pathToFileURL(path.join(__dirname, "..", "app", "index.html")).href;
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TODAY = "2026-10-13";
const LAB = [[9, 7.4], [13, 11.6], [18, 16.9], [22, 20.5], [26, 23.9], [30, 26.8]]; // a Labrador's weigh-ins: weeks, kg
const STATES = {
  empty: {},
  breed: { name: "Charlie", breed: "Labrador", dobWeeks: 20 },
  puppy: { name: "Charlie", breed: "Labrador", dobWeeks: 32, weighIns: LAB, food: 3700 },
  fitted: { dobWeeks: 30, weighIns: [[10, 5.0], [20, 9.5]] }, // no breed: chart fitted to the weigh-ins, with a crossing note
  adult: { breed: "Beagle", dobWeeks: 235, weighIns: [[234, 12.5]], food: 3600 },
};

const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const phone = (name) => { const d = { ...devices[name] }; delete d.defaultBrowserType; return d; }; // Chromium with the phone's screen and touch

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

/** A fresh page (empty storage) with the clock fixed at noon UTC on TODAY; requests leave nothing on the machine. */
async function open(options = {}) {
  const context = await browser.newContext({ timezoneId: "UTC", acceptDownloads: true, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route(/^https?:/, (route) => route.abort()); // web fonts: the page falls back to system fonts
  await page.clock.setFixedTime(new Date(TODAY + "T12:00:00Z"));
  await page.goto(APP);
  return { context, page, errors };
}

/** Fill the form as a person would; dates are weeks before TODAY (birth) and weeks of age (weigh-ins). */
async function fill(page, { name, sex, breed, adultKg, dobWeeks, weighIns = [], food } = {}) {
  if (name) await page.fill("#dogName", name);
  if (sex === "F") await page.click("[data-sex=F]");
  if (breed) { await page.click("#breed"); await page.keyboard.type(breed); await page.keyboard.press("Enter"); }
  if (adultKg) await page.fill("#adultWeight", String(adultKg));
  const dob = dobWeeks === undefined ? null : addDays(TODAY, -7 * dobWeeks);
  if (dob) { await page.fill("#birthDate", dob); await page.dispatchEvent("#birthDate", "change"); }
  for (const [i, [wk, kg]] of weighIns.entries()) {
    if (i) await page.click("#addWeighIn");
    const row = page.locator(".weighin").nth(i);
    await row.locator(".wi-date").fill(addDays(dob, 7 * wk)); await row.locator(".wi-date").dispatchEvent("change");
    await row.locator(".wi-kg").fill(String(kg));
  }
  if (food) await page.fill("#foodValue", String(food));
  await page.mouse.click(2, 2); // leave the last field
  await page.waitForTimeout(900); // growth notes wait for a pause in typing
}

const box = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY), left: b.left, right: b.right, width: b.width }; }, sel);
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
/** One CSV line into cells (quoted cells may hold commas and doubled quotes). */
function cells(line) {
  const out = []; let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
    else if (ch === '"') quoted = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function axeViolations(page) {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    // preload off: axe would fetch the stylesheet again, which file:// pages may not do (it is used by one rule, orientation lock)
    const r = await window.axe.run(document, { preload: false, runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  });
}

describe("desktop", () => {
  for (const width of [901, 1100, 1440]) {
    it(`${width} px: rows line up in every state and keep their height; the top bar lines up with the cards`, async () => {
      let row1 = null, row2 = null;
      for (const [state, input] of Object.entries(STATES)) {
        const { context, page, errors } = await open({ viewport: { width, height: 1000 } });
        await fill(page, input);
        const [dog, weigh, summary, growth, feeding, energy] = await Promise.all(["#dogCard", "#weighInsCard", "#summaryCard", "#chartCard", "#feedingCard", "#energyCard"].map((s) => box(page, s)));
        assert.equal(dog.top, summary.top, `${state}: row 1 tops`);
        assert.equal(weigh.bottom, growth.bottom, `${state}: row 1 bottoms`);
        assert.deepEqual([feeding.top, feeding.bottom], [energy.top, energy.bottom], `${state}: row 2 edges`);
        row1 ??= weigh.bottom;
        assert.equal(weigh.bottom, row1, `${state}: row 1 keeps its height`);
        if (state !== "adult") { row2 ??= feeding.bottom; assert.equal(feeding.bottom, row2, `${state}: row 2 keeps its height`); } // adults add two fields
        const [icon, title, units, eunits] = await Promise.all([".top-bar__icon", "#dogCard .card__title", ".top-bar .segmented", "#energyCard .segmented"].map((s) => box(page, s)));
        assert.ok(Math.abs(icon.left - title.left) < 0.5, `${state}: top bar title over the left column's text`);
        assert.ok(Math.abs(units.right - eunits.right) < 0.5, `${state}: weight units over the energy units`);
        assert.equal(await overflowX(page), 0);
        assert.deepEqual(errors, []);
        await context.close();
      }
    });
  }
});

describe("phones (touch)", () => {
  // every visible control: its centre hits itself (no neighbour's touch area covers it), and the small controls
  // answer 21 px above and below their centre (a 44 px touch area)
  const TOUCH = () => {
    const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
    const label = (e) => e.id || e.getAttribute("aria-label") || e.textContent.trim().slice(0, 20);
    const hits = (e, x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t) || (t.control === e)); };
    const bad = [];
    for (const e of document.querySelectorAll("button, a[href], input, [role=combobox], label.switch")) {
      if (!shown(e) || e.closest(".footer, .dialog")) continue;
      e.scrollIntoView({ block: "center" });
      const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (e.type !== "checkbox" && !hits(e, cx, cy)) bad.push(`${label(e)}: centre covered`);
      if (e.matches(".icon-btn, .btn, .step, .segmented__btn, .switch") && !(hits(e, cx, cy - 21) && hits(e, cx, cy + 21))) bad.push(`${label(e)}: under 44 px`);
    }
    return bad;
  };
  for (const name of ["iPhone SE", "Galaxy S8", "Pixel 7"]) {
    it(`${name}: fits the width, 16 px fields, 44 px touch areas, charts read by touch, dialog`, async () => {
      const { context, page, errors } = await open(phone(name));
      assert.deepEqual(await page.evaluate(TOUCH), [], "empty state");
      await fill(page, STATES.puppy);
      assert.equal(await overflowX(page), 0);
      const small = await page.evaluate(() => [...document.querySelectorAll("input:not([type=range]):not([type=checkbox])")]
        .filter((e) => e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id || e.className));
      assert.deepEqual(small, [], "field text under 16 px makes iOS zoom in on focus");
      assert.deepEqual(await page.evaluate(TOUCH), [], "filled state");
      // the dates and weights keep room for their text ("mm/dd/yyyy" and "165.3" at 16 px)
      for (const sel of ["#birthDate", ".wi-date"]) assert.ok((await box(page, sel)).width >= 140, `${sel} wide enough`);
      assert.ok((await box(page, ".wi-kg")).width >= 64, "weight field wide enough");

      // growth chart: a tap shows the reading and it stays; a sideways drag moves it; a tap elsewhere hides it
      const tip = () => page.evaluate(() => { const t = document.querySelector("#chartTooltip"); return t.hidden ? null : t.textContent; });
      await page.locator("#growthChart").scrollIntoViewIfNeeded();
      const g = await page.locator("#growthChart").boundingBox(), y = g.y + g.height / 2;
      await page.touchscreen.tap(g.x + g.width * 0.4, y);
      const first = await tip();
      assert.ok(first && /median/.test(first), "tap shows the reading");
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g.x + g.width * 0.4, y }] });
      for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: g.x + g.width * 0.4 + 20 * i, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      const moved = await tip();
      assert.ok(moved && moved !== first, "a sideways drag moves the reading");
      await page.locator("#chartLegend").tap();
      assert.equal(await tip(), null, "a tap elsewhere hides it");
      await page.locator("#energyChart").scrollIntoViewIfNeeded();
      const e = await page.locator("#energyChart").boundingBox();
      await page.touchscreen.tap(e.x + e.width / 2, e.y + e.height / 2);
      assert.ok(await page.evaluate(() => !document.querySelector("#energyTooltip").hidden), "energy chart reads by tap");

      // help dialog: opens by tap, fits the screen, scrolls, closes by tap
      await page.evaluate(() => scrollTo(0, 0));
      await page.locator("#helpBtn").tap();
      const d = await page.evaluate(() => { const el = document.querySelector("#helpDialog"), r = el.getBoundingClientRect(); return { open: el.open, fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, scrolls: el.scrollHeight > el.clientHeight }; });
      assert.deepEqual(d, { open: true, fits: true, scrolls: true });
      await page.locator("#helpClose").tap();
      assert.equal(await page.evaluate(() => document.querySelector("#helpDialog").open), false);
      assert.deepEqual(errors, []);
      await context.close();
    });
  }
});

describe("accessibility (axe-core, WCAG 2.2 AA and best practices)", () => {
  for (const scheme of ["light", "dark"]) {
    it(`${scheme} theme: empty, filled, a menu open, the help dialog open, and on a phone`, async () => {
      const { context, page, errors } = await open({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
      assert.deepEqual(await axeViolations(page), [], "empty");
      await fill(page, STATES.puppy);
      assert.deepEqual(await axeViolations(page), [], "filled");
      await page.click("#foodPer");
      assert.deepEqual(await axeViolations(page), [], "food unit menu open");
      await page.keyboard.press("Escape");
      await page.click("#helpBtn");
      assert.deepEqual(await axeViolations(page), [], "help dialog open");
      assert.deepEqual(errors, []);
      await context.close();
      const m = await open({ ...phone("Pixel 7"), colorScheme: scheme });
      await fill(m.page, STATES.puppy);
      assert.deepEqual(await axeViolations(m.page), [], "phone, filled");
      await m.context.close();
    });
  }
});

describe("CSV table and saved inputs", () => {
  it("downloads the key figures, weigh-ins and a monthly projection", async () => {
    const { context, page, errors } = await open({ viewport: { width: 1280, height: 900 } });
    await fill(page, { ...STATES.puppy, name: "=Charlie" });
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#downloadBtn")]);
    assert.equal(download.suggestedFilename(), `doge-growth-charlie-${TODAY}.csv`);
    const csv = fs.readFileSync(await download.path(), "utf8");
    assert.ok(csv.startsWith("﻿"), "byte-order mark for spreadsheet apps");
    const rows = csv.slice(1).split("\r\n");
    assert.equal(rows[0], `Doge Growth,table created ${TODAY}`);
    assert.equal(rows[1], "Name,'=Charlie", "typed text is not read as a formula");
    assert.ok(rows.includes("Breed,Labrador Retriever"));
    assert.ok(rows.some((r) => r.startsWith("Adult estimate at 2 years (kg),")));
    assert.ok(rows.some((r) => r.startsWith("Food today (g/day),")));
    const head = rows.findIndex((r) => r.startsWith("Date,Age (weeks),Row,"));
    assert.ok(head > 0, "table header");
    const table = rows.slice(head + 1).filter(Boolean).map(cells);
    assert.equal(table.filter((r) => r[2] === "weigh-in").length, LAB.length);
    assert.ok(table.some((r) => r[2] === "today, projected"));
    assert.equal(table[table.length - 1][2], "projection, 2 years");
    assert.ok(table.every((r) => r.length === 9), "every row has the energy and food columns");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("restores saved inputs after a reload and ignores malformed saved data", async () => {
    const { context, page, errors } = await open({ viewport: { width: 1280, height: 900 } });
    await fill(page, { ...STATES.puppy, sex: "F" });
    await page.click("[data-unit=lb]"); await page.click("[data-agemode=months]");
    await page.reload(); await page.waitForTimeout(300);
    assert.equal(await page.inputValue("#breed"), "Labrador Retriever");
    assert.equal(await page.locator(".weighin").count(), LAB.length);
    assert.ok(await page.locator("[data-sex=F]").evaluate((e) => e.classList.contains("is-selected")));
    assert.ok(await page.locator("[data-unit=lb]").evaluate((e) => e.classList.contains("is-selected")));
    assert.equal(await page.inputValue("#ageMonths"), "7.4", "32 weeks shown as months");
    assert.deepEqual(errors, []);
    for (const saved of [{ food: { value: 3800, per: "kcal/lb" } }, { sex: "X" }, { weighIns: { date: "2026-08-01", kg: 5 } },
      { birthDate: "2026-05-26", weighIns: [{ date: "2026-08-11", kg: "12" }] }, "not json", { v: 99, breed: "Beagle" }]) {
      await page.evaluate((s) => localStorage.setItem("doge-growth-state", typeof s === "string" ? s : JSON.stringify(s)), saved);
      await page.reload(); await page.waitForTimeout(200);
      assert.ok((await page.textContent("#chartChip")).length > 0, `renders with saved ${JSON.stringify(saved)}`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
});
