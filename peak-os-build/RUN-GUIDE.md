# Run Guide

How to build this app in Claude Code, one stage per session. You've used Claude
Code before, so this is lean.

The app is a free installable web app (PWA). No backend, no accounts, no paid
services. It runs in any browser, installs to your phone home screen, and keeps
all data on the device.

## The one rule

One stage per session. Fresh session each stage. That keeps the agent's context
clean and stops it drifting. Ten stages, ten sessions, in order.

---

## Setup (once)

1. Put this `peak-os-build` folder inside your project folder.
2. Install the frontend-design skill at the project root:
   `.claude/skills/frontend-design/SKILL.md`
   (or `~/.claude/skills/` to have it on every project).
3. Open the project in Claude Code (it auto-loads `CLAUDE.md`). Run `/skills` and
   confirm `frontend-design` appears. If not, fix the path and start fresh.
4. Export your Strong workout history to CSV for the Stage 4 import.

---

## The build loop (repeat per stage)

**A. Start the session.** Paste:

```
Read CLAUDE.md and 00-routing/BUILD-MAP.md. Open the lowest stage that is not
Done and read its contract in 10-stages/. Load only the reference files that
stage lists. If it builds any screen, read and apply the frontend-design skill
first. Build the stage to its Definition of Done and nothing outside its scope.
When done, update 00-routing/BUILD-LOG.md and tell me which DoD items pass.
```

**B. Verify before accepting.** Paste:

```
Go through this stage's Definition of Done one item at a time. For each, show the
evidence it passes: the file, the test output, or the running screen. If a screen
was built, confirm you applied the frontend-design skill and the design-system
tokens. Fix anything not met before we move on.
```

Then open the app yourself and confirm it works.

**C. Close the stage.** Paste:

```
Confirm BUILD-LOG.md is updated for this stage, then mark this stage Done in
BUILD-MAP.md.
```

Commit to git (one commit/branch per stage). Start a new session for the next.

---

## Get it on your phone (after Stage 0)

Free hosting on GitHub Pages:
1. Put the app files in a repo, enable Pages on the main branch.
2. Open the Pages URL on your phone, Share -> Add to Home Screen.
3. It launches full-screen and works offline. Re-deploy as you finish stages.

Back up with the app's JSON export now and then — your phone holds the only copy.

---

## Two stages need your input first

**Before Stage 2 (Apple Health):** decide your morning Shortcut. The agent picks
the import mechanism; you'll build the Shortcut to push the `peakos.health.v1`
payload each morning. The agent gives you setup steps.

**Before Stage 7 (Peptides):** confirm the library source. Paste a sourced table
or approve the sourced defaults:

```
Here is the sourced peptide reference table: [paste]. Store it as the library
config per 20-reference/peptide-spec.md, with citations shown. Any compound I
don't provide stays out of the library until I add it with a source.
```

**Before Stage 9 (Bloodwork):** paste your sourced biomarker ranges and your
score weights:

```
Here is the sourced biomarker range table: [paste]. Store it as the classifier
config per 20-reference/biomarker-ranges.md. Markers I don't provide show the
lab's own range only and get logged as a gap. Health-score weights: [paste] —
document each weight and reason in BUILD-LOG and show every weight in the score
breakdown.
```

---

## Using the AI parts (free)

The app computes every number itself. For the written reads (weekly verdict,
bloodwork read, meal-scan), it gives you a "Copy for Claude" button — paste into
Claude.ai, paste the answer back to save. Free, no API key. If you ever want it
automatic, there's an optional API-key field in settings.

---

## When something drifts

- Built a screen without the skill -> "Re-read the frontend-design skill and the
  design-system tokens, then rebuild this stage's screens to match."
- Building later-stage features -> "You're outside this stage's scope. Re-read
  the contract; roll back anything not in its Scope; finish only this DoD."
- Reaching for a backend or paid service -> "This app is free, no backend.
  IndexedDB on device, GitHub Pages/local hosting, AI by copy-to-Claude. Redo
  without any server or paid service."
- Invented a clinical number -> "That value has no source. Per CLAUDE.md, don't
  invent clinical thresholds. Use the sourced config or flag it as a gap."

---

## Notes
- Stages build on each other in order. Don't skip ahead.
- Stage 1 builds no screens (data + calc only), so it skips the design skill.
- After Stage 9 the MVP is done. The agent stops and asks before going further.
