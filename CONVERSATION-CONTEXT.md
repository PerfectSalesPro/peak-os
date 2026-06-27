# Conversation Context — Peak OS

## About the user
- Name: Dustin
- Current weight: ~169 lbs, body fat ~12-16% (cut phase, goal is 10% BF)
- Goal weight: ~165 lbs at ~10% body fat (six pack goal)
- Training schedule: 3 days per week. Tuesday = Legs (Quads/Hamstrings/Glutes/Core), Thursday = Upper Body B (Shoulders/Back/Arms), Saturday = Upper Body A (Chest/Biceps/Triceps/Shoulders). Rest days: Mon, Wed, Fri, Sun.
- Carb cycling: Tue/Thu/Sat are training days with higher calorie and carb targets. All other days are rest days with lower targets.
- Equipment: Hume Body Pod scale (syncs to Apple Health), Apple Watch (not Whoop), iPhone
- Apps being replaced: Strong PRO, MyFitnessPal Premium+, peptide tracker (PeptiQ-class)
- Strong CSV imported: ~/Downloads/strong_workouts 3.csv — 425 workouts, 11,375 sets (893 rest timer rows correctly skipped)
- PR hit June 6: Incline DB Chest Press 85 lbs x 7 reps

## Key technical decisions made
- PWA only (no backend, no accounts, no Supabase)
- Data storage: IndexedDB on device, JSON export/import for backup
- Apple Health sync: iOS Shortcut pushes peakos.health.v1 JSON payload via URL ?import= parameter (zero-touch, runs at 8:15 AM daily)
- Hosting: GitHub Pages — LIVE at perfectsalespro.github.io/peak-os/
- No BW toggle on analytics (removed — not useful for this user)
- Design: "Precision Instrument" aesthetic — electric lime #BDFF00 on near-black, Barlow Condensed 800 for numbers, Outfit for body text
- Units: Imperial (lbs, oz)
- Sunday 10 AM weekly verdict notification

## Strong CSV parser decisions
- Skip rows where Weight=0, Reps=0, Distance=0, Seconds=0 (rest timer artifacts — 893 skipped)
- Skip rows where Seconds>0 AND Weight=0 AND Reps=0 AND Distance=0 (rest timer with duration)
- weighted: Weight>0 AND Reps>0
- reps_only: Weight=0 AND Reps>0
- cardio: Distance>0 OR (Seconds>0 AND Weight=0 AND Reps=0)
- duration: Seconds>0 AND Weight>0
- CSV columns: Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE
- Notes column = per-exercise notes, Workout Notes = session notes
- bestSet updates only run for weighted sets

## Exercise muscle attribution
- 423 exercises assigned muscle groups, 25 remain as Other (all legitimate: mobility/cardio)
- Self-correcting migration runs on every boot
- Back volume is genuinely low (only chin-ups in recent sessions) — accurate, not a bug
- Race condition fixed: migrateExerciseMuscles() completes before initTrainingTracker() starts

## Build status
- Stage 0: Done (PWA shell, lime design, 5 tabs)
- Stage 1: Done (IndexedDB, calc engine, 65/65 unit tests pass)
- Stage 2: Done (Apple Health import, Shortcut URL ?import= mechanism, manual entry, JSON paste)
- Stage 3: Done (Body composition dashboard, charts, Hume metrics, Apple Watch stats, projection strip)
- Stage 4: Done (Training tracker, templates, live workout, rest timer, PR detection, plate/warmup calc, Strong CSV import)
- Stage 5: Done (Analytics, 1RM charts, volume trends, muscle heat map, consistency calendar, exercise browser, range selector 1W/1M/3M/6M/1Y/All)
- History deletion: Done (swipe-left-to-delete on history cards + trash button in session detail view, both with confirm bottom sheet; workout ids are string UUIDs — never coerce to number)
- Stage 6: Done (Nutrition logger: food diary, 7 logging methods, barcode via Open Food Facts, carb cycling, water, fasting 16:8). 81/81 calc tests pass. DB_VERSION 1→2 (added nutritionDays + fastingSessions stores). SW at peak-os-v17.
- Stage 6b: Deferred (Meal planner — ask human before starting)
- Stage 7: Todo — NEXT (Peptide tracker; confirm peptide library source first)
- Stage 8: Todo (Decision engine + weekly verdict)
- Stage 9: Todo (Bloodwork pipeline — last, blood drawn quarterly, last draw May 2 2026)

## Live workout UI — known gap
- Needs density upgrade to match Strong: set numbers visible, previous weight x reps as visible label, volume total per exercise, green row highlight on completion, per-exercise notes field, tighter rows
- Prompt to use when ready: "The live workout screen needs to more closely match the Strong app UI. Make these changes: 1) Show set numbers (1,2,3..) on left of each row. 2) Show previous session weight x reps as a visible label on each row. 3) Show running volume total per exercise. 4) Make completed set rows visually distinct with green highlight. 5) Add per-exercise notes field. 6) Make set rows more compact. Keep design tokens."

## GitHub Pages — LIVE
- Repo: github.com/PerfectSalesPro/peak-os
- Live URL: perfectsalespro.github.io/peak-os/
- PWA installed on iPhone
- Workflow: after changes, bump SW cache version, commit, push
- iPhone needs full close + reopen twice to pick up new service worker
- App code syncs via GitHub; DATA does not — IndexedDB is per-device, moved via the Export/Import card on Home

## Peptide protocol (for Stage 7)
- BPC-157: 250mcg SubQ, lower abdomen, AM
- TB-500: 500mcg SubQ, lower abdomen, AM
- Injection site rotation: alternating left/right lower abdomen
- Library source needs confirmation before Stage 7 builds

## Nutrition targets (for Stage 6)
- Training days (Tue/Thu/Sat): higher calories + carbs
- Rest days (Mon/Wed/Fri/Sun): lower calories + carbs
- Barcode scanner: Open Food Facts API (free, no key needed)
- Voice log: Web Speech API
- Meal scan: Claude AI photo estimate (copy-to-Claude free path)
- Fasting: 16:8 protocol

## Files to know
- ~/Desktop/peak-os/ — project root
- ~/Desktop/peak-os/peak-os-build/ — ICM build system
- ~/Downloads/strong_workouts 3.csv — Strong export (keep, may need for re-import)
- Server runs on port 8080 (or 3000 if 8080 occupied)
- Hard refresh: Cmd+Shift+R
