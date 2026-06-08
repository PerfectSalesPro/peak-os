# Training Spec (L3) — full Strong PRO parity

The training module must match everything Strong's paid tier does, then connect
to the rest of the OS (which Strong cannot). Two stages build it: Stage 4 (live
tracker + templates + logging) and Stage 5 (analytics). This file serves both.

## Exercise library
- Built-in catalog organized by primary muscle group (ship a solid starter set;
  the user adds the rest). Each: name, primary muscle, secondary muscles,
  equipment.
- Custom exercises: unlimited, user-created.
- Per-exercise stored bestSet (weight, reps, estimated 1RM, date) for PRs.

## Templates (routines)
- Unlimited templates. Create / edit / duplicate.
- Each template: ordered exercises, each with planned sets.
- Supersets: group 2+ exercises; rest timer only fires after the last in the
  group, not between paired exercises.
- scheduleDays: which weekdays this template runs — this is what drives the
  carb-cycle day type on the nutrition side.
- "Repeat past workout": start a new session pre-filled from any history entry.

## Live workout logging (Stage 4 core — timing-critical UX)
- Start from a template or empty.
- Previous-session values shown as ghost text on each set (Strong's signature).
- Per set: weight, reps, RPE (1–10, optional), and a set-type tag:
  warmup | working | drop | failure.
- Check off a set -> the per-exercise rest timer starts automatically, counts
  down, and notifies when done so the user knows to start the next set.
- Per-exercise custom rest duration (not one global timer).
- Notes per workout and per exercise.
- PR detection live: a working set that beats the stored best flags a PR badge
  in-session (rule in decision-rules.md).
- Session timer (total elapsed).

## Calculators (Stage 4 tools)
- Plate calculator: target weight -> plates per side (formulas.md).
- Warm-up calculator: working weight -> warm-up ramp (formulas.md).

## Analytics (Stage 5)
- Volume chart per exercise (tonnage over time).
- Estimated 1RM progression chart per exercise.
- Best-set chart (heaviest working set per session).
- Weekly volume per muscle group + delta vs last week.
- Muscle heat map: weekly visualization of volume distribution across body.
- All charts filterable by time range; multi-year safe axis labels.
- xRM table (estimated max at various rep counts) per exercise.

## Migration — Strong CSV import (Stage 4 or 5)
Strong exports CSV with columns:
`Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps,
Distance, Seconds, Notes, Workout #`
Build a one-time importer that maps these into `workouts` + `exercises`, so the
user keeps full training history. Tell the user to export from
Strong -> Profile -> Export Workout Data before running it.

## Connection to the OS (what Strong can't do)
- Volume + strength trends feed the Stage 8 decision engine (R3, R7).
- Logging a workout sets today's carb-cycle day type to training day.
- Weekly muscle volume sits beside HRV/sleep so recovery rules can fire.
