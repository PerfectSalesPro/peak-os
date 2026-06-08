# Stage 4 — Training tracker (live workout)

**Goal:** The Train tab core. Full Strong-PRO-parity templates + live workout
logging with the timing-critical rest-timer UX. This is the biggest single
stage; keep it tight to scope.

**Preconditions:** Stage 1 done.

**Load:** `20-reference/training-spec.md`, `20-reference/data-models.md`,
`20-reference/design-system.md`

**Design skill:** read and apply before building screens.

## Scope (build exactly this)
- Exercise library: a solid built-in starter catalog by muscle group + unlimited
  custom exercises.
- Templates: create/edit/duplicate, ordered exercises with planned sets,
  supersets (rest fires after the last in a group), scheduleDays, and
  "repeat past workout".
- Live workout: start from template or empty; per-set weight / reps / RPE /
  set-type tag (warmup|working|drop|failure); previous-session ghost values;
  check-off starts the per-exercise rest timer with completion notification;
  per-exercise custom rest; notes; session timer; live PR badge (rule fires from
  decision-rules via the engine's bestSet comparison).
- Plate calculator + warm-up calculator (engine already has the math).
- Strong CSV importer (columns in training-spec.md) for history migration.

## 60 / 30 / 10 for this stage
60%: volume, 1RM for PR detection, plate/warm-up math (engine). 30%: rest-timer
firing, PR detection, day-type tag write. 10%: none.

## Out of scope
Analytics charts + heat map (Stage 5). Nutrition coupling beyond writing the
day-type signal.

## Definition of Done
- [ ] Create a template, start it, log sets with type tags + RPE.
- [ ] Checking a set starts the correct per-exercise rest timer; it notifies on
      completion.
- [ ] Supersets rest correctly (after the group, not between).
- [ ] Previous-session values show as ghosts.
- [ ] A PR set flags live and updates the exercise bestSet.
- [ ] Plate + warm-up calculators return correct values.
- [ ] Strong CSV import maps a real export into workouts + exercises.
- [ ] Logging a workout sets today's carb-cycle day type to training day.
- [ ] Matches the design system; no console errors.

## Handoff
Stage 5 reads the workouts/exercises data for analytics. Stage 6/8 read the
day-type signal and volume.
