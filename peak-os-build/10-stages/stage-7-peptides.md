# Stage 7 — Peptide tracker (protocol + doses)

**Goal:** A PeptiQ-class tracking + information module. Tracks and informs;
never instructs or encourages. All clinical numbers sourced.

**Preconditions:** Stage 1 done. **Human input gate:** confirm peptide library
source before building (see below).

**Load:** `20-reference/peptide-spec.md`, `20-reference/compliance.md`,
`20-reference/design-system.md`

**Design skill:** read and apply before building screens.

## HUMAN INPUT GATE
At the start of this session the human confirms the library source. Paste a
sourced table or approve the sourced defaults. Until then the library ships empty
with an "add your sourced compound (with citation)" flow. Do not invent
half-lives or dose ranges.

## Scope (build exactly this)
- Dose logging: peptide, dose mcg, site zone, vial, datetime, notes; multiple
  peptides per event; 10-zone body map with rotation suggestion + recovery-window
  warning; reminders; adherence 7/30/90-day + streaks.
- Calculators (engine math): reconstitution (-> units to draw), unit/dose
  converter, clearance estimate, cost per mg/dose.
- Half-life decay chart: C(t)=dose*(1/2)^(t/halfLife) with schedule overlay.
- Library (sourced): mechanism, half-life, dose range (display-only), cycle,
  washout, storage, side effects, stacking, citations — citations shown.
- Protocol builder: goal-tagged, AM/PM schedule, on/off cycles, inventory with
  run-out flagging. No purchasing in-app.
- Apple Health overlay: weight/sleep/HRV/RHR vs cycle windows (correlation, not
  causation).
- Compliance language on every surface (compliance.md).

## 60 / 30 / 10 for this stage
60%: reconstitution, decay, adherence, cost (engine). 30%: site rotation,
run-out flagging, reminders. 10%: optional consultant Q&A (deferring to clinician
per compliance).

## Out of scope
Any acquisition guidance. Any dose recommendation framed as advice.

## Definition of Done
- [ ] Log a dose with site selection; rotation suggests a fresh zone.
- [ ] Reconstitution calculator returns correct units to draw.
- [ ] Half-life decay chart plots from sourced half-life values only.
- [ ] Adherence 7/30/90 + streak correct.
- [ ] Library entries show citations; no unsourced clinical numbers shipped.
- [ ] Compliance disclaimer present on every peptide surface.
- [ ] Matches design system; no console errors.

## Handoff
Stage 8 may reference adherence + cycle windows as context (not as a verdict
input unless the human adds a rule).
