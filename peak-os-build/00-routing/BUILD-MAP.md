# Build Map (L1 — Routing)

This is the only file that knows the whole plan. The agent reads it to pick the
active stage, then works inside that one stage. Update the **Status** column as
you go.

## Routing rule

> Open the lowest-numbered stage that is not `Done`. Read its contract. Load
> only the reference files it lists under **Load**. Do not read other stages or
> other reference files.

---

## MVP stages — build in order, one per session

| #  | Stage | Status | Depends on | Load (reference) |
|----|-------|--------|-----------|------------------|
| 0 | Foundation (PWA shell) | Done | — | design-system + design skill |
| 1 | Data layer + calc engine | Done | 0 | data-models, formulas |
| 2 | Apple Health import (Shortcut payload + manual) | Done | 1 | health-data, data-models |
| 3 | Body composition dashboard | Done | 1,2 | formulas, design-system + design skill |
| 4 | Training tracker (live workout) | Done | 1 | training-spec, data-models, design-system + design skill |
| 5 | Training analytics (1RM, volume, PRs) | Done | 1,4 | training-spec, formulas, design-system + design skill |
| 6 | Nutrition logger (food + barcode + carb cycle) | Todo | 1 | nutrition-spec, data-models, design-system + design skill |
| 7 | Peptide tracker (protocol + doses) | Todo | 1 | peptide-spec, compliance, design-system + design skill |
| 8 | Decision engine + weekly verdict | Todo | 1–7 | decision-rules, formulas, compliance, design-system + design skill |
| 9 | Bloodwork pipeline (last) | Todo | 1,8 | biomarker-ranges, compliance, data-models, design-system + design skill |

Each stage is a self-contained contract in `10-stages/`. A stage is `Done` only
when its Definition of Done checklist passes.

"Design skill" means the UI/UX design skills (ui-ux-pro-max, design, ui-styling, design-system). It is installed in the repo and
auto-loads. Read and apply it before any screen. Stage 1 (data + calc) needs no
UI and skips it.

## Human input needed before two stages

- **Before Stage 7 (Peptides):** confirm the peptide library source. The build
  will not invent half-lives or dosing ranges. Paste a cited table or approve
  the sourced defaults in `peptide-spec.md`.
- **Before Stage 9 (Bloodwork):** paste the sourced biomarker "optimal" range
  table, and decide the health-score weights for the decision engine. Defaults
  with citations are in `biomarker-ranges.md` and `formulas.md`.

## Order rationale

Daily-use modules (training, nutrition, peptides) come before bloodwork because
the user trains and eats every day but draws blood quarterly (last draw May 2,
2026). The decision engine (Stage 8) is the payoff — it needs the daily modules
in place to synthesize. Bloodwork (Stage 9) is last by the user's explicit
request and feeds one extra signal into the already-built engine.

## Later (do not start until MVP is Done)

- Native iOS wrapper for true background HealthKit sync.
- Progress-photo AI comparison, full correlation engine across all streams,
  doctor-discussion export, in-app AI via the user's own API key, theming.

When the MVP is Done, ask the human before scaffolding later stages.

## Context budget note

If a stage ever needs you to load more than the files it lists, the stage is
scoped wrong. Stop and tell the human instead of pulling in the whole spec.
