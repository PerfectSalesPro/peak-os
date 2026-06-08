# Compliance & Safety Language (L3)

The app is a personal tracking and information tool. It does not diagnose,
prescribe, treat, or replace a clinician. This file holds the exact language and
the rules for where it must appear. Do not soften or remove these without the
human's explicit say-so (per CLAUDE.md).

## Standard disclaimer (interpretation surfaces)

> This app provides information and tracking, not medical advice. It does not
> diagnose, prescribe, or replace a licensed clinician. Discuss decisions about
> your health, training, nutrition, supplements, and lab results with a
> qualified professional.

Show on: weekly verdict, bloodwork read, health score, any AI consultant answer.

## Peptide surfaces (stricter)

> Peptide information shown here is for tracking and educational reference only.
> Dosing ranges are reference information, not recommendations. This app does not
> advise you to use any compound. Consult a licensed medical professional.

Show on: every peptide library entry, the protocol builder, dose logging, and
any peptide-related AI answer. The app must never instruct how to acquire
compounds or frame any dose as advised.

## Red-flag lab values (deterministic escalation)

- A marker outside its critical band always surfaces, deterministically, a
  "discuss with your doctor" prompt. Never gate this behind an AI call.
- Critical bands live in biomarker-ranges.md and come from cited sources. If a
  marker has no sourced band, show the lab's own reference range only and log a
  gap — do not invent a band.

## AI consultant guardrails

- The AI receives only numbers the 60% computed; it narrates, it does not
  calculate.
- If a user asks for a diagnosis, a prescription, or "should I take X dose," the
  AI declines the medical-advice part, gives general educational context if
  appropriate, and points to a clinician.
- The disclaimer is attached to every AI response surface.

## Data & privacy

- All data is on-device. Nothing is transmitted unless the user copies a summary
  out or sets their own API key. State this plainly in settings.
