# Doge Growth — growth centiles, adult-weight projection and energy needs for dogs

A static web app (`app/`) and a reproducible Python pipeline (`pipeline/`) that:

1. **Refits veterinary growth standards from open data.** The Banfield extract behind the WALTHAM puppy growth charts (Salt et al. 2017; 14.96 M visits, CC BY 4.0) is filtered with the paper's selection rules to 202,334 weights from 52,868 healthy, intact, purebred dogs in normal body condition, and fitted with LMS (Box-Cox Cole–Green) centile models by sex and adult-size group, 8 weeks to 2 years.
2. **Adjusts the chart to the breed.** For a chosen breed or a typed adult weight, the chart is interpolated between the size groups at that adult weight. On held-out dogs, predicting the last weight between 1 and 2 years from one weigh-in at 8–16 weeks, the median error was 9.8% against 10.6% on size-group charts, with each breed's weight taken from the clinic data; the gain shrinks as the breed weight gets less accurate.
3. **Projects an individual puppy's trajectory.** Weigh-ins become z-scores; future z-scores are the conditional distribution given the observed ones, with the between-age correlation fitted on 38,608 dogs. The band narrows with more weigh-ins, widens with horizon and moves toward the median over time. On held-out dogs, the 50%, 90% and 95% bands held 64%, 92% and 95% of the next weigh-in.
4. **Estimates daily energy.** FEDIAF 2025 growth equation (Klein et al. 2019) as the primary number, NRC 2006 and AAHA 2021 alongside; FEDIAF age or activity bands for adults; food amount from the label's energy (kcal/kg, kcal/cup, kcal/100 g or kJ/100 g).

The app is published at <https://01a1380e-bdea-9fb6-0819-6baf6a8bc706.share.connect.posit.cloud>. It is one HTML page with no build step and no server: open `app/index.html` or serve the `app/` files from any static host. Styling is Material Design 3, inspired by Google Fit (light and dark). Units: kg or lb; kcal or kJ; age as a date of birth or in months. A step row guides the inputs in order and states what they predict before the first weigh-in; once a weigh-in is charted, a CSV table of the key figures, weigh-ins and monthly projection with energy and food can be downloaded. The app states estimates and their spread; it gives no feeding or veterinary advice.

## Repository layout

```
app/                 the web app (index.html, app.css, ui.js, growth.js, model/)
app/model/           fitted tables: centiles.json (with the size groups), tracking.json, breeds.json, model.js (bundle of the three)
pipeline/            01_prepare … 07_breed_experiment; charts.py (size groups, breed-adjusted charts), lms.py (centile fitter),
                     tracking.py (between-age correlation)
tests/               test_growth.js (the model maths, checked against the pipeline), test_ui.js (the page in Chromium)
data/raw/            open source data (not committed; see below)
data/derived/        selection counts, fit objects, validation and experiment results, figures
```

## Reproducing the model

```bash
pip install -r requirements.txt   # Python 3.13; versions pinned as used for the committed results
# open data (CC BY 4.0): https://datacat.liverpool.ac.uk/377/  -> data/raw/datacat377/Final_Data_PLOS.csv (1.15 GB unzipped)
# validation data (CC BY): https://datacat.liverpool.ac.uk/1091/ -> data/raw/*.txt
# breed weights: Hayward et al. 2016, Supplementary Data 2 -> data/raw/hayward2016_supp_data2.xlsx
python pipeline/01_prepare.py              # selection rules of Salt et al. 2017 -> visits_selected.parquet
python pipeline/02_fit_centiles.py         # 12 LMS models, reference weights, shrink factors -> app/model/centiles.json
python pipeline/03_fit_tracking.py         # between-age correlation of z-scores -> app/model/tracking.json
python pipeline/04_breed_table.py          # breed -> adult weight -> app/model/breeds.json
python pipeline/05_export.py               # bundle for the page -> app/model/model.js
python pipeline/06_validate.py             # independent colony datasets -> data/derived/validation_colony.json
python pipeline/07_breed_experiment.py     # chart comparison on held-out dogs -> data/derived/breed_experiment.json
python pipeline/07_breed_experiment.py --noise   # adds the sensitivity to adult-weight errors to the same file
```

`02_fit_centiles.py --reuse` rebuilds the exports from the saved fits without refitting (the fits take about 8 minutes); it needs `data/derived/centiles_fit.json` and `visits_selected.parquet` from earlier runs. Steps 01, 03–07 and `02 --reuse` write identical files on every run; a full refit of 02 matches the committed weekly tables to within 0.01% (the fits stop at a convergence tolerance).

## Tests and lint

```bash
npm ci                            # Node.js 22 or later; installs the test and lint tools only
npm test                          # the model maths in growth.js, checked against the pipeline
npx playwright install chromium   # once, for the page tests
npm run test:ui                   # the page in Chromium: aligned grid at desktop widths; phones with touch (no sideways
                                  # scrolling, 16 px field text, 44 px touch areas, charts read by tap); axe-core in both
                                  # themes; the CSV table; saved inputs
npm run lint                      # ESLint
ruff check pipeline               # Python lint (ruff.toml; pip install ruff==0.16.8)
```

