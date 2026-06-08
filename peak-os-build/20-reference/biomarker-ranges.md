# Biomarker Ranges (L3) — sourced, human-confirmed before Stage 9

This file holds the "optimal" and "critical" bands the bloodwork classifier
reads. Per CLAUDE.md, these are never invented. They are confirmed by the human
before Stage 9 from a clinician or a cited, reviewed source.

## HUMAN INPUT GATE (before Stage 9)

At the start of the Stage 9 session, the human pastes a sourced biomarker range
table. Store it as the config the classifier reads. Any biomarker not in the
table shows the lab's own standard reference range only and is logged as a gap
in BUILD-LOG. Do not fill gaps with invented numbers.

Expected table shape (per marker):

```
name, unit, optimalLow, optimalHigh, criticalLow, criticalHigh, source
```

Example row format (values to come from the human's sourced table):
```
Testosterone (total), ng/dL, <low>, <high>, <crit-low>, <crit-high>, <citation>
```

## Classifier behavior (deterministic — the 30%)

For each marker on a panel:
- value within [optimalLow, optimalHigh]  -> "optimal" (lime)
- value within reference but outside optimal -> "watch" (amber)
- value outside [criticalLow, criticalHigh] -> "flag" + mandatory
  "discuss with your doctor" (red), per compliance.md
- marker with no sourced band -> show lab's own range only, log a gap

## Trend
- Each marker is trended across all uploaded panels (quarter over quarter).
- Direction arrows are computed deltas, not judgments.

## Markers the user tracks (from their panels — ranges TBD from sourced table)
Testosterone (total + free), Estradiol (E2), IGF-1, LDL, HDL, total cholesterol,
triglycerides, HbA1c, fasting glucose, hsCRP, ALT, AST, vitamin D, TSH, CBC
components, and others as the user's lab reports include. The exact set follows
the user's actual panels; ranges follow the sourced table only.
