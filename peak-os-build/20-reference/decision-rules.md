# Decision Rules (L3) — the 30% logic engine

These are the explicit if-this-then-that rules that turn computed numbers into
guidance. All deterministic. All testable. The AI never makes these calls — it
only narrates the result. Every rule fires off numbers the 60% computed.

The user's context: cutting phase, goal is lower body fat while holding lean
mass. Rules are tuned to that goal. If goalPhase changes, revisit.

## Carb-cycle day-type selection (runs daily)

```
if a workout exists for today's date (or today is in an active template's
   scheduleDays):
     activeTargets = settings.targets.trainingDay
else:
     activeTargets = settings.targets.restDay
manual override toggle can force either, or "refeed" if defined.
```
The active day type drives the home macro card and the nutrition tab targets.

## Weekly verdict rules (run on the Sunday scorecard)

Evaluate in order; collect all that fire. The narrative AI is handed the fired
rules + the scorecard.

| # | Condition (computed) | Verdict surfaced |
|---|---|---|
| R1 | weeklyDelta < 0 AND leanMass held or up | HOLD — protocol working, continue |
| R2 | weeklyDelta ~ 0 (|delta| < 0.2 lb) for 2 consecutive weeks AND BF% not moving | ADJUST — reduce rest-day carbs by 20g first |
| R3 | est1RM on a main lift down >5% over 2 weeks | FLAG — strength dropping; check protein + sleep before cutting further |
| R4 | rateOfLoss faster than 1% bodyweight/week | CAUTION — too fast; risk of muscle loss, consider easing the deficit |
| R5 | proteinHitRate < 5 of 7 days | FLAG — protein low; the #1 lever in a cut |
| R6 | BF% <= goalBodyFatPct | TRANSITION — goal reached; ready to move to maintenance? |
| R7 | HRV down trend AND high training volume week | RECOVERY — under-recovered; consider a deload |
| R8 | daysSinceLastDraw >= 90 | LABS — time to get bloodwork |

Priority for the headline status line: R6 > R4 > R3 > R2 > R7 > R5 > R1.
If only R1 fires: headline = "On track. Keep going."

## Bloodwork countdown escalation

```
daysOut = 90 - daysSinceLastDraw
30 >= daysOut > 14  -> gentle home reminder
14 >= daysOut > 0   -> prominent home reminder
daysOut <= 0        -> overdue banner
```

## "Is this your most recent bloodwork?" gate

```
on upload:
  ask "Is this your most recent bloodwork?"
  yes -> set isMostRecent on this panel (clear others), reset 90-day clock to drawDate
  no  -> file into history, do NOT touch the clock
```

## Injection-site rotation

```
suggest the body-zone least-recently used among the configured zones;
warn if a zone was used within its recovery window (configurable, default 7 days)
```

## PR detection (during a workout)

```
on a completed working set:
  est1RM = estimate(weight, reps)
  if est1RM > exercise.bestSet.estimated1RM -> mark set isPR, update bestSet
```

## Micronutrient / macro insight firing

```
proteinHitRate < 5/7        -> home note: "protein under target N of last 7 days"
sodium > threshold (day)    -> home micro-watch amber
fiber < 50% target (day)    -> home micro-watch dim
```

Thresholds that are clinical (e.g. sodium ceiling) come from a sourced reference,
not invented here.

## Red-flag lab escalation

Defined in biomarker-ranges.md + compliance.md. A value outside the critical
band always surfaces "discuss with your doctor" deterministically — never gated
behind an AI call.
