# Formulas (L3) — the 60% math, with sources

Every formula the app uses, stated precisely so the deterministic engine is
testable. Where a formula uses a constant or "optimal" value, the source is
named. Unsourced numbers are flagged, never invented.

## Body composition

- **Lean mass** = weight x (1 - bodyFatPct/100)
- **Fat mass** = weight x (bodyFatPct/100)
- **7-day rolling weight** = mean of weigh-ins in trailing 7 days (ignore gaps)
- **Weekly delta** = thisWeekRollingAvg - lastWeekRollingAvg
- **Rate of loss** = slope of rolling avg over trailing 4 weeks, in lbs/week

## Projections

- **Projected weight (t weeks)** = currentRollingAvg + rateOfLoss x t
- **Projected body fat % at target weight** (lean mass held constant):
  BF% = (currentFatMass - (currentWeight - targetWeight)) / targetWeight x 100
  (assumes weight lost is fat while lean mass holds — the cut assumption; label
  it as such in the UI)
- **Weeks to goal** = (currentRollingAvg - goalWeight) / |rateOfLoss|

## Strength (1RM estimation)

Two standard formulas, switch on rep count:
- **Brzycki (reps <= 10):** 1RM = weight x 36 / (37 - reps)
- **Epley (reps > 10):** 1RM = weight x (1 + reps/30)
Sources: Brzycki (1993); Epley (1985). Both are long-standing published
estimators. Show the user which formula was used.
- **xRM (target reps n):** invert Epley: weight_n = 1RM / (1 + n/30)
- **RPE-adjusted option:** treat RPE as reps-in-reserve (RIR = 10 - RPE), add RIR
  to reps before estimating. Optional toggle; off by default.

## Training volume

- **Set volume** = weight x reps (working sets; warm-ups excluded by default,
  toggle to include)
- **Session volume** = sum of set volumes
- **Muscle volume (weekly)** = sum of session volumes attributed to a muscle
- **Volume delta** = thisWeekMuscleVolume - lastWeekMuscleVolume

## Plate & warm-up

- **Plate calc:** given target barbell weight and bar weight (45 lb default),
  perSide = (target - bar)/2; greedy-fill from available plate denominations.
- **Warm-up calc:** generate ramp sets as % of working weight, e.g.
  [40%, 60%, 80%] for given rep targets; configurable.

## Peptides

- **Reconstitution concentration** = (vial mg x 1000 mcg/mg) / (BAC water mL)
  -> mcg per mL. Units to draw (U-100 syringe) = doseMcg / (concentration/100).
- **Half-life decay:** C(t) = dose x (1/2)^(t / halfLifeHours). Plot over time.
  halfLifeHours comes from peptide-spec.md (sourced) — never invented.
- **Adherence %** = dosesTaken / dosesScheduled over the window.

## Health score (weighted) — WEIGHTS NEED HUMAN INPUT

Composite 0–100 score. Component sub-scores are deterministic; the **weights are
not set until the human provides them before Stage 8/9.** Do not invent weights.
Proposed components (weights TBD by human):
- Nutrition adherence (protein hit rate, deficit-on-target)
- Training consistency (sessions vs planned, volume trend)
- Recovery (HRV trend, sleep vs target, resting HR)
- Body-comp trajectory (on pace for goal, lean mass held)
- Labs (in-range marker fraction; only after Stage 9)

Document every weight and its reason in BUILD-LOG when the human supplies them,
and show every weight to the user in the score breakdown (per the run guide).

## Macro targets / carb cycle

Targets are user-set per day type (training/rest/refeed) in settings. The engine
does not compute targets; it compares logged intake against the active day
type's target (see decision-rules.md for which target is active).
