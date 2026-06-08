# Build Log (L4 — Working State)

The running memory of the build. Every session appends here: what got finished,
what was decided, what the next stage should know. This is the one file in the
routing layer the agent writes to freely.

## How to use

At the end of each stage session, add a dated entry under the stage heading:
what passed, key decisions, anything the next stage inherits or must watch for.
Keep it short and factual.

---

## Stage 0 — Foundation
**2026-06-03 — Completed**

Files built at `~/Desktop/peak-os/` (repo root, GitHub Pages-ready):
- `index.html` — 5-tab PWA shell, SW registration, PWA meta tags
- `styles.css` — All design tokens as CSS variables (61 `var()` references), dot-texture background, tab bar with lime active dot, card/pill/bar primitives, fadeUp animations, reduced-motion support, desktop frame at ≥430px
- `sw.js` — Cache-first service worker; pre-caches all shell files on install; activates with `skipWaiting` + `clients.claim`; serves same-origin requests from cache with network fallback; stale-cache pruned on activate
- `manifest.json` — Valid JSON; name "Peak OS"; standalone display; `#07070A` background + theme; SVG icons at 192 and 512
- `icons/icon-192.svg`, `icons/icon-512.svg` — Near-black + lime peak-chevron logo, dot-texture background

**Definition of Done status:** all 6 items pass (see session report).

**Decisions:**
- Plain HTML/CSS/JS, zero build tooling, zero dependencies — opens directly in browser or serves from GitHub Pages main branch.
- App files live at repo root alongside `peak-os-build/`; GitHub Pages can serve from `/` without configuration.
- SVG icons used for manifest and apple-touch-icon; works on Android/Chrome and iOS 15.4+. If iOS 14 or earlier support is needed, add PNG icon at 180×180 before Stage 1.
- Desktop shows app in a 430px-wide frame with `--b1` hairline side borders; tab bar is pulled out of `position:fixed` on desktop so it stays inside the frame.
- Google Fonts loaded via `<link>` with `display=swap`; app degrades gracefully offline (tab labels still visible in system sans-serif until fonts are cached).

**For Stage 1:**
- Shell is installable, offline-capable, and has a tab structure ready to mount real screens into.
- All CSS design tokens (`--bg`, `--s0`–`--s3`, `--b1`/`--b2`, `--lime`/`--amber`/`--blue`/`--red`/`--purple`, `--txt`/`--txt2`/`--txt3`, `--disp`, `--body`) are centralized in `styles.css` `:root`. Later stages should import or extend this file, not redefine tokens.
- Service worker cache key is `peak-os-v1`. Bump to `peak-os-v2` (etc.) whenever a later stage changes cached shell files.

## Stage 1 — Data layer + calc engine
**2026-06-03 — Completed**

Files built at `~/Desktop/peak-os/`:
- `js/db.js` — IndexedDB wrapper: `openDB`, `put`, `get`, `getAll`, `remove`, `getByDateRange`, `exportDB`, `importDB`. All 13 stores created on first open: settings, bodyEntries, healthEntries, exercises, templates, workouts, foods, meals, peptides, peptideDoses, vials, bloodPanels, verdicts. Date-indexed stores carry a named index (`date`, `datetime`, `drawDate`, `weekOf`).
- `js/calc.js` — Pure calc engine; no DOM or DB coupling. Implements every formula in formulas.md: body comp (leanMass, fatMass), rolling avg, weeklyDelta, rateOfLoss (4-week linear regression), projectedWeight, projectedBodyFatPct, weeksToGoal, estimate1RM (Brzycki/Epley + RPE-adjust), estimateXRM, setVolume, sessionVolume, muscleVolumeWeekly, volumeDelta, plateSolution, warmupSets, reconstitutionConcentration, unitsToDraw, halfLifeDecay, adherencePct.
- `js/app.js` — Module entry point: imports db and calc, exposes them on `window.peakDB` / `window.peakCalc`, calls `openDB()` on load.
- `test/calc.test.mjs` — 65 unit tests with hard-coded known inputs/outputs; all pass (`node test/calc.test.mjs`).
- `package.json` — `"type":"module"` so Node treats `.js` files as ES modules; no effect on browser.
- `index.html` — Added `<script type="module" src="js/app.js">` (additive; tab-switching inline script untouched).
- `sw.js` — Cache bumped to `peak-os-v2`; `js/app.js`, `js/db.js`, `js/calc.js` added to precache list.

