# Design System (L3) — "Precision Instrument"

These tokens sit on top of the frontend-design skill. The skill governs craft;
this file governs the specific look the human approved. Do not drift from it.

## Concept

High-end sports analytics meets a luxury pilot's watch. Technical, precise,
restrained. Black on black with one electric accent. Data is the hero; chrome
recedes. Every number feels like a readout on a performance instrument.

## Typography

- **Display / all data numbers:** Barlow Condensed, weight 700–800. Used for
  weigh-ins, calorie counts, set weights, countdown days, stat values.
- **Body / labels:** Outfit, weight 300–500. Used for everything that is words.
- Load from Google Fonts. Never Inter, Roboto, Arial, or system fonts.
- Section labels: 9px, weight 600, letter-spacing 2.5px, UPPERCASE, in the
  most-muted text color.

## Color tokens

```
--bg:     #07070A   /* near-black app background, faint dot texture */
--s0:     #0F0F12   /* screen base */
--s1:     #161619   /* card surface */
--s2:     #1D1D21   /* elevated surface (mini pills) */
--s3:     #252529   /* inset / empty bar track */
--b1:     #2A2A2E   /* hairline border, emphasis */
--b2:     #1E1E22   /* hairline border, default */
--lime:   #BDFF00   /* THE accent — active, positive, primary action */
--amber:  #F5A623   /* projection, lean mass, caution metrics */
--blue:   #4DAAFF   /* hydration, Apple Watch / Health data */
--red:    #FF5252   /* flags, warm-up tags, rest timer, lab red-flags */
--purple: #B06AFF   /* drop-set tag, tertiary accent */
--txt:    #EDEAE0   /* primary warm-white text */
--txt2:   #5A5A60   /* secondary muted text */
--txt3:   #2E2E33   /* tertiary / hint text */
```

Dominant near-black, lime as the sharp accent. Amber/blue/red/purple are
semantic, used sparingly and only with meaning (see color-by-meaning below).

## Color by meaning (do not decorate with color)

- **Lime** = active state, positive trend, on-track, the primary CTA. The
  accent. Bars that are doing well, the active tab dot, "Start workout".
- **Amber** = projection numbers, lean-mass line, "watch" metrics.
- **Blue** = anything from Apple Health / Apple Watch / Hume, plus hydration and
  fasting. Signals "imported physiological data".
- **Red** = warm-up set tag, rest timer, lab red-flag, off-track delta.
- **Purple** = drop-set tag. Tertiary only.
- **Gray (txt2/txt3)** = historical / inactive / net-carbs / secondary readouts.

## Components

- **Cards:** `--s1` background, 0.5px `--b2` border, radius 10–14px, padding
  ~13px. Fade-and-slide up on load with staggered `animation-delay`.
- **Bars:** 3px tall track in `--s3`; fill is the semantic color with a soft
  glow (`box-shadow: 0 0 6px <color>40`). Animate width on load.
- **Pills / tags:** tight, uppercase-ish, 8–9px, colored background at ~15%
  opacity with a matching 0.5px border and full-strength text.
- **Hero numbers:** Barlow Condensed 800, large (28–52px), tight line-height.
- **Tab bar:** icon + label; active tab is lime with a small lime dot beneath.
- **Rest timer:** lime, pulses with a gentle 2s opacity animation.
- Hairline borders everywhere. No heavy strokes, no drop shadows except the
  functional bar glow.

## Layout

- Phone-first, ~340px content width. Single column. Generous vertical rhythm
  between sections; controlled density inside cards (real data, not padding).
- Tabs: Home, Train, Nutrition, Body, Labs. (Peptides live on Home + a Body or
  dedicated sub-view per the peptide stage; do not add a 6th primary tab without
  asking.)
- Home screen is a "today view": morning weigh-in + trend, live macro bars with
  carb-cycle day type, primary action, projection, peptide checklist, micro
  watch. It answers "am I on track today and what do I do next?"

## Reference mockup

The approved visual reference is the v2 mockup the human signed off on
(electric-lime precision-instrument look). Match its density, hierarchy, and
restraint. When in doubt, fewer borders, more breathing room, bigger numbers.
