# Stage 2 — Apple Health import (Shortcut payload + manual)

**Goal:** Get body-composition and recovery data into the app via the morning
iOS Shortcut payload, with manual import as fallback. No dashboards yet.

**Preconditions:** Stage 1 done.

**Load:** `20-reference/health-data.md`, `20-reference/data-models.md`

## Scope (build exactly this)
- Receive the `peakos.health.v1` JSON payload (schema in health-data.md) from an
  iOS Shortcut. Pick the simplest reliable iOS-Safari-PWA mechanism (URL scheme
  / file / paste) and document the choice + the user's Shortcut setup steps in
  BUILD-LOG.
- Validate schema, upsert by date into bodyEntries + healthEntries (re-run same
  day overwrites, no dupes), tolerate missing fields, recompute lean/fat mass via
  the calc engine on import.
- Manual fallback: paste-JSON box (same schema) + single-field manual weigh-in /
  body-fat entry.
- A small sync confirmation ("synced 7:04 AM") surface.
- A short in-app guide page: how to set up the morning Shortcut to point at the
  app.

## 60 / 30 / 10 for this stage
60%: validation + upsert + recompute. 30%: none beyond dedupe rules. 10%: none.

## Out of scope
No charts/trends (Stage 3). No live HealthKit (impossible). No full export.xml
parsing in MVP (note if requested).

## Definition of Done
- [ ] A valid payload upserts correctly; re-running the same day does not dupe.
- [ ] Missing optional fields don't crash; present fields store.
- [ ] Lean/fat mass recomputed on import and stored.
- [ ] Manual paste + single-field entry both work.
- [ ] Shortcut setup guide present; mechanism documented in BUILD-LOG.

## Handoff
Stage 3 may assume bodyEntries + healthEntries are populated and current for the
day, and that the calc engine has trend data to chart.
