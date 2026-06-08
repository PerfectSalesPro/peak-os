# Stage 3 — Body composition dashboard

**Goal:** The Body tab. Turn the imported data into the trend dashboard from the
approved mockup.

**Preconditions:** Stage 1, 2 done.

**Load:** `20-reference/formulas.md`, `20-reference/design-system.md`

**Design skill:** read and apply before building screens.

## Scope (build exactly this)
- Four stat cards: weight, body fat %, lean mass, fat mass — each with this
  week's delta (computed).
- Three trend charts (range-selectable, default 8 weeks): weight, body fat %,
  lean mass. Use the lime/blue/amber line treatment from the design system.
- Hume Body Pod block: muscle mass, visceral fat, body water, bone mass, soft
  lean mass, waist-hip ratio — today's scan vs last, where present.
- Apple Watch block: avg HRV, resting HR, avg sleep, active calories — this week
  with deltas.
- Goal projection strip: projected goal weight + body fat % + weeks-away, from
  the projection formulas. Label the lean-mass-held assumption.

## 60 / 30 / 10 for this stage
60%: all the trend math + projections (already in the engine). 10/30%: none new.

## Out of scope
No decision verdict (Stage 8). No editing of health data here (Stage 2 owns in).

## Definition of Done
- [ ] All four stat cards show live computed values + correct deltas.
- [ ] Three charts render real stored data and respect the range selector.
- [ ] Hume + Apple Watch blocks populate from stored entries; gaps degrade
      gracefully.
- [ ] Projection strip matches the calc-engine output.
- [ ] Screen matches the design system; no console errors.

## Handoff
Stage 8 may read these computed body-comp trends for the weekly verdict.
