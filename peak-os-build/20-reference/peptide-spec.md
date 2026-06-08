# Peptide Spec (L3) — PeptiQ-class tracker

Models the best of PeptiQ (the tracker the user liked), built in Stage 7. This is
a tracking and information tool. It informs; it never instructs, prescribes, or
encourages dosing. All clinical numbers are sourced, never invented. See
compliance.md for the required language.

## HUMAN INPUT GATE
Before building Stage 7, the human confirms the peptide library source. The
build will not ship half-lives or dose ranges it cannot cite. Either the human
pastes a sourced table, or approves a sourced default set. Until then, the
library ships empty with a "add your sourced compound" flow.

## Dose logging
- Log: peptide, dose (mcg), injection site zone, vial used, datetime, notes.
- Multiple peptides per injection event (blended protocols).
- 10-zone body map for site selection with rotation suggestion (least-recently
  used; warn if a zone is inside its recovery window — rule in decision-rules).
- Smart reminders for scheduled doses; adherence tracking 7/30/90-day + streaks.

## Calculators (deterministic, 60%)
- Reconstitution: vial mg + BAC water mL -> concentration -> units to draw on a
  U-100 syringe (formula in formulas.md).
- Unit / dose converter (mcg/mg/IU).
- Clearance estimate: when a compound is ~undetectable given its half-life.
- Cost per mg / per dose.

## Half-life decay visualization (60% + chart)
- C(t) = dose x (1/2)^(t/halfLife). Plot levels rising/falling after each dose;
  overlay the dosing schedule so the user sees peak vs trough coverage.
- halfLifeHours per compound comes from the sourced library only.

## Peptide library (information, sourced)
Each entry: name, mechanism, half-life, typical dosing range (display-only),
cycle length, washout, storage, side effects, stacking notes, and citations[].
Show citations. Never present dose ranges as a recommendation — they are
reference information with the compliance disclaimer attached.

## Protocol builder
- Goal-tagged protocols (recovery, recomp, sleep, etc. — labels only).
- Schedule: AM/PM timing, on/off cycle days. scheduleDrives reminders.
- Inventory: vials with remaining units; flag when a vial will run out given the
  schedule, prompt reorder. No purchasing inside the app.

## Apple Health overlay
- Pull weight, sleep, HRV, resting HR (already imported via Stage 2) and overlay
  against protocol cycles so the user can eyeball on-cycle vs off-cycle changes.
  Correlation is shown, never claimed as causation.

## Compliance (mandatory on every peptide surface)
- Carry the disclaimer from compliance.md.
- No content that instructs how to obtain compounds or encourages use.
- Inform and track only. If a request crosses into medical advice, the AI
  consultant defers to a clinician.