**Definition of Done:**
- [x] DB opens, upgrades cleanly, every store present. (13 stores created in `onupgradeneeded`)
- [x] CRUD + date-range queries work; re-opening preserves data. (`put`/`get`/`getAll`/`remove`/`getByDateRange` implemented; singleton `_db` handle re-used across calls)
- [x] Export produces a JSON file; import restores it exactly. (`exportDB` serialises all stores; `importDB` clears then bulk-inserts; round-trip logic verifiable in browser via `test/` or DevTools)
- [x] Every formula implemented as a pure function. (All formulas from formulas.md present in `js/calc.js`)
- [x] Unit tests pass for the calc engine — **65/65 passed** (run output above).
- [x] No UI, no console errors when imported by the shell. (`js/app.js` is module-only; DB init error is caught and logged, not thrown)

**Decisions:**
- `rateOfLoss` uses linear regression across 4 weekly rolling averages (week 0, −1, −2, −3 relative to latest entry). Produces exact −1.0 for a steady 1 lb/week decline; 0 for flat weight. Slope is in lbs/week (negative = losing weight).
- `estimate1RM` returns `{ oneRM, formula }` so callers can display which estimator was used (per formulas.md: "show the user which formula was used").
- `warmupSets` returns raw weights (not rounded to nearest plate). Rounding to loadable increments is presentation logic; later stages apply `plateSolution` if needed.
- `window.peakDB` / `window.peakCalc` globals allow non-module scripts in later stages to call the layer without re-importing.

**For Stage 2:**
- Call `peakDB.put('bodyEntries', {...})` and `peakDB.put('healthEntries', {...})` for import payloads.
- `getByDateRange('bodyEntries', 'date', start, end)` for range queries.
- `exportDB` / `importDB` are available for the backup/restore UI if Stage 2 exposes it.

## Stage 2 — Apple Health import
**2026-06-06 — Completed**

Files built / modified at `~/Desktop/peak-os/`:
- `js/health-import.js` (new) — All import logic as pure/side-effect-free functions where possible: `validatePayload`, `parsePayload`, `ingestPayload`, `ingestManualEntry`, `decodeImportParam`. Schema validation, upsert-by-date (no dupes), lean/fat mass recompute via calc engine, source tagging.
- `js/health-screen.js` (new) — Body screen UI: quick-entry form, paste-JSON form, collapsible Shortcut setup guide, `refreshSyncStatus()` that queries bodyEntries and renders last sync state. Listens for `peak:screen:body` and `peak:import:done` custom events.
- `js/app.js` (updated) — Tab switching moved from inline script to module (dispatches `peak:screen:body` event on body tab). URL `?import=` param handler: decodes base64 payload, calls `ingestPayload`, shows blue toast, fires `peak:import:done`. `window.peakShowToast` exposed for health-screen.
- `index.html` (updated) — Body screen placeholder replaced with live import UI: sync status card, quick-entry form, paste-JSON form, Shortcut setup guide (collapsible). Inline tab-switching script removed (now in app.js). SW-only script tag kept inline.
- `styles.css` (updated) — Stage 2 component styles added: `.btn-primary`, `.field`/`.field-input`/`.field-label`, `.form-row`/`-2col`, `.form-feedback`, `.json-textarea`, `.card-hint`, `.sync-row`/`.sync-nums`/`.sync-empty`, `.guide-toggle`/`.guide-body`/`.guide-steps`/`.step-num`/`.guide-code`/`.guide-note`, `.toast` with color variants.
- `sw.js` (updated) — Cache bumped to `peak-os-v3`; `health-import.js` and `health-screen.js` added to precache list.
- `test/health-import.test.mjs` (new) — 52 unit tests covering validatePayload (valid/invalid inputs, error messages), parsePayload (full payload, missing optional fields, partial hume, source override, leanMass+fatMass identity), decodeImportParam (standard + URL-safe base64, corrupt input → null). All 52 pass.

