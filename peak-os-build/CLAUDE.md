# Peak Performance Health OS — Build Identity (L0)

You are building a personal health operating system as a single installable web
app (PWA). It runs in a phone browser, installs to the home screen, works
offline, and keeps all data on the device. One user. No accounts. No backend.
Free to run.

This app replaces four paid apps and a daily ChatGPT habit with one tool:

- **Strong** (PRO tier) — full workout tracker
- **MyFitnessPal** (Premium+ tier) — full nutrition logger
- **A peptide tracker** (PeptiQ-class) — protocol + dose logging
- **Apple Health / Hume Body** — body composition and recovery data, pulled in
- **The daily "am I on track?" question** — answered automatically by a weekly
  decision engine instead of manual screenshots into ChatGPT

The user is in a cutting phase with a body-recomposition goal (lower body fat
while holding lean mass). The app's whole reason to exist is to ingest every
data stream, compute the trends itself, apply the user's own rules, and tell him
whether to hold or adjust — fast, in one place.

You read this file at the start of every session. It does not change unless the
human tells you to change it.

---

## The doctrine: 60 / 30 / 10

Every feature gets sorted into one of three layers before you write code for it.
This is the core of the build and the core of why the app is safe and reliable.

- **60% deterministic code.** Pure JavaScript functions. All math: macro sums,
  rolling averages, weight/lean-mass trends, 1RM estimates, training volume,
  rate-of-loss projections, body-fat projection, score formulas, half-life decay
  curves, reconstitution math. No model call at runtime. Testable, fast, free,
  auditable. This is the spine.
- **30% rules-based logic.** Explicit thresholds and conditions that decide
  *when* the app surfaces something and *what guardrails bound it*: carb-cycling
  day-type selection, the decision rules ("weight stalled 2 wks -> drop rest-day
  carbs 20g"), red-flag lab escalation, the 90-day bloodwork countdown,
  injection-site rotation suggestions, rest-timer firing. Still deterministic.
  Still testable.
- **10% genuine AI.** Only for narrative: the weekly verdict paragraph, the
  bloodwork read, the meal-scan photo estimate, the consultant Q&A. The free
  default: the app builds a clean prompt with every number already computed by
  the 60%, and the user pastes it into Claude.ai (or it uses the user's own API
  key if set). The model interprets values the 60% computed. **It never does
  arithmetic on health data.**

If you find yourself about to send raw numbers to a model and ask it to
calculate, stop. That number belongs in the 60%.

`20-reference/architecture-60-30-10.md` holds the full feature-to-layer table.

---

## Non-negotiables

- No backend, no accounts, no cloud database. Data lives on the device in
  IndexedDB, with JSON export and import for backup.
- The app does not diagnose, prescribe, or replace a clinician. Every
  interpretation surface carries the disclaimer language in
  `20-reference/compliance.md`. This applies to peptide content especially:
  inform, never instruct or encourage dosing.
- Red-flag lab values escalate through deterministic rules, never through an AI
  call alone.
- Data stays on the device. Nothing leaves it unless the user chooses to copy a
  summary into Claude or sets their own API key.
- Trends beat single-day numbers everywhere. A single weigh-in is noise; the
  7-day rolling average is the signal.
- Numeric clinical thresholds (lab "optimal" bands, score weights, peptide
  half-lives) are never invented. They come from a cited, reviewed source and
  live in the reference files. Flag any threshold you cannot source.
- Apple Health data arrives through an import payload (a morning iOS Shortcut
  pushes it, or the user imports it manually). The app never assumes live
  HealthKit access — a PWA cannot read HealthKit directly.

---

## How this repo works

```
CLAUDE.md                 <- you are here (L0 identity)
00-routing/
  BUILD-MAP.md            <- L1: which stage to open, what to load
  BUILD-LOG.md            <- L4: running state, decisions, open questions
10-stages/                <- L2: one self-contained contract per stage
20-reference/             <- L3: stable spec you read, never rewrite mid-build
```

## Session ritual

1. Read this file.
2. Open `00-routing/BUILD-MAP.md`. Find the active stage (lowest not `Done`).
3. Open that stage contract in `10-stages/`. It tells you the exact scope and
   the *only* reference files to load. Load nothing else.
4. If the stage builds any screen, read and apply the UI/UX design skills (ui-ux-pro-max, design, ui-styling, design-system)
   before building it.
5. Build to the Definition of Done. Stay inside scope.
6. Update `00-routing/BUILD-LOG.md`: what you finished, what you decided, what
   the next stage should know.

This is how context stays clean. You never hold the whole spec at once.

## Design skill (use on every screen)

The UI/UX design skills (ui-ux-pro-max, design, ui-styling, design-system) are installed for this build. Before you write any
screen, read it and apply it. The project tokens in
`20-reference/design-system.md` are the constraints that sit on top of it: the
"Precision Instrument" aesthetic — electric lime accent on near-black, Barlow
Condensed for data numbers, Outfit for body, hairline borders, glowing bars.

Order on any UI work: read the skill, read `design-system.md`, then build. If
the skill is not loaded, stop and tell the human to install it.

## Stop and ask the human when

- A stage needs a change to an IndexedDB store an earlier locked stage built.
- You want to alter any disclaimer, red-flag threshold, or peptide-safety text.
- A clinical threshold, score weight, or peptide half-life has no cited source.
- Scope for the current stage is ambiguous or the Definition of Done can't be
  met as written.
- A stage would require live Apple HealthKit access (not possible in a PWA).

## Quality bar

Premium means Whoop / MacroFactor / Levels / Strong, translated to the web, then
made smarter because everything lives in one place. Clean type, real data
density, fast, works offline once loaded. Build like it is the only health app
the user opens — because that is the explicit goal.
