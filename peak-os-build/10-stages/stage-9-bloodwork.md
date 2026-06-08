# Stage 9 — Bloodwork pipeline (last)

**Goal:** The Labs tab. Upload/track quarterly panels, the 90-day countdown, the
sourced classifier, trends, and a labs signal into the decision engine.

**Preconditions:** Stages 1, 8 done. **Human input gate:** sourced biomarker
range table + (if not already) health-score weights.

**Load:** `20-reference/biomarker-ranges.md`, `20-reference/compliance.md`,
`20-reference/data-models.md`, `20-reference/design-system.md`

**Design skill:** read and apply before building screens.

## HUMAN INPUT GATE
At session start the human pastes the sourced biomarker range table (shape in
biomarker-ranges.md). Markers without a sourced band show the lab's own range
only and are logged as gaps. No invented bands.

## Scope (build exactly this)
- Upload a panel: manual entry + PDF kept on-device (parse selectable text if
  present; otherwise prompt manual entry). Each panel tied to a draw date.
- "Is this your most recent?" gate: yes -> mark most-recent + reset 90-day clock
  to the draw date; no -> file into history, clock untouched.
- 90-day countdown with escalation tiers (decision-rules.md): 30/14/0 days.
- Classifier (deterministic): optimal / watch / flag per sourced bands; red-flag
  always surfaces "discuss with your doctor" (compliance.md).
- Per-marker trend across all panels (quarter over quarter), arrows = computed
  deltas.
- Bloodwork read (10% AI): narrate what changed quarter over quarter from the
  computed values; disclaimer attached; free path copy-to-Claude.
- Feed a labs signal into the Stage 8 engine (rule R8 already exists for the
  countdown; add in-range fraction to the score if weights include it).

## 60 / 30 / 10 for this stage
60%: trends + deltas + countdown math. 30%: classifier + escalation + the
most-recent gate. 10%: the bloodwork read narrative only.

## Out of scope
Cloud PDF parsing (stays on device). Diagnosis of any kind (compliance.md).

## Definition of Done
- [ ] Upload past quarters; each trends across panels.
- [ ] "Is this most recent?" yes resets the 90-day clock; no does not.
- [ ] Countdown + escalation tiers correct.
- [ ] Classifier uses only the sourced table; gaps logged, no invented bands.
- [ ] Red-flag values surface the doctor prompt deterministically.
- [ ] Bloodwork read builds from computed values; disclaimer present.
- [ ] Labs signal reaches the decision engine.
- [ ] Matches design system; no console errors.

## Handoff
MVP complete. Ask the human before scaffolding later phases (native wrapper,
correlation engine, planner extras, in-app AI).