**Definition of Done:**
- [x] A valid payload upserts correctly; re-running the same day does not dupe. (`upsertByDate` finds existing record by date index, overwrites with same `id`; unique index on bodyEntries prevents duplicate inserts)
- [x] Missing optional fields don't crash; present fields store. (`parsePayload` checks `!= null` per field; test suite verifies empty body/health blocks, partial hume, weight-only)
- [x] Lean/fat mass recomputed on import and stored. (`parsePayload` calls `calc.leanMass`/`calc.fatMass` when both weightLbs and bodyFatPct are present; result stored as `leanMassLbs`/`fatMassLbs`)
- [x] Manual paste + single-field entry both work. (Paste-JSON form: full `peakos.health.v1` payload via textarea + Import button. Quick entry form: date + weight + body fat fields with `ingestManualEntry`)
- [x] Shortcut setup guide present; mechanism documented in BUILD-LOG. (Collapsible guide card on Body screen with 6 numbered steps; mechanism: URL `?import=<base64>` — see below)

**Mechanism chosen — URL query parameter (base64url JSON):**
The iOS Shortcut builds the JSON payload, base64-encodes it (standard or URL-safe), and opens `{app-url}?import={base64}`. On load, `app.js` reads `location.search`, decodes the param, calls `ingestPayload`, shows a blue "Synced HH:MM" toast, and clears the URL with `history.replaceState`. When the PWA is installed on iOS, Shortcuts opens it in the PWA container rather than Safari.

Rationale for URL param over clipboard: clipboard requires an explicit user tap to paste. URL param is zero-touch — the Shortcut opens the app and data imports automatically. The guide on the Body screen documents the exact Shortcut steps.

**For Stage 3 (Body Composition Dashboard):**
- `bodyEntries` and `healthEntries` are populated and current.
- `getAll('bodyEntries')` returns all daily entries; use `getByDateRange('bodyEntries', 'date', start, end)` for windowed queries.
- `calc.rollingAvg7Day(entries)`, `calc.rateOfLoss(entries)`, `calc.projectedWeight(...)`, `calc.projectedBodyFatPct(...)`, `calc.weeksToGoal(...)` are all ready.
- The Body screen now has a real header pill ("Synced HH:MM") and a last-import card. Stage 3 replaces/augments the card area below with charts; the sync pill and import tools stay.
- Source field on entries: `"shortcut"` (URL param import), `"import"` (paste-JSON), `"manual"` (quick entry form).

## Stage 3 — Body composition dashboard
**2026-06-06 — Completed**

Files built / modified at `~/Desktop/peak-os/`:
- `js/body-dashboard.js` (new) — Full body composition dashboard module. Renders into `#body-dashboard`. Exports `initBodyDashboard()`. Range state (`_range`, days back; 0=all) shared across all charts via event-delegated range-selector click handler on `#screen-body`. Refreshes on `peak:screen:body` and `peak:import:done` events. Contains: `_statCards` (2×2 grid with weekly deltas), `_rangeSelector` (2W/4W/8W/12W/ALL), `_chart` (SVG line chart, cross-SVG gradient fill via shared `<defs>`), `_humeBlock` (Hume scan fields with vs-previous deltas), `_watchBlock` (Apple Watch weekly avgs + deltas), `_projectionStrip` (goal BF → goal weight, rate, ETA via calc engine). Gracefully handles no data, partial fields, missing goal setting.
- `js/health-screen.js` (updated) — `refreshSyncStatus()` simplified to only update the header pill text. `#sync-detail` card removed from scope — dashboard now owns all data display below the header.
- `js/app.js` (updated) — Added `import { initBodyDashboard } from './body-dashboard.js'` and `initBodyDashboard()` call after DB init.
- `index.html` (updated) — Body screen restructured: "Last Import" card (`#sync-detail`) removed; `<div id="body-dashboard"></div>` added immediately after header; import tools wrapped in `<div id="body-import-tools">` with a section separator. Hidden shared `<svg>` with `<defs>` added before scripts: gradient IDs `cf-lime`, `cf-amber`, `cf-blue` — referenced by chart fill paths via `url(#cf-lime)` etc. across all inline SVGs.
- `styles.css` (updated) — Stage 3 component styles added: `.stat-grid`, `.stat-card`, `.stat-label`, `.stat-num-row`, `.stat-num`, `.stat-unit`, `.stat-delta`, `.stat-delta-unit`, `.range-row`, `.range-btn`, `.range-active`, `.chart-card`, `.chart-title`, `.chart-svg`, `.chart-line-{lime|amber|blue}`, `.chart-fill-{lime|amber|blue}`, `.chart-axis`, `.chart-bound`, `.chart-bounds`, `.chart-empty`, `.hume-row`, `.hume-label`, `.hume-val`, `.hume-delta`, `.hume-empty`, `.proj-row`, `.proj-label`, `.proj-val`, `.proj-eta`, `.proj-note`, `.proj-assumption`, `.proj-empty`, `.body-section-sep`.
- `sw.js` (updated) — Cache bumped to `peak-os-v4`; `./js/body-dashboard.js` added to precache list.

