# Apple Health Data In (L3) — Shortcut payload + manual import

A PWA cannot read Apple HealthKit directly. So data comes in two ways. The
primary path the user chose is a **morning iOS Shortcut** that pushes a JSON
payload; manual import is the fallback.

## The morning Shortcut path (primary)

The user sets up an iOS Shortcut once. It runs on a morning automation, reads the
chosen Health metrics, builds a JSON payload, and hands it to the app. The app
exposes a way to receive it (an import URL/endpoint the Shortcut opens, or a
clipboard/file the app reads on open). Build the app side to accept this exact
payload shape:

```json
{
  "schema": "peakos.health.v1",
  "date": "2026-06-03",
  "body": {
    "weightLbs": 168.0,
    "bodyFatPct": 16.2,
    "hume": {
      "muscleMassLbs": 126.4,
      "visceralFatLevel": 6,
      "bodyWaterPct": 58.4,
      "boneMassLbs": 7.8,
      "softLeanMassLbs": 133.6,
      "waistHipRatio": 0.84
    }
  },
  "health": {
    "hrvMs": 58,
    "restingHr": 54,
    "sleepHours": 7.4,
    "activeCalories": 612,
    "steps": 8400
  }
}
```

Rules:
- Validate `schema`. Ignore unknown fields; never crash on missing ones.
- Upsert by `date` into `bodyEntries` and `healthEntries`. Re-running the same
  day overwrites, does not duplicate.
- Mark `source: "shortcut"`.
- Hume fields may be absent on days without a scale scan — store what's present.
- Recompute lean/fat mass via the 60% engine on import.
- Show a small "synced 7:04 AM" confirmation; the Sunday verdict assumes the
  week's data is already in.

The build provides a short in-app guide telling the user how to point their
Shortcut at the app (the exact mechanism — URL scheme vs file — is an
implementation choice for Stage 2; pick the simplest reliable one for iOS Safari
PWAs and document it in BUILD-LOG).

## Manual import (fallback)

- Paste-JSON box that accepts the same payload shape.
- Manual single-field entry for weigh-in / body fat when the user has no scale
  sync that day.
- Full Apple Health export (.zip / export.xml) import is a *later* enhancement,
  not MVP — note it and move on if scoped in.

## What this stage does NOT do

- No charts or dashboards (that's Stage 3).
- No live background sync, no HealthKit API (impossible in a PWA).
- No network calls — the payload arrives locally.
