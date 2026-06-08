# Start Here

This folder is the build system for your Peak Performance Health OS — a single
installable web app that replaces Strong, MyFitnessPal, your peptide tracker,
and your daily ChatGPT check-in, with all your Apple Health / Hume data pulled
in and a weekly verdict that tells you whether to hold or adjust.

You don't build it by hand. You hand this folder to Claude Code and let it build
the app one stage at a time. The folder is the agent.

## What's inside
- `CLAUDE.md` — who the agent is and the 60/30/10 doctrine (read every session).
- `00-routing/BUILD-MAP.md` — the 10-stage plan and what to load per stage.
- `00-routing/BUILD-LOG.md` — the running memory; the agent updates it each stage.
- `10-stages/` — one contract per stage, with exact scope + Definition of Done.
- `20-reference/` — the stable spec: data models, formulas, decision rules,
  design system, and the Strong/MFP/peptide/bloodwork specs.

## Before you run anything
1. Install the frontend-design skill into `.claude/skills/` (see RUN-GUIDE).
2. Export your Strong history (Strong -> Profile -> Export Workout Data) — you'll
   import it in Stage 4.
3. Have your morning Apple Health Shortcut idea ready — you'll wire it in Stage 2.

## Then
Open `RUN-GUIDE.md` and follow the loop: one stage per Claude Code session, in
order, verify each Definition of Done, commit, move on.

Two stages need your input first: Stage 7 (peptide library source) and Stage 9
(biomarker ranges + score weights). The Build Map flags both.