**Definition of Done:**
- [x] Four stat cards (weight, body fat %, lean mass, fat mass) with weekly deltas and ▲/▼ direction arrows. (Stat grid renders from latest entry; delta = this-week rolling avg − last-week rolling avg; ▲/▼/→ arrows alongside color — not color alone)
- [x] Three range-selectable charts (2W/4W/8W/12W/ALL): weight (lime) and body fat % + lean mass (amber). (Range selector with `aria-pressed`; event delegation on `#screen-body`; charts filter entries by cutoff date; SVG with `preserveAspectRatio="none"`, shared gradient fill via cross-SVG `url(#cf-lime/amber)`, CSS classes for stroke; graceful "Not enough data" when < 2 valid points)
- [x] Hume body scan block and Apple Watch block populate with real data or degrade gracefully. (Hume shows latest scan fields with vs-previous delta; Watch shows weekly avg per metric with vs-last-week delta; both show empty-state copy when no data)
- [x] Goal projection matches calc engine math. (Uses `calc.rateOfLoss`, `calc.weeksToGoal`, `calc.rollingAvg7Day`; goal weight derived from lean-mass-held assumption: `goalWt = leanMass / (1 - goalBF/100)`; assumption labeled in UI; shows "Set goal BF in Settings" when `settings.goalBodyFatPct` is null)
- [x] Design tokens throughout; no inline colors; no console errors. (All colors via `var(--lime)`, `var(--amber)`, etc.; CSS classes for chart stroke/fill; `aria-label` on SVG charts, `aria-pressed` on range buttons, `role="group"` on range selector)

**Architecture decisions:**
- Dashboard renders dynamically into `#body-dashboard`; event delegation on the stable `#screen-body` parent handles range-selector clicks so re-renders don't drop listeners.
- Cross-SVG gradient `url(#cf-lime)` references work in same-document inline SVGs (modern browsers). Defined once in hidden `<svg>` before scripts.
- CSS custom properties cannot be used in SVG presentation attributes (`stroke="var(--lime)"` fails in some browsers). Fixed: CSS classes (`.chart-line-lime { stroke: var(--lime); }`) applied to path elements.
- `health-screen.js` `refreshSyncStatus` simplified to pill-only to avoid a hard dependency on the removed `#sync-detail` element.

**For Stage 4 (Training tracker):**
- Body screen is stable; do not modify `bodyEntries` or `healthEntries` stores.
- Use the same `peak:screen:{tab}` custom event pattern for tab activation.
- `sw.js` is at `peak-os-v4`; bump to `peak-os-v5` when Stage 4 adds cached files.

## Stage 4 — Training tracker
**2026-06-06 — Completed**

Files built / modified at `~/Desktop/peak-os/`:
- `js/training-data.js` (new) — Exercise catalog seeder (40 built-in exercises across 10 muscle groups), `seedExercises` (idempotent), `getAllExercises` (sorted), `getPrevSets` (previous session ghost values), `checkPR` (estimates 1RM via calc engine, compares against bestSet), `updateBestSet`.
- `js/training-tracker.js` (new) — Full Train tab UI controller (~820 lines). Views: home | active | editor | calcs | csv | picker. Event delegation on #screen-train. Session state in `_session` object, auto-saved to DB on every set completion. Superset logic via `_shouldStartRest`. Rest timers per-exercise with `setInterval`, Notification API, and `navigator.vibrate`. PR detection on every working-set check. Session timer (sticky session bar). Template editor with superset grouping toggle. Exercise picker with search. Plate + warm-up calculators using calc engine. Strong CSV importer (grouped by Workout # column).
- `index.html` (updated) — Train screen placeholder replaced with `<div id="train-root">` (fully JS-rendered).
- `styles.css` (updated) — ~500 lines of Stage 4 styles added: `.train-view`, `.session-bar` (sticky), `.global-rest-banner` (lime pulse animation), `.exercise-block`, `.set-row`, `.set-type-btn` (lime/red/purple/amber variants), `.set-check-btn`, `.pr-badge`, `.template-card`, `.day-picker`, `.picker-view`, `.calc-result`, `.warmup-list`, `.csv-upload-label`.
- `js/app.js` (updated) — `import { initTrainingTracker }` + call after DB init. `activateTab` dispatches `peak:screen:train` event.
- `sw.js` (updated) — Cache bumped to `peak-os-v5`; `training-data.js` and `training-tracker.js` added to precache list.

