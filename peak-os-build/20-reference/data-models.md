# Data Models (L3) — IndexedDB stores

All data lives on-device in IndexedDB. One database, versioned. Each store below
is an object store. Stages add stores; once a store is built and a stage that
uses it is Done, do not change its shape without asking the human (per CLAUDE.md).

Every record has `id` (string, generated) and `createdAt`/`updatedAt` (ISO).

## settings  (single record, id: "user")
- goalPhase: "cut" | "maintain" | "bulk"
- goalBodyFatPct: number (target, e.g. 11)
- heightIn, sex, birthYear
- targets: { trainingDay: {kcal,protein,carbs,fat}, restDay: {...}, refeed?: {...} }
- waterTargetOz, fastingProtocol (e.g. "16:8")
- scoreWeights: { ... }  // set before Stage 8/9
- apiKey: optional string (for automated AI; default empty = copy-to-Claude)

## bodyEntries  (one per day)
- date (YYYY-MM-DD, indexed, unique)
- weightLbs, bodyFatPct
- leanMassLbs, fatMassLbs            // computed, stored for trend speed
- hume: { muscleMassLbs, visceralFatLevel, bodyWaterPct, boneMassLbs,
          softLeanMassLbs, waistHipRatio }
- source: "shortcut" | "manual" | "import"

## healthEntries  (one per day, from Apple Health)
- date (YYYY-MM-DD, indexed)
- hrvMs, restingHr, sleepHours, activeCalories, steps
- source: "shortcut" | "manual" | "import"

## exercises  (the library)
- name, primaryMuscle, secondaryMuscles[], equipment
- isCustom (bool)
- bestSet: { weight, reps, estimated1RM, date }   // updated on PR

## templates  (workout templates)
- name, focus (e.g. "Chest/Shoulders/Triceps")
- exercises[]: { exerciseId, plannedSets[]: { type, weight?, reps?, restSec } }
- supersetGroups[]: [exerciseId, exerciseId]
- scheduleDays[]: e.g. ["Mon","Thu"]   // drives carb-cycle day type

## workouts  (a completed/in-progress session)
- date, templateId?, name, durationSec, notes
- exercises[]: { exerciseId, sets[]: {
    type: "warmup"|"working"|"drop"|"failure",
    weight, reps, rpe?, restSec, completed (bool), isPR (bool) } }

## foods  (cached food database items)
- name, brand?, barcode?, servingSize, servingUnit
- per-serving: kcal, protein, carbs, fat, fiber, sugar, sodium, potassium, ...
- source: "openfoodfacts" | "custom" | "recipe"
- isFavorite (bool)

## meals  (logged food per day)
- date (indexed), slot: "breakfast"|"lunch"|"dinner"|"snacks"|custom
- loggedAt (timestamp)
- entries[]: { foodId, servings, computedMacros{...} }

## peptides  (the protocol library + user protocol)
- name, halfLifeHours (sourced), typicalDoseRange (sourced, display-only),
  mechanism, notes, citations[]
- See peptide-spec.md. Library values are sourced, never invented.

## peptideDoses  (logged injections)
- datetime, peptideId, doseMcg, siteZone, vialId?, notes

## vials  (inventory)
- peptideId, totalMg, bacWaterMl, concentration (computed), unitsRemaining
- reconstitutedAt

## bloodPanels  (one per draw)
- drawDate (indexed), isMostRecent (bool), labName?
- markers[]: { name, value, unit, optimalLow?, optimalHigh?, flag }
- sourcePdfName?   // file kept on device, not parsed to cloud

## verdicts  (weekly AI output, saved)
- weekOf (date), scorecard{...computed...}, narrative (string), createdAt

## Notes
- Computed fields (leanMass, estimated1RM, concentration) are stored for speed
  but always recomputed by the 60% engine — never trusted as ground truth on
  read if inputs changed.
- Dates are local-day strings to keep weigh-in/day-type logic correct.
