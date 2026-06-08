# Architecture — the 60 / 30 / 10 feature map (L3)

Every feature is sorted into one layer before code is written. This table is the
source of truth for which layer each feature lives in. If a feature is not here,
sort it first, then build.

## 60% — Deterministic code (pure JS, no model, fully testable)

| Feature | What it computes |
|---|---|
| Macro totals | Sum protein/carb/fat/calories per meal and per day |
| Net carbs | Total carbs minus fiber |
| Rolling weight average | 7-day trailing mean weigh-in |
| Weight delta | This week's avg vs last week's avg |
| Lean / fat mass split | From body weight + body fat % |
| Rate of loss | Rolling 4-week lbs/week |
| Weight projection | Forward weight at 2/4/8 wks at current rate |
| Body-fat projection | Projected BF% at target weight, lean mass held |
| 1RM estimate | Brzycki (<=10 reps), Epley (>10 reps); RPE-adjusted optional |
| xRM estimate | Estimated max for any rep count |
| Training volume | sets x reps x weight, per exercise/session/muscle/week |
| Volume delta | This week vs last week per muscle group |
| Plate calculator | Plate combination for a target barbell weight |
| Warm-up calculator | Warm-up set progression from a working weight |
| Peptide half-life decay | Concentration-over-time curve from dose + half-life |
| Reconstitution math | vial mg + BAC water mL -> concentration -> units to draw |
| Adherence % | Doses taken / scheduled over 7/30/90 days |
| Hydration / fasting timers | Elapsed time math |
| 90-day countdown | Days since last bloodwork draw |
| Health score | Weighted formula across inputs (weights in formulas.md) |

## 30% — Rules-based logic (explicit thresholds, deterministic, testable)

| Feature | The rule |
|---|---|
| Carb-cycle day type | Workout logged today -> training-day targets; else rest-day |
| Decision rules | See decision-rules.md (hold / adjust verdicts) |
| Rest-timer firing | Set checked off -> start per-exercise rest countdown |
| PR detection | New set beats stored best for that exercise -> flag PR |
| Red-flag lab escalation | Value outside critical band -> "discuss with doctor" |
| Bloodwork countdown escalation | 30/14/0 days out -> reminder tiers |
| "Is this most recent?" gate | Upload + yes -> reset 90-day clock; no -> file in history |
| Injection-site rotation | Suggest least-recently-used site zone |
| Macro insight firing | Protein under target N days -> surface note |
| Micronutrient watch | Value under/over threshold -> surface on home |

## 10% — Genuine AI (narrative only; never arithmetic)

| Feature | What the model does | Free path |
|---|---|---|
| Weekly verdict paragraph | Interpret the computed scorecard into 2-4 sentences | Copy-to-Claude prompt, paste back |
| Bloodwork read | Narrate what changed quarter over quarter | Copy-to-Claude |
| Meal-scan estimate | Identify foods in a photo, estimate portions | Copy-to-Claude (or API key) |
| Consultant Q&A | Answer "is my plan right?" given computed context | Copy-to-Claude |

Rule: the AI always receives numbers the 60% already computed. It never adds,
averages, or projects. If a prompt would ask the model to do math, the math
belongs in the 60% and the result gets passed in.