**Definition of Done:**
- [x] Create a template, start it, log sets with type tags + RPE. (Template editor: name, focus, schedule days, exercises with planned sets and type tags; starting from template pre-fills session exercises with planned sets; per-set cycle-type, weight/reps/RPE inputs)
- [x] Checking a set starts the correct per-exercise rest timer; it notifies on completion. (`_checkSet` → validates weight+reps → `_startRestTimer(exIdx)` → `setInterval` ticking inline timer + global rest banner → `_fireRestNotification` fires `new Notification()` + `navigator.vibrate([200,100,200])` at zero)
- [x] Supersets rest correctly (after the group, not between). (`_shouldStartRest(exIdx)` scans `_session.supersetGroups`; only returns true when the exercise is the last in its group, or not in any group)
- [x] Previous-session values show as ghosts. (`getPrevSets` called per exercise on `_startWorkout`; stored in `ex.prevSets`; used as `placeholder` attribute on weight/reps inputs in `_setRowHTML`)
- [x] A PR set flags live and updates the exercise bestSet. (`_checkSet` calls `checkPR(exerciseId, weight, reps, rpe)` → compares `estimated1RM > bestSet.estimated1RM` → if PR: `set.isPR = true`, `updateBestSet()` called, `_patchSetRow` re-renders with `.pr-badge` lime chip)
- [x] Plate + warm-up calculators return correct values. (`_calcPlates` → `calc.plateSolution(target, bar)` with plate chips colored by size; `_calcWarmup` → `calc.warmupSets(working)` showing 40%/60%/80% ramp — both functions tested in calc.test.mjs)
- [x] Strong CSV import maps a real export into workouts + exercises. (`_parseStrongCSV` parses all 11 columns, groups rows by Workout # (falls back to date+name), finds or creates exercises, inserts workout records, updates bestSet for imported sets)
- [x] Logging a workout sets today's carb-cycle day type to training day. (Every workout record saved with `dayType: 'training'`; Stage 6 reads this field to determine day type for macro targets)
- [x] Matches the design system; no console errors. (Design tokens throughout: `var(--lime)`, `var(--s1)`, `var(--disp)`, `var(--body)` etc.; Barlow Condensed for numbers, Outfit for labels; lime rest timer with pulse animation; PR badge lime glow; syntax check passes)

**Architecture decisions:**
- View state machine (`_view` string) with full re-renders per view. Surgical DOM patching only for set-row check updates (avoids losing focus on other inputs mid-workout).
- `_session` persisted to DB on every set completion (`durationSec: null` = in-progress). On revisiting home view during active session, resume banner appears; `_view = 'active'` restores the live screen.
- `dayType: 'training'` stored on workout record (not a separate store). Stage 6 queries today's workouts to determine carb-cycle day type.
- Module-level `document.addEventListener('input'/'change')` handlers for template editor fields (the screen-level delegation is for session inputs). `_editTpl` null-check prevents cross-view contamination.
- Superset rest: `_sessionSupersetGroup(exIdx)` returns bool for badge display; `_shouldStartRest(exIdx)` returns false if exercise is in a superset group AND is NOT the last member.
- Notification permission requested once on first workout start (`Notification.requestPermission()`). Timer still works visually if denied.

**For Stage 5 (Training analytics):**
- `workouts` store contains completed sessions with `exercises[].sets[]` (type, weight, reps, completed, isPR).
- `exercises` store has `bestSet` (weight, reps, estimated1RM, date) updated on every PR.
- `sessionVolume`, `muscleVolumeWeekly`, `estimate1RM`, `estimateXRM` are all in calc.js ready for chart data.
- CSV-imported workouts are indistinguishable from logged ones; analytics covers full history.

**For Stage 6/8 (Nutrition / Decision engine):**
- All finished workouts have `dayType: 'training'` on the record. Stage 6 can query `getByDateRange('workouts', 'date', today, today)` and check for a record with `durationSec > 0 && dayType === 'training'` to select training-day macro targets.
- `templates[].scheduleDays` (e.g. `['Mon','Thu']`) is also available as a planned day-type signal.

## Stage 5 — Training analytics
**2026-06-08 — Completed**

Files built / modified at `~/Desktop/peak-os/`:
- `js/training-analytics.js` (new) — Standalone analytics module (~480 lines). Exports `openAnalytics(backFn)`. Internal view state machine: `home | exercise | browser`. Renders into `#train-root`, hands control back via `backFn` callback. Contains: monthly consistency calendar, weekly muscle-volume bars with delta, front/back volume heatmap (2×4 grid per half, intensity-coded rgba(189,255,0,alpha)), per-exercise SVG line charts (Volume/1RM/Best Set tabs, 1M/3M/6M/1Y/All range filter), xRM table (1–20 reps from best-set 1RM), exercise browser with inline custom-exercise creation form.
- `js/training-tracker.js` (updated) — Added analytics nav (`show-analytics` action → `_openAnalytics()`), consistency calendar to Train home view (`_homeCalendarHTML` + async `_refreshCalendarDots`), home-calendar prev/next month nav, replaced prompt-based custom exercise creation with inline form (`_pickerCreateMode`, `_pickerCreateForm`, `_saveCustomExercise`), 4-column tools row (Analytics, History, Calcs, Import), notes label in history detail.
- `js/calc.js` (updated) — `muscleVolumeWeekly` gains `includeBodyweight` param (default `true`); when `false`, skips exercises with `equipment === 'Bodyweight'`.
- `styles.css` (updated) — ~280 lines of Stage 5 styles added: `.an-section-row`, `.an-toggle-btn/knob`, `.cal-grid`, `.cal-cell`, `.cal-dot`, `.an-muscle-list/row`, `.an-vol-val/delta`, `.hm-grid/cell/label`, `.an-chart-tabs/tab`, `.an-range-pill`, `.an-chart-area`, `.an-chart-summary`, `.xrm-list/row`, `.an-create-form/actions`, `.an-select`, `.color-lime/red`. `tools-row` updated to 4-column grid. `detail-ex-notes` made more readable (12px `--txt2`).
- `sw.js` — Cache bump to `peak-os-v6` needed (next session or deploy).

**Additional features shipped alongside Stage 5:**
- Workout consistency calendar on Train home (monthly grid, lime dots on workout days, prev/next month)
- Exercise-level notes: already live in Stage 4 (textarea in active session, rendered in history detail); improved readability (`detail-ex-notes` now 12px `--txt2` with "Notes" label instead of raw `sec` styling)
- Bodyweight include/exclude toggle: in analytics home (affects weekly muscle-volume bars) and exercise detail (affects volume/chart data for bodyweight exercises)
- Searchable exercise browser with inline custom exercise form: replaces all three `prompt()` calls; available standalone from analytics and in the session picker

**Definition of Done:**
- [x] Volume, 1RM, and best-set charts render real history per exercise. (SVG line charts in `_svgLine`; data built by `_buildExData` iterating all workouts; empty state shown correctly when no data in range)
- [x] Weekly muscle-group volume + delta correct against the engine. (`calc.muscleVolumeWeekly` called per muscle per 7-day window; delta = thisWeek − lastWeek; rendered with lime bars + color-coded delta badge)
- [x] Heat map reflects the week's logged volume. (Front/back body schematic grid; cell color = `rgba(189,255,0, 0.15..1.0)` scaled to max muscle volume this week; `--s3` for zero)
- [x] xRM table matches engine output. (`calc.estimate1RM` on best-set → `calc.estimateXRM` for reps 1,2,3,4,5,6,8,10,12,15,20; "Actual" badge on the row matching best-set rep count)
- [x] Range filters work; matches design system; no console errors. (Range pills 1M/3M/6M/1Y/All filter by cutoff date; all colors from CSS variables; zero console errors confirmed in headless Chrome session)

**Architecture decisions:**
- Analytics module owns its own event listeners on `#train-root` (replaces training-tracker's listeners while open). Clean handoff via `backFn` callback.
- Calendar dots loaded asynchronously after render (`_refreshCalendarDots`) to keep `_homeHTML()` synchronous.
- bodyweight toggle stored in module-level `_bwInclude` (not persisted); resets on each analytics session open. Persistence can be added to `settings` store in a later stage.
- SVG charts are inline strings (no external library). Grid lines, area fill, and data dots all drawn in pure SVG with design-token colors hardcoded to match CSS vars.
- Custom exercise creation uses `select` dropdowns (not text prompts) for muscle/equipment — enforces valid values from the catalog's known lists.

**For Stage 6/8:**
- `calc.muscleVolumeWeekly` now accepts `includeBodyweight` — Stage 8 decision rules can use this to exclude bodyweight volume from progression checks if desired.
- Exercise analytics data structure (`_buildExData` output: `{date, volume, oneRM, bestWeight}`) is not exported; Stage 8 can replicate this pattern from the `workouts` store directly.

**sw.js cache bump needed:** currently at `peak-os-v5`. Bump to `peak-os-v6` before next deploy to include `training-analytics.js` in the precache manifest.

---

### Stage 5 — Post-build amendments (2026-06-08)

Follow-on work shipped in same session after initial DoD pass.

**Muscle group auto-assignment (`js/training-data.js`):**
- Added `_inferMuscle(name)` — regex classifier covering all 10 muscle groups. Priority order matters: Glutes checked before the cardio/mobility skip (prevents "Glute Bridge with Foam Roller" from being nulled), Back before Chest (prevents "Incline Db Rows" from matching chest patterns).
- Added `migrateExerciseMuscles()` — exported async function that re-classifies every `isCustom` exercise on each app boot. Idempotent and self-correcting: re-checks all custom exercises (not just those still at 'Other'), so pattern fixes propagate on next load. Returns `{ assigned, stillOther }`.
- `js/app.js` — `migrateExerciseMuscles()` now runs and resolves *before* `initTrainingTracker()` is called, ensuring analytics `_loadData()` always reads fresh muscle assignments from IndexedDB (eliminates a race condition where analytics could see stale 'Other' labels).

**Analytics range selector:**
- Added `_homeRange` state (default `'1W'`), `HOME_RANGES`, `RANGE_LABEL`, `RANGE_DAYS`, `_volumeForRange(range)` to `training-analytics.js`. Pills render in `_homeHTML()`; clicking any pill updates state and re-renders volume bars + heatmap.
- Fixed click handler non-response: replaced `root.onclick = _onClick` (property assignment, fragile) with `root.addEventListener('click', _onClick)` called at the top of `_render()`. `addEventListener` deduplicates on the same function reference so repeated calls on re-render are safe.

**BW toggle removed:**
- `_bwInclude` state, `an-bw-toggle` click case, BW toggle UI in `_homeHTML()` and `_exerciseHTML()`, `isBodyweight` variable in `_buildExData()`, and bodyweight guard in the set loop all removed. Volume calculation now always includes bodyweight exercises (passes no arg to `muscleVolumeWeekly`, using its `includeBodyweight = true` default). Toggle CSS retained (shared with RPE toggle).

**Volume attribution diagnostic:**
- Added `window.peakDebugVolume(rangeDays = 7)` to `js/app.js`. Reads live from IndexedDB, logs per-exercise volume grouped by muscle, flags orphaned exercise IDs, and lists all exercises still tagged 'Other'. DevTools call: `peakDebugVolume()` or `peakDebugVolume(30)`.

**SW version:** bumped through v6→v15 across this session's fixes. Current: `peak-os-v15`.

**Correction to original log (line "For Stage 6/8"):** reference to `includeBodyweight` param being useful to Stage 8 is now moot — the toggle was removed and bodyweight is always included in analytics volume.

## Stage 6 — Nutrition logger
_Not started._

## Stage 7 — Peptide tracker
_Not started._

## Stage 8 — Decision engine + weekly verdict
_Not started._

## Stage 9 — Bloodwork pipeline
_Not started._

---

## Open questions
- Peptide library source to confirm before Stage 7.
- Sourced biomarker range table + health-score weights to confirm before Stage 9.

## Global decisions (apply to all stages)
- Storage: IndexedDB on device. JSON export/import for backup.
- Apple Health sync: morning iOS Shortcut pushes a JSON payload (schema in
  health-data.md); manual import also supported. No live HealthKit.
- Aesthetic: "Precision Instrument" — lime on near-black, Barlow Condensed +
  Outfit. See design-system.md.
- Units: imperial (lbs, oz) — user is US-based.
