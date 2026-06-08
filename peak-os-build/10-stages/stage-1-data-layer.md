# Stage 1 — Data layer + calc engine

**Goal:** The spine. An IndexedDB layer for every store the app needs, plus the
deterministic 60% calc engine, fully unit-tested. No UI.

**Preconditions:** Stage 0 done.

**Load:** `20-reference/data-models.md`, `20-reference/formulas.md`

## Scope (build exactly this)
- IndexedDB wrapper: open/version/upgrade, CRUD per store, date-indexed queries.
  Create every store in data-models.md (settings, bodyEntries, healthEntries,
  exercises, templates, workouts, foods, meals, peptides, peptideDoses, vials,
  bloodPanels, verdicts).
- JSON export (whole DB -> file) and import (file -> DB) for backup/restore.
- The calc engine as pure functions, no DB or DOM coupling: every formula in
  formulas.md — body comp, rolling averages, deltas, rate of loss, projections,
  1RM/xRM, volume, plate, warm-up, reconstitution, half-life decay, adherence.
- Unit tests for the calc engine with known inputs/outputs. This is required:
  the engine is the thing everything trusts.

## 60 / 30 / 10 for this stage
100% the 60% (deterministic math) + storage plumbing. No rules, no AI, no UI.

## Out of scope
No screens. No health-data import flow (Stage 2). No targets logic (that's the
30%, lives with the features that use it).

## Definition of Done
- [ ] DB opens, upgrades cleanly, every store present.
- [ ] CRUD + date-range queries work; re-opening preserves data.
- [ ] Export produces a JSON file; import restores it exactly (round-trip test).
- [ ] Every formula implemented as a pure function.
- [ ] Unit tests pass for the calc engine (show the run output).
- [ ] No UI, no console errors when imported by the shell.

## Handoff
All later stages read/write through this layer and call the calc engine. They
never re-implement math or touch IndexedDB directly outside the wrapper.