CI (`.github/workflows/ci.yml`) runs all of them on every push and checks that `app/model/model.js` is the bundle of the JSON files.

## Deploying to Posit Connect

The app is static HTML. With Posit Publisher in Positron (or VS Code), choose `app/index.html` as the entrypoint (content type HTML) and include exactly these files:

```
app/index.html
app/app.css
app/ui.js
app/growth.js
app/model/model.js
```

The JSON files in `app/model/` are not loaded by the page (`model.js` bundles them). Publisher keeps its configuration and deployment record in `app/.posit/publish/`, next to the entrypoint; the folder is ignored by git. In that configuration, `files = ["/index.html", "/app.css", "/ui.js", "/growth.js", "/model/model.js"]`. Any other static host works the same way: serve those five files with the same layout.

## Method in brief

**Selection (01).** Purebred dogs; weights taken while intact (never neutered, or dated before a recorded neuter date); visits for preventive care or with a "Healthy pet" diagnosis; body condition "Normal" at every scored visit and at least once between 2 and 3 years; ages 0.10–2.30 years (wider than the paper's 0.20–2.25, so the charts have data either side of 8 weeks and 2 years); outliers removed approximately as in the paper. Size group from the breed's mean adult weight in the database (I <6.5, II 6.5–9, III 9–15, IV 15–30, V 30–40, VI ≥40 kg). 202,334 weights from 52,868 dogs of 31 breeds, visits 1994–2013.

**Centiles (02).** For each sex × size group, weight ~ BCCG(μ(x), σ(x), ν(x)) with x = age^0.1; log μ, log σ and ν as penalised cubic B-splines, the smoothing of log μ and log σ chosen by SBC and ν given a fixed penalty (λ = 1000). Calibration on the fitting data, over 672 cells (12 models × 8 age bins × the 7 drawn centiles): 62% within 1 percentage point of nominal, 94% within 3, largest 5.4 points (giant females, 25th centile, oldest bin). Residual excess kurtosis −0.54 to 0.60, so BCPE's extra parameter was not needed. Group VI is provisional (86% of its weights are one breed).

**Breed-adjusted charts (02, 04, charts.py).** Each size-group chart has a reference weight: the geometric mean of the breed adult weights over all weights in its data. For an adult weight W, log M − log W, log S and L are interpolated linearly in log W between the references, and log W is added back; beyond the lightest and heaviest references the end chart is scaled. Breed weights come from Hayward et al. 2016 (breed-standard male weights, converted to sexes pooled and calibrated to the clinic population by quantile matching). For the 33 breeds that Salt et al. placed in a size group, the weight is kept within that group's observed range and shrunk toward its reference by k = τ²/(τ² + 0.10²), where τ is the spread of breed weights within the group (k: toy 0.85, small 0.21, medium 0.70, medium-large 0.39, large 0.00, giant 0.47). A typed expected adult weight sets the chart's 2-year median directly.

**Why breed-adjusted (07).** Held-out comparison (20% of dogs; 1,328 test dogs of breeds with enough data for a per-breed chart), predicting the last weight between 1 and 2 years from one weigh-in at 8–16 weeks. Charts are refitted on the training dogs over the full selection window and scored from 8 weeks to 2 years, the app's range:

| Chart | Median error | RMSE (log kg) |
| --- | --- | --- |
| Size group | 10.6% | 0.1910 |
| Breed-adjusted at the breed's clinic weight | 9.8% | 0.1705 |
| True per-breed chart (not shippable: breed IDs are disguised) | 9.4% | 0.1643 |

With random error added to each breed's adult weight (log-SD 0.05 / 0.10 / 0.15 / 0.20, 8 draws each, 1,402 test dogs), the shrunk breed-adjusted chart stays below the size-group error (median 10.2 / 10.9 / 11.9 / 13.3% versus 11.0 / 11.7 / 12.3 / 13.4%); unshrunk interpolation loses its advantage on median error from 0.15. With two or more weigh-ins, all chart choices are within 0.4 points (5.1–5.5%).

**Tracking (03).** z(s) = η(s) + e, where η is a Gaussian process with cov(η(s), η(s′)) = (1 − ν)·exp(−|s − s′|/ℓ) and e is independent noise with variance ν, so corr(z(s), z(s′)) = (1 − ν)·exp(−|s − s′|/ℓ) for s ≠ s′; s = log age in years, on weights from 8 weeks to 2 years. Log age fitted better than Box-Cox powers of age from −0.5 to 0.5. Breed-adjusted charts: ν = 0.066, ℓ = 2.86 (38,608 dogs); size-group charts (used when the chart is fitted to the weigh-ins): ν = 0.061, ℓ = 3.07. Predicting each dog's last weight from the earlier ones, the 50 / 80 / 95% bands held 63 / 87 / 95% in the fitting dogs (31,771) and the 50 / 90 / 95% bands 64 / 92 / 95% in held-out dogs (07, 5,872 dogs).

**Energy (growth.js).** Growth: ME = (254.1 − 135·p)·BW^0.75 kcal/day, p = current / expected adult weight (FEDIAF 2025 Table VII-8b; 8 weeks–1 year, extended past 1 year while p < 0.95, up to 2 years). Comparisons: NRC 2006 130·BW^0.75·3.2·(e^(−0.87p) − 0.1); AAHA 2021 RER × 3 (<4 months) / × 2. Adults: FEDIAF Table VII-6 by completed years (1–2: 130, 3–7: 110, over 7: 95 × BW^0.75) or Table VII-7 by activity; NRC 2006 95–130 and AAHA 2021 1.4–1.6 (neutered) / 1.6–1.8 (intact) × RER for comparison. Energy is shown to 10 kcal (50 kJ).

**Growth notes (growth.js).** Following Salt et al. 2020: the latest weight below the 2nd or above the 98th centile; more than two of the drawn centile lines (2, 9, 25, 50, 75, 91, 98) crossed between the first weight and the weight furthest from it; no gain over 3 weeks or more in which a puppy staying on its centile gains over 5%.

## Validation against independent data (06)

Colony puppies from Salt et al. 2020 (never in the Banfield data), 405 dogs in 13 breed × sex groups. Dog-weighted mean |z| of each group's mean (0 = perfectly centred):

| Chart path | Mean \|z\| |
| --- | --- |
| Size group as labelled by the colony (insider knowledge) | 0.73 |
| Size group the app would pick from its breed table | 1.10 |
| Breed-adjusted (shipped) | 0.85 |

The largest gain is UK Cocker Spaniels: about −3.9 z on the 15–30 kg chart their table weight points to, about −1.0 z breed-adjusted. WALTHAM colony Labradors sit at −0.5 to −0.75 z, and Miniature Schnauzers in the WALTHAM colony and vitamin A trial at +1.2 to +1.5 z, on every path: these populations differ from US pet dogs. In the Labrador feeding trial, puppies fed 118 / 100 / 88% of their energy requirement sit at +1.2 / −0.3 / −1.0 z. Banfield dogs later classed underweight / overweight / obese sit at −0.83 / +0.43 / +0.86 z.

Centile crossing, counted for dogs with three or more weights from 8 weeks to 2 years: more than two centile lines were crossed by 2.8% of WALTHAM colony puppies (10 of 356) and none of the 12 Royal Canin colony puppies (Salt et al. 2020: under 4%), by 8.0–8.3% of the healthy Banfield dogs the charts were fitted on (31,771 dogs), and by 14 / 19 / 24% of the Banfield dogs later classed underweight / overweight / obese.

## Limits

Charts cover 8 weeks to 2 years; US purebred clinic dogs, 1994–2013. For mixed breeds, and for dogs expected to weigh under about 3.5 kg or over about 60 kg as adults (the range of the breeds in the data), the charts are approximations; the giant chart is provisional. A breed's table weight can be off for a given population (UK colony Cocker Spaniels sit about 10% below theirs); a typed adult weight overrides it. The projection assumes continued healthy growth. Energy figures are population averages: measured intake in early growth ran about 15–30% below the NRC 2006 equation, and individual needs can differ by up to about 50%. Educational tool, not veterinary advice.

## Sources

- Salt C, Morris PJ, German AJ, et al. Growth standard charts for monitoring bodyweight in dogs of different sizes. PLOS ONE 2017;12(9):e0182064. https://doi.org/10.1371/journal.pone.0182064 — data: https://doi.org/10.17638/datacat.liverpool.ac.uk/377 (CC BY 4.0)
- Salt C, Morris PJ, Butterwick RF, et al. Comparison of growth patterns in healthy dogs and dogs in abnormal body condition using growth standards. PLOS ONE 2020;15(9):e0238521. https://doi.org/10.1371/journal.pone.0238521 — data: https://datacat.liverpool.ac.uk/1091/
- Hayward JJ, et al. Complex disease and phenotype mapping in the domestic dog. Nat Commun 2016;7:10460 (Supplementary Data 2)
- FEDIAF Nutritional Guidelines for Complete and Complementary Pet Food for Cats and Dogs, September 2025, Tables VII-6, VII-7, VII-8b
- Klein C, Thes M, Böswald LF, Kienzle E. Metabolisable energy intake and growth of privately owned growing dogs in comparison with official recommendations. J Anim Physiol Anim Nutr 2019;103:1952–1958
- National Research Council. Nutrient Requirements of Dogs and Cats. 2006
- AAHA 2021 Nutrition and Weight Management Guidelines, Box 1
- Alexander JE, et al. J Nutr Sci 2017;6:e26; Brenten T, et al. Br J Nutr 2014;111:2104; Bradley S, et al. Animals 2021;11:1380; Bermingham EN, et al. PLOS ONE 2014;9:e109681; Thes M, et al. J Anim Physiol Anim Nutr 2016;100:813
- Cole TJ, Green PJ. Smoothing reference centile curves: the LMS method and penalized likelihood. Stat Med 1992;11:1305–1319

## License

Code: GPL-3.0 (see LICENSE). Fitted tables in `app/model/` are derived from CC BY 4.0 data (attribution above). Material Symbols icons: Apache 2.0. DM Sans and Roboto: SIL Open Font License / Apache 2.0 (Google Fonts).
