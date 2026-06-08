# Stage 5 — Training analytics (1RM, volume, PRs, heat map)

**Goal:** The analytics layer on top of the tracker — everything Strong PRO
charts, plus the muscle heat map.

**Preconditions:** Stage 1, 4 done.

**Load:** `20-reference/training-spec.md`, `20-reference/formulas.md`,
`20-reference/design-system.md`

**Design skill:** read and apply before building screens.

## Scope (build exactly this)
- Per-exercise charts (range-filterable): volume over time, estimated 1RM
  progression, best-set over time.
- Weekly volume per muscle group + delta vs last week.
- Muscle heat map: weekly volume distribution across the body.
- xRM table per exercise (estimated max at various rep counts).
- All charts multi-year-safe on the axis.

## 60 / 30 / 10 for this stage
60%: all chart math (engine). 30%: none new. 10%: none.

## Out of scope
The live logging UX (Stage 4). Cross-stream recovery rules (Stage 8 consumes
this).

## Definition of Done
- [ ] Volume, 1RM, and best-set charts render real history per exercise.
- [ ] Weekly muscle-group volume + delta correct against the engine.
- [ ] Heat map reflects the week's logged volume.
- [ ] xRM table matches engine output.
- [ ] Range filters work; matches design system; no console errors.

## Handoff
Stage 8 reads weekly volume + 1RM trends for verdict rules R3 and R7.
