# Stage 6 — Nutrition logger (food + barcode + carb cycle)

**Goal:** The Nutrition tab. Full MyFitnessPal-Premium+-parity logging plus the
carb-cycle auto-switch MFP can't do.

**Preconditions:** Stage 1 done.

**Load:** `20-reference/nutrition-spec.md`, `20-reference/data-models.md`,
`20-reference/design-system.md`

**Design skill:** read and apply before building screens.

## Scope (build exactly this)
- Four logging methods: barcode scan (camera -> Open Food Facts, free, no key),
  text search, voice log (Web Speech API), meal-scan photo (10% AI; free path =
  copy-to-Claude, API-key path automates). AI estimates, the engine sums.
- Food items: Open Food Facts lookup + local cache + custom foods + recipes +
  favorites.
- Diary: Breakfast/Lunch/Dinner/Snacks (+ custom), per-meal subtotals, per-item
  servings + macro/micro contribution, timestamps, quick-add macros, copy-day.
- Macros + micros: gram targets, net carbs, sodium/fiber/sugar/potassium (extend
  as data allows), exercise-calorie handling setting.
- Carb cycling: per-day-type targets; active target auto-selected by the
  day-type rule (training if a workout is logged/scheduled, else rest; manual
  override). Day-type badge always visible. Weekly view splits training vs rest
  days.
- Water tracker + intermittent-fasting timer.

If the meal planner (7-day plans, grocery list, prep mode) makes this stage too
big, ship logging + carb cycling first and split the planner to Stage 6b — note
it in BUILD-LOG and ask the human.

## 60 / 30 / 10 for this stage
60%: macro/micro sums, net carbs, weekly splits (engine). 30%: day-type
selection, macro insight firing. 10%: meal-scan photo estimate only.

## Out of scope
The weekly verdict (Stage 8). Bloodwork-driven nutrition tweaks (later).

## Definition of Done
- [ ] Barcode scan returns a real Open Food Facts item and logs it.
- [ ] Search, voice, and photo (at least the copy-to-Claude path) all log food.
- [ ] Diary subtotals + daily totals + net carbs + the four micros are correct.
- [ ] Day type auto-switches the active targets; badge shows it; override works.
- [ ] Weekly view splits training vs rest days.
- [ ] Water + fasting timers work; matches design system; no console errors.

## Handoff
Stage 8 reads protein hit rate, realized deficit, and the training/rest split
for verdict rules R1, R2, R5.
