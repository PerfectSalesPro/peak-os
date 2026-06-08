# Stage 8 — Decision engine + weekly verdict

**Goal:** The payoff. The Home "today view" status + the Sunday weekly verdict
that replaces the daily ChatGPT habit. Synthesizes every prior stage.

**Preconditions:** Stages 1–7 done. **Human input:** health-score weights (see
formulas.md) confirmed if the score is included this stage.

**Load:** `20-reference/decision-rules.md`, `20-reference/formulas.md`,
`20-reference/compliance.md`, `20-reference/design-system.md`

**Design skill:** read and apply before building screens.

## Scope (build exactly this)
- Home "today view": morning weigh-in + weekly trend, live macro bars with the
  active carb-cycle day type, primary action (start workout / log meal),
  projection strip, peptide checklist, micronutrient watch, and a one-line
  status from the priority-ranked decision rules.
- The decision engine: implement every rule in decision-rules.md as a tested
  deterministic function over the computed scorecard. Output: fired rules +
  headline status.
- Weekly scorecard (computed, Sunday): weight delta, lean-mass status, BF%
  direction, realized deficit vs target, training compliance + volume trend,
  protein hit rate, strength trend, days-to-goal.
- Weekly verdict (10% AI): build a clean prompt containing the computed scorecard
  + fired rules; free path = "Copy for Claude" -> paste answer back to save;
  API-key path automates. Save verdicts. Attach the disclaimer.
- Sunday 10 AM scheduled notification (client-side) to open the verdict.
- Optional health score if weights are confirmed; show every weight in the
  breakdown.

## 60 / 30 / 10 for this stage
60%: the scorecard math (engine). 30%: the full rule set + headline priority.
10%: the verdict narrative only — it never recomputes.

## Out of scope
Bloodwork inputs (Stage 9 adds the labs signal into the already-built engine).

## Definition of Done
- [ ] Home today-view renders live from real data with the correct day type.
- [ ] Every decision rule implemented + unit-tested with known scorecards.
- [ ] Headline status follows the documented priority order.
- [ ] Sunday scorecard computes correctly from the week's data.
- [ ] Verdict prompt builds with numbers pre-filled; copy-to-Claude round-trips;
      verdict saves. Disclaimer present.
- [ ] Sunday notification fires (document the PWA scheduling limitation).
- [ ] If score included: weights human-confirmed, shown in breakdown.
- [ ] Matches design system; no console errors.

## Handoff
Stage 9 feeds a labs signal into this engine and verdict.
