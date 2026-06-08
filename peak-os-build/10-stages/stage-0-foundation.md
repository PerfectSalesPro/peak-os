# Stage 0 — Foundation (PWA shell)

**Goal:** A single installable web app that loads, installs to a phone home
screen, works offline, and shows an empty five-tab shell with the design system
in place.

**Preconditions:** None.

**Load:** `20-reference/design-system.md`

**Design skill:** read and apply the frontend-design skill before writing any
screen.

## Scope (build exactly this)
- One PWA. Plain HTML/CSS/JS, or a light setup that still runs from static files
  on GitHub Pages or locally. No backend, no required build server to run.
- Web app manifest + icons -> Add to Home Screen gives a full-screen launch.
- Service worker caching the app shell so it opens offline after first load.
- Tab navigation: Home, Train, Nutrition, Body, Labs. Empty placeholders.
- The design tokens from design-system.md in one CSS source of truth: the color
  variables, Barlow Condensed + Outfit via Google Fonts, the bar/card/pill
  primitives, the tab bar with the active lime dot. No scattered inline hex.

## 60 / 30 / 10 for this stage
All structural. No formulas, no rules, no AI.

## Out of scope
No data storage, no health data, no real screens. Later stages.

## Definition of Done
- [ ] Loads in desktop + phone browser with no console errors.
- [ ] Manifest + icons present; Add to Home Screen works on a phone.
- [ ] Service worker caches the shell; opens with no network after first load.
- [ ] Five placeholder tabs render with the lime active-dot tab bar.
- [ ] Fonts load (Barlow Condensed, Outfit); design tokens defined and used.
- [ ] The shell visually matches the "Precision Instrument" look (lime on
      near-black, hairline borders).

## Handoff
Stage 1 may assume a running, installable, offline-capable shell with design
tokens and a tab structure to mount screens into.
