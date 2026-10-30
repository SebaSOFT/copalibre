---
name: CopaLibre
description: Broadcast Command Precision — a flat, chamfered, ink-and-signal operator system for live tournament control.
colors:
  ink-950: "#0A0E1A"
  ink-940: "#0C101D"
  ink-930: "#0D1220"
  ink-900: "#121828"
  ink-850: "#1A2236"
  ink-700: "#243049"
  text-50: "#F2F6FB"
  text-200: "#B8C4D8"
  text-400: "#8C9AB5"
  cyan-300: "#33DFFF"
  cyan-400: "#00D4FF"
  cyan-700: "#006B82"
  cyan-950: "#0E3E53"
  amber-400: "#FF9C1E"
  amber-800: "#7A4300"
  green-500: "#22C55E"
  red-500: "#EF4444"
  team-accent: "#FF2E88"
  light-ink-950: "#E3E8EF"
  light-ink-900: "#F8FAFC"
  light-ink-930: "#EDF1F6"
  light-ink-850: "#D3DAE4"
  light-ink-700: "#8C9AB5"
  light-control-border: "#5B6884"
  light-text-950: "#05070D"
  light-text-900: "#263049"
  light-text-800: "#46536B"
  light-cyan-800: "#00586B"
  light-cyan-100: "#C4EEF8"
  light-amber-900: "#6B3A00"
  light-green-800: "#116B32"
  light-red-800: "#B01818"
typography:
  display:
    fontFamily: "'Barlow Condensed', 'Roboto Condensed', 'Noto Sans SC', 'Arial Narrow', system-ui, sans-serif"
    fontSize: "clamp(1.602rem, 1.436rem + 0.7088vw, 2.074rem)"
    fontWeight: "700"
    lineHeight: "1.1"
    letterSpacing: "0.04em"
  headline:
    fontFamily: "'Barlow Condensed', 'Roboto Condensed', 'Noto Sans SC', 'Arial Narrow', system-ui, sans-serif"
    fontSize: "clamp(1.266rem, 1.204rem + 0.262vw, 1.44rem)"
    fontWeight: "600"
    lineHeight: "1.2"
    letterSpacing: "0.04em"
  title:
    fontFamily: "'Barlow Condensed', 'Roboto Condensed', 'Noto Sans SC', 'Arial Narrow', system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 1.099rem + 0.1127vw, 1.2rem)"
    fontWeight: "600"
    lineHeight: "1.3"
    letterSpacing: "0.04em"
  body:
    fontFamily: "'Barlow', 'Roboto', 'Noto Sans SC', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: "400"
    lineHeight: "1.5"
    letterSpacing: "0"
  label:
    fontFamily: "'JetBrains Mono', 'Noto Sans SC', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "0.75rem"
    fontWeight: "500"
    lineHeight: "1.4"
    letterSpacing: "0.05em"
  figure:
    fontFamily: "'JetBrains Mono', 'Noto Sans SC', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "1.25rem"
    fontWeight: "500"
    lineHeight: "1.2"
    letterSpacing: "0"
    fontFeature: "tabular-nums"
rounded:
  none: "0"
  sm: "2px"
  md: "4px"
  lg: "8px"
  chamfer: "14px"
  chamfer-control: "8px"
  image-frame: "14px"
  image-frame-control: "8px"
spacing:
  "0": "0"
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
layout:
  container:
    public: "75rem"
    reading: "45rem"
    control: "90rem"
    form: "45rem"
  gutter:
    sm: "1rem"
    md: "1.5rem"
    lg: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.cyan-400}"
    textColor: "{colors.ink-950}"
    typography: "{typography.display}"
    rounded: "{rounded.chamfer-control}"
    padding: "8px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.cyan-300}"
    textColor: "{colors.ink-950}"
  button-secondary:
    backgroundColor: "{colors.ink-850}"
    textColor: "{colors.text-50}"
    typography: "{typography.display}"
    rounded: "{rounded.chamfer-control}"
    padding: "8px 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.ink-700}"
    textColor: "{colors.text-50}"
  button-destructive:
    backgroundColor: "{colors.red-500}"
    textColor: "{colors.ink-950}"
    typography: "{typography.display}"
    rounded: "{rounded.chamfer-control}"
    padding: "8px 16px"
    height: "44px"
  button-destructive-outline:
    backgroundColor: "transparent"
    textColor: "{colors.red-500}"
    typography: "{typography.display}"
    rounded: "{rounded.chamfer-control}"
    padding: "8px 16px"
    height: "44px"
  badge:
    backgroundColor: "{colors.ink-850}"
    textColor: "{colors.text-50}"
    typography: "{typography.label}"
    rounded: "{rounded.chamfer}"
    padding: "4px 8px"
  card:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.text-50}"
    rounded: "{rounded.none}"
    padding: "16px"
  well:
    backgroundColor: "{colors.ink-950}"
    textColor: "{colors.text-50}"
    rounded: "{rounded.none}"
    padding: "16px"
  chrome:
    backgroundColor: "{colors.ink-850}"
    textColor: "{colors.text-50}"
    rounded: "{rounded.none}"
    padding: "16px"
  input-default:
    backgroundColor: "{colors.ink-850}"
    textColor: "{colors.text-50}"
    typography: "{typography.body}"
    rounded: "{rounded.chamfer-control}"
    padding: "8px 12px"
    height: "44px"
  input-focus:
    backgroundColor: "{colors.ink-850}"
    textColor: "{colors.text-50}"
  input-error:
    backgroundColor: "{colors.ink-850}"
    textColor: "{colors.text-50}"
  input-disabled:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.text-400}"
  pill:
    backgroundColor: "{colors.ink-850}"
    textColor: "{colors.text-50}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "4px 12px"
    height: "44px"
  pill-active:
    backgroundColor: "{colors.cyan-950}"
    textColor: "{colors.cyan-400}"
  public-theme-preference:
    height: "44px"
  table-header:
    backgroundColor: "{colors.ink-850}"
    textColor: "{colors.text-400}"
    typography: "{typography.label}"
    padding: "8px 12px"
  table-row:
    backgroundColor: "{colors.ink-930}"
    textColor: "{colors.text-50}"
    padding: "8px 12px"
  table-row-alt:
    backgroundColor: "{colors.ink-940}"
    textColor: "{colors.text-50}"
    padding: "8px 12px"
  stat-tile:
    backgroundColor: "{colors.ink-850}"
    textColor: "{colors.text-50}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "16px"
  dialog:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.text-50}"
    rounded: "{rounded.none}"
    padding: "16px"
    width: "480px"
icon:
  size:
    inline: "16px"
    control: "20px"
    header: "24px"
  stroke: "1.5"
  tablerOpticalScale: "1.1"
chart:
  1-dark: "#796CE0"
  1-light: "#6351CA"
  2-dark: "#00D4FF"
  2-light: "#0094C3"
  3-dark: "#11A68B"
  3-light: "#007E57"
  4-dark: "#FF9C1E"
  4-light: "#CF7100"
  5-dark: "#C959A9"
  5-light: "#B43694"
  other-dark: "#8C9AB5"
  other-light: "#46536B"
---

# Design System: CopaLibre

> This file is the descriptive layer: it explains the world so an agent generating a new screen stays
> on-brand. It is not the contract. Where the two overlap — the palette and typography stack, the
> chamfer motif and its badge exception, the breakpoint set, the colour-plus-label badge rule —
> `openspec/specs/platform/design-tokens/spec.md` is normative and testable, and
> `packages/design-tokens/src/` is the source every value here was read from. Regenerate this file and
> its `.impeccable/design.json` sidecar with `/impeccable document` when those move.

## Overview

**Creative North Star: "Broadcast Command Precision"**

CopaLibre looks like the gallery behind a live broadcast, not the broadcast itself. Deep ink surfaces
recede in the dark theme; L3 Sunlight uses a cool-grey ground and near-white panels while keeping the
same semantic roles. In both, one signal colour — cyan — means live, action, or focus. Everything else
on screen is instrumentation: condensed uppercase labels, monospaced tabular figures that do not shift
width as a score changes, and hairline borders that make structure countable rather than decorative.
The system is built for an operator working a bracket under time pressure, and for a venue screen read
from twelve metres away, with the same tokens serving both.

Density is deliberate and unapologetic. The spacing scale steps in 4px rather than 8px because operator
tables are tight and a scale nobody can honour is a scale that gets bypassed. Surfaces alternate through
opaque named levels — base, panel, chrome, row — rather than through translucency, so any row's contrast
is checkable from its own token instead of from whatever happens to sit behind it. The one piece of
ornament in the whole system is the chamfer: a diagonal pair of bevelled corners, top-right and
bottom-left, cut through `corner-shape` and never through a polygon mask.

The identity is defined as much by refusal as by choice. It is not SebaSOFT's cyberpunk-wireframe world:
no Cyberpunk Yellow, no `#C5003C`, no TRON grids, no scanlines, no ornamental glow standing in for state.
That refusal is scanned in CI against generated output rather than left to brand review. Nor is it a
generic SaaS card grid — there are no soft shadows, no rounded-everything cards, and no state colour used
as decoration. Colour is never the only cue for anything: every state token carries a required
non-colour companion, and the token contract throws at build time when a badge arrives without a label.

**Key Characteristics:**

- Flat opaque surfaces: near-black ink in the dark theme and a cool-grey ground with near-white panels in L3
- One accent — Signal Cyan — reserved for live, primary action, and focus; active filters use its cyan well
- Public and Control follow the system or an explicit light/dark choice; broadcast remains dark
- Condensed uppercase display face for identity; monospace for every figure and label
- Asymmetric chamfer (top-right / bottom-left) as the sole shape signature
- 4px spacing scale, 44px minimum interactive target, tabular figures everywhere numbers appear
- Every state carries a text label, icon, border or position alongside its colour
- A reserved team-accent slot that organizers may fill and may never use to override a state

## Colors

An ink field for the dark theme, cool-grey daylight surfaces for L3, and signal colours that appear only
where something is true about the state of the tournament.

### Primary

- **Signal Cyan** (`cyan-400`): Live state, primary action fills, links, focus rings and the match
  clock. Active filters use its cyan-well surface with Signal Cyan text and border.
- **Signal Cyan Bright** (`cyan-300`): The primary control under the pointer. The reference lightens the
  fill rather than applying a brightness filter, so hover reads as a step toward live rather than as a
  rendering artifact.
- **Signal Cyan Deep** (`cyan-700`): Hovered structure. A border under the pointer moves toward the
  accent instead of merely brightening, so hovering a control and then activating it read as one
  progression.
- **Signal Cyan Well** (`cyan-950`): The selected or active container fill. Cyan at 20% over panel ink,
  resolved opaque so its contrast is checkable from the token.

### Secondary

- **Attention Amber** (`amber-400`): Upcoming, scheduled, needs-attention. Rails on inline alerts, the
  series panel on a match card, the referee chroma in the match console, and the champion glow on the
  broadcast surface. Always paired with a scheduled-time label.
- **Attention Amber Deep** (`amber-800`): The dark companion for amber-on-light compositions.

### Tertiary

- **Confirm Green** (`green-500`): Positive result. Always paired with result text or a winner marker.
- **Dispute Red** (`red-500`): Destructive, disputed, or loss. Always paired with an explicit verb or a
  dispute icon. It is a state colour, never a brand colour.
- **Team Accent** (`team-accent`, `#FF2E88` as the shipped example): A reserved slot an organizer
  replaces with their own identity. Core chrome — navigation, primary buttons, system badges — never
  resolves to it.

### Neutral

- **Deep Ink** (`ink-950`): The broadcast base. Page ground, dialog backdrop, and the text colour that
  sits on top of any cyan or red fill.
- **Row Ink / Row Ink Alt** (`ink-930` / `ink-940`): The two alternating table-row steps, resolved from
  translucent rows into opaque values so contrast is checkable per row.
- **Panel Ink** (`ink-900`): Panels, cards over a base band, the navigation rail, the dialog surface.
- **Chrome Ink** (`ink-850`): Chrome that lifts wherever it sits — panel headers and footers, chips,
  icon wells, table headers, stat tiles, form-control fills.
- **Structure Ink** (`ink-700`): Every hairline border in the system, and the hovered surface fill. One
  colour doing both jobs is why a hovered row reads as the same object one step forward.
- **Paper White** (`text-50`): Body text and headings.
- **Cool Grey** (`text-200`): Secondary text — alert bodies, series detail, broadcast org lines.
- **Muted Steel** (`text-400`): Labels, table headers, metadata, help text, and emphasised structure.
  Never body copy.

### Light Theme (L3 Sunlight)

Public and Control can follow the device's light preference or an explicit per-device choice. TV stays
on the dark palette for kiosks and broadcast overlays. L3 keeps the same semantic roles and changes
their values: a mid-grey ground, near-white panels, darker structure and legible signal colours.

| Role | L3 token | Value | Contrast |
| --- | --- | --- | --- |
| Base ground | `surface-base` | `#E3E8EF` | — |
| Panel and row | `surface-panel`, `surface-row` | `#F8FAFC` | — |
| Alternate row | `surface-row-alt` | `#EDF1F6` | — |
| Chrome | `surface-chrome` | `#D3DAE4` | — |
| Emblem frame | `surface-emblem-frame` | `#1A2236` | Monogram `#F2F6FB` |
| Decorative structure | `border-muted` | `#8C9AB5` | 2.71:1 on panel |
| Form-control boundary | `border-control` | `#5B6884` | At least 3:1 on chrome |
| Body text | `text-primary` | `#05070D` | 19.25:1 on panel |
| Secondary text | `text-secondary` | `#263049` | 12.53:1 on panel |
| Muted labels | `text-muted` | `#46536B` | 5.5:1 on chrome |
| Primary action fill | `primary` | `#00D4FF` | 10.9:1 with `#05070D` text |
| Accent text, links, live and focus | `text-accent`, `state-live`, `focus-ring` | `#00586B` | 7.7:1 on panel |
| Selected container | `surface-raised` | `#C4EEF8` | — |
| Upcoming | `state-upcoming` | `#6B3A00` | 6.69:1 on chrome |
| Positive result | `state-positive` | `#116B32` | 4.7:1 on chrome; 5.07:1 in positive badge tint |
| Destructive result | `state-destructive` | `#B01818` | 6.71:1 on panel |

Charts use violet `#6351CA`, cyan `#0094C3`, teal `#007E57`, amber `#CF7100` and magenta `#B43694`
on near-white plot panels. The primary action's light-theme glow is a 2px deep-cyan outline, not a
blur. Discipline imagery fades to 35% of its dark-theme opacity; the neutral radial ground is lighter.
Organizer emblems keep their opaque chrome-ink frame in both themes. Fallback monograms retain
light text on that frame; frameless emblems follow the active body-text colour.

Positive-result badges blend 15% state green into the near-white panel surface, keeping the label above
4.5:1 contrast while preserving a restrained green tint.

### Named Rules

**The One Signal Rule.** Cyan means live, active, primary, or focused — nothing else outside a chart
plot; inside a plot, it means data-series slot 2. A second accent introduced for decoration destroys
the only cue an operator scans for across a dense screen.

**The Never-Colour-Alone Rule.** Every state token declares a required non-colour companion: `state-live`
carries a LIVE label, `state-upcoming` a scheduled time, `state-positive` a result marker,
`state-destructive` an explicit verb or dispute icon. The badge contract throws at build time on a
missing label rather than shipping two shades of the same rectangle to a colour-blind viewer.

**The Protected-State Rule.** `state-live`, `state-upcoming`, `state-positive`, `state-destructive` and
`focus-ring` can never be overridden by an organizer's team accent. A team whose colour happens to be red
does not get to make "disputed" mean "us".

**The Opaque-Surface Rule.** Surface levels are opaque values, never translucent overlays. A composite
against an unknown backdrop is a contrast figure nobody can verify.

## Typography

**Display Font:** Barlow Condensed (with 'Arial Narrow', system-ui fallback)
**Body Font:** Barlow (with system-ui, -apple-system, 'Segoe UI' fallback)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, 'SFMono-Regular' fallback)

**Character:** Condensed grotesque over humanist sans over a technical mono — the type pairing of a
scoreboard, a match report, and a timing rig respectively. The display face is set uppercase and tracked
out; the mono face is reserved for anything countable. All three are loaded by the same stylesheet that
declares them, because naming a family in a stack is a declaration of intent, not a guarantee it exists
on the rendering machine.

### Hierarchy

- **Display** (Barlow Condensed 700, fluid `3xl`, 1.1, tracked `0.04em`, uppercase): Page and screen
  titles, the broadcast tournament name.
- **Headline** (Barlow Condensed 600, fluid `xl`, 1.2, tracked `0.04em`, uppercase): Section headings,
  card titles, toolbar titles, modal titles.
- **Title** (Barlow Condensed 600, fluid `lg`, 1.3, uppercase): Entrant names on a match card, activity
  feed headings, sub-section headings.
- **Body** (Barlow 400, 1rem, 1.5): Prose, form values, alert bodies, descriptions.
- **Label** (JetBrains Mono 500, 0.75rem, tracked `0.05em`, uppercase): Field labels, table headers,
  action codes, timestamps, scope and venue metadata, trace summaries.
- **Figure** (JetBrains Mono 500, fixed `1.25rem`–`1.875rem`, `tabular-nums`): Scores, clocks, ranks, stat tile
  values, any right-aligned numeric column.

**Fluid heading scale.** The `lg`–`3xl` tokens use `clamp()` with a `rem` intercept so headings grow
with viewport width while still responding to text-only resizing. Each step follows the same
geometric scale from 1.125 at 375px to 1.2 at 1440px; endpoints equal `16 × 1.125ⁿ` and `16 × 1.2ⁿ`
pixels respectively:

| Token | 375px | Fluid rule | 1440px |
| --- | ---: | --- | ---: |
| `lg` | 18px | `clamp(1.125rem, 1.099rem + 0.1127vw, 1.2rem)` | 19.2px |
| `xl` | 20.256px | `clamp(1.266rem, 1.204rem + 0.262vw, 1.44rem)` | 23.04px |
| `2xl` | 22.781px | `clamp(1.424rem, 1.317rem + 0.457vw, 1.728rem)` | 27.648px |
| `3xl` | 25.629px | `clamp(1.602rem, 1.436rem + 0.7088vw, 2.074rem)` | 33.178px |

The fixed steps remain `xs` 0.75rem, `sm` 0.875rem, `base` 1rem and `md` 1.125rem. Numeric figures
keep fixed `lg` (1.25rem), `xl` (1.5rem) and `2xl` (1.875rem) sizes so a changing score does not shift
the visual scale of the readout. **The Floor Rule:** application font sizes never fall below 0.75rem.
**The Text Unit Rule:** font sizes use `rem` or a token; pixel font sizes are forbidden. The TV
broadcast typography system keeps its separately documented font sizing.

### Named Rules

**The Tabular Figures Rule.** Any number that can change while someone is looking at it — a score, a
clock, a rank, a stat tile — renders in the mono face with `font-variant-numeric: tabular-nums`. A score
that shifts width as it changes is a score nobody can read.

**The Bare Heading Rule.** Every `h1`–`h6` resolves to the display family and the semantic scale without
a component asking for it: `h1` uses `3xl`, `h2` `2xl`, `h3` `xl`, `h4` `lg`, `h5` `md` and `h6` `base`.
A heading rendered in the body face or at a browser-default size is the identity silently not being
applied. A component with a named typography role may select its own token.

**The Tracked Uppercase Rule.** Uppercase text carries tracking from the named scale — `wide` (0.04em)
for metadata and headings, `wider` (0.05em) for buttons and emphasised labels, `widest` (0.06em) for the
display face set large. Uppercase at `normal` tracking is a bug, not a choice. Chinese (`:lang(zh)`) is
the exception: tracked values resolve to `normal`, because CJK has no case and added letter spacing
harms it.

## Layout

Three surfaces share one token set and diverge only in density and container behaviour.

**Control (Operate).** A two-column shell: a fixed navigation rail of `minmax(11.25rem, 15rem)` against a
fluid main column, full viewport height. Main content is centered in a `90rem` container; each form or
settings panel is capped at `45rem`. Horizontal gutters are `1rem`, `1.5rem`, and `2rem` from the `sm`,
`md`, and `lg` breakpoints; vertical main padding is `2rem` on desktop and `1rem` below `md`. Below
the `md` breakpoint (768px) the rail collapses into a slide-in drawer of `min(20rem, 85vw)` behind a
sticky mobile header. Buttons keep their content width, except primary actions in single-column mobile
forms, which fill the available width. Control composes on a denser mapping of the same 4px scale:
`24px` between sections, `12px` between fields, `8px` between rows, `4px` inline. No second scale is
introduced; each value is an existing step chosen for density.

**Public (Persuade / Read).** Full-width header and footer bands align their contents to a centered
`75rem` container. Public page content uses that same `75rem` maximum; reading pages use a `45rem`
column. Both use `1rem`, `1.5rem`, and `2rem` horizontal gutters from the `sm`, `md`, and `lg`
breakpoints. Content sits over a fixed, low-opacity discipline background image — or, when a discipline
ships no imagery, a token-drawn neutral radial ground rather than another discipline's picture. Card
grids are `repeat(auto-fill, minmax(min(100%, 17.5rem), 1fr))`. Output is durable and
JavaScript-independent.

**Broadcast (Experience).** Viewport-relative throughout: type sized in `clamp()` against `vmin` so a
scorebug reads at any venue-screen resolution, and a single alternation step instead of the full
surface ladder.

**Spacing scale.** 4px base — `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`. Four rather than eight
because operator tables are dense and an 8px floor forces every tight layout to opt out.

**Breakpoints.** `375px` (small phone), `768px` (tablet), `1024px` (small laptop), `1440px` (desktop) —
exactly the four widths the screenshot acceptance gate requires, with no undocumented extras. Media
queries use only these declared width values and the `BREAKPOINTS` tokens; do not add a one-off width.

### Named Rules

**The Alternating Band Rule.** A card over a panel band takes the base fill; the same card over a base
band takes the panel fill. Nesting inverts again. A container never sits on its own colour, so structure
is readable without a single border being required to carry it.

**The Chrome-Lifts Rule.** Chrome — a panel header, a footer, a chip, an icon well — resolves to
`ink-850` wherever it sits, at any depth. A header reads as a header regardless of what it is nested in.

**The No-Sideways-Page Rule.** Wide content scrolls inside its own box (`.cl-table-scroll`,
`overflow-x: auto`). The page body never scrolls horizontally; every layout child carries `min-width: 0`.

**The Shared Container Rule.** Public content uses a centered `75rem` (`1200px`) container and
reading pages use `45rem` (`720px`); Control uses `90rem` (`1440px`) and its forms use `45rem`
(`720px`). At 1920px and wider, each surface stays at its maximum and centered. Below that, horizontal
gutters follow the shared `1rem`, `1.5rem`, and `2rem` scale. Full-width bands may break out, but their
contents return to the matching container. Pages compose the owned container instead of setting a raw
`max-width`.

**The 44px Rule.** Every interactive target — button, pill, nav link, form control, pagination step —
is at least `44px` in its constrained axis.

## Elevation & Depth

The system is flat. Depth is carried entirely by opaque tonal layering — base, row, panel, chrome, each a
named surface token — reinforced by a uniform `1px solid ink-700` hairline on every card, well, chrome
block, header and footer. Nothing floats; things sit at a level.

Two exceptions exist, both stated rather than incidental. A dialog draws
`0 24px 48px -12px rgba(0, 0, 0, 0.55)` because a modal must read as detached from the screen it
suspends. The primary button draws `--cl-glow-cyan` on hover and active — a 20px ambient bloom at 40% of
the accent — because a live-action control benefits from confirming the press. Neither is a state
indicator; both are affordance.

### Shadow Vocabulary

- **Dialog elevation** (`box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.55)`): The only structural shadow.
  Modals and dialogs, applied once from `DIALOG_TOKENS` so no screen re-derives its own scrim.
- **Cyan glow** (`box-shadow: 0 0 20px color-mix(in srgb, var(--cl-primary) 40%, transparent)`): The
  primary button on hover and active. Never a resting state, never a status signal.
- **Focus ring** (`box-shadow: 0 0 0 2px var(--cl-surface-base), 0 0 0 4px var(--cl-focus-ring)`): Two
  layers — an inner ring in the surface colour, an outer in cyan. One ring disappears against whichever
  surface happens to match it; the gate requires visibility on dark panels, accent fills, dialogs and
  image-backed overlays alike.

### Named Rules

**The Flat-Unless-Suspended Rule.** Surfaces are flat. Shadow appears only where an element is suspended
above the page (a dialog) or is confirming a press (the primary button). A resting card with a shadow is
drift.

**The Two-Layer Focus Rule.** The focus indicator is always two rings, never one, and never clipped to a
chamfer — `clip-path` is prohibited for corner geometry precisely so that outside-the-box indicators
survive.

## Shapes

The signature is an asymmetric chamfer: one diagonal pair of corners cut flat — top-right and
bottom-left — at `14px`, or `8px` on operator controls, where density outranks drama. Top-left and
bottom-right stay square. It is drawn with `corner-shape: bevel` plus `border-radius`, per-corner
longhands where only those are supported, and square corners with a fully usable component where neither
is. There is no `clip-path` fallback, ever, so borders, outlines, focus rings and glows are never
clipped by the shape.

The motif is a family, not a single cut: the diagonal pair as default, each single corner of that pair on
its own (`.cl-chamfer-tr`, `.cl-chamfer-bl`), and the control-sized variant. A composition cuts the
corners its shape calls for; corners it does not cut stay at a zero radius.

Two stated exceptions. Small square controls — checkbox, radio — cut all four corners, because an
asymmetric cut at 20px reads as a rendering fault rather than a shape. A badge cuts one vertical pair:
both left corners at `14px`, both right square. At badge proportions the diagonal pair puts its two cuts
at opposite ends of a short label and reads as a skewed box; a vertical pair reads as a tag, while
cutting all four would read as a pill. This is a deliberate divergence from the reference project, which
paints badges square.

Beyond the chamfer, the radius scale is nearly unused: `2px` for checkboxes and small utility chrome,
`4px` for the file-selector button, `8px` where the scale's own step is wanted. Cards, panels, wells,
tables, stat tiles and pills are square.

The framed-image treatment (`.cl-image-frame`) matches the chamfer cut visually: `4/5` aspect ratio,
`512px` maximum height, a `1px` structure border, and a chrome-ink ground behind the placeholder.

### Named Rules

**The No-Mask Rule.** Chamfer geometry is `corner-shape` and `border-radius` only. A polygon mask clips
the focus ring and the glow, which is exactly what the accessibility gate cannot allow.

**The Diagonal-Pair Rule.** The default cut is top-right and bottom-left. Any other combination is a
declared variant, not an ad hoc choice at the call site.

## Components

Instrument-grade: cut, labelled, and legible under pressure. Controls read like broadcast hardware —
uppercase display face, 44px targets, state always spelled out in words as well as colour.

### Buttons

- **Shape:** Control chamfer — top-right and bottom-left cut flat (`8px`), other corners square.
- **Type:** Barlow Condensed 700, uppercase, tracked `0.05em`.
- **Size:** `44px` minimum height and width, padded `8px 16px`, `max-width: 100%` with
  `overflow-wrap: anywhere` so a long translated label wraps instead of overflowing.
- **Primary:** Signal Cyan fill with Deep Ink text — light text on this cyan does not reach AA.
- **Primary hover / active:** Fill lightens to Signal Cyan Bright and the cyan glow appears; no
  brightness filter.
- **Secondary:** Chrome Ink fill, Paper White text, structure border. On hover both fill and outline
  move — to hovered surface and emphasised structure — so the two states differ by more than brightness,
  which is what makes a secondary readable as interactive next to a filled primary.
- **Destructive:** Dispute Red fill, Deep Ink text. **Destructive-outline:** transparent fill, red text
  and border.
- **Disabled:** `opacity: 0.55`, `cursor: not-allowed`, no filter.

### Badges

- **Shape:** Both left corners cut at `14px`, both right corners square — the tag silhouette.
- **Style:** Barlow Condensed 600, uppercase, padded `4px 8px`, inline-flex with a `4px` gap for an
  optional icon.
- **Contract:** A label is required. `assertBadge` throws `BadgeContractError` on an empty one.

### Cards / Containers

- **Corner Style:** Square. The chamfer is applied by composition, not by the card itself.
- **Background:** Alternates against its band — panel over base, base over panel, inverting again on
  nesting via `@container style()` queries. Broadcast surfaces constrain to a single alternation step.
- **Border:** `1px solid` Structure Ink on every card, well, chrome block, header and footer.
- **State rail:** A `4px` left border in the state colour — live, upcoming, positive, destructive —
  paired with the card's own label. This rail is the card's state cue.
- **Internal Padding:** `16px`; header gap `4px` with `12px` beneath, content gap `12px`, footer gap `8px`
  with `16px` above.
- **Title:** Display face, uppercase, `overflow-wrap: anywhere`.

### Inputs / Fields

- **Style:** Chrome fill, `1px` control border, control chamfer (`8px` top-right / bottom-left),
  `44px` minimum height, `8px 12px` padding. Native pickers follow the active theme's `color-scheme`.
- **Focus:** Border shifts to the focus ring colour and the two-layer ring draws outside the box.
- **Error:** Border and ring both become Dispute Red; the error message renders in the same red at
  `0.75rem` beneath the field.
- **Disabled:** Panel Ink fill with Muted Steel text.
- **Labels:** Mono, uppercase, `0.75rem`. Help text and decision hints in Muted Steel at `0.75rem`.
- **Checkbox / radio:** `1.25rem` square with all four corners cut, base-ink fill, structure border;
  hover moves the border toward cyan; checked fills Signal Cyan with a Deep Ink glyph — a polygon
  checkmark or a `0.5rem` dot.
- **File picker:** A dashed-border drop zone on panel ink; drag-active takes the hovered surface with a
  cyan border, selection-present takes the raised cyan well with emphasised structure.

### Tables

- **Header:** Chrome Ink ground, Muted Steel display-face text at `0.75rem`, uppercase, tracked `0.05em`,
  `white-space: nowrap`.
- **Rows:** Alternate between the two opaque row inks. Cells padded `8px 12px` with a `1px` bottom
  hairline; the last row drops its rule.
- **Figures:** `tabular-nums` table-wide; numeric columns right-align under their heading.
- **Overflow:** The table scrolls inside `.cl-table-scroll`, never the page.

### Navigation

- **Control rail:** Panel Ink, `16px` padding, right hairline, links as a `8px`-gapped grid, each link a
  flex row at `44px` minimum height. Below 768px it becomes a drawer — a 65% ink scrim with a `4px` blur,
  a 200ms `cubic-bezier(0.16, 1, 0.3, 1)` slide-in, and a `44px` hamburger with a structure border.
- **Pills / filters:** Chrome Ink with a structure border, Barlow 600 at `0.875rem`, `44px` minimum
  height. Hover takes the hovered surface; `--active` or `aria-current` uses the cyan well with Signal
  Cyan text and border, keeping selected filters distinct from primary actions.
- **Public theme preference:** Compact disclosure with the current System/Light/Dark choice visible.
  Its options remain a `44px` target and the selected choice uses the theme-aware accent tokens.
- **Public shell:** A single logo lock-up in the header and a one-line footer. A skip link sits offscreen
  until focused, then lands at `8px / 8px` on panel ink.

### Dialogs / Modals

- Centred at `min(480px, calc(100vw - 32px))`, `85vh` maximum height, panel ink over a Deep Ink backdrop,
  structure border, `16px` padding, and the one structural shadow in the system. Title in the display
  face uppercase; body a `12px`-gapped grid; footer right-aligned with an `8px` gap.

### Inline Alerts

- A `4px` left rail in the state colour over a Chrome Ink ground, `12px` padding, `8px` gap. Amber is the
  default; destructive, success and live are variants. The rail is the colour, the text is the meaning —
  title in bold body, body in Cool Grey at `0.875rem`.

### Signature: The Match Card

The one component that carries the identity outright, shared verbatim by both the public and control
surfaces. A `12px`-gapped grid: a header pairing the state badge with a mono clock in Signal Cyan at
`1.25rem`; a sides list where each entrant row is a rank badge in mono tabular figures, a display-face
name at `1.25rem` that ellipsises rather than wraps, and a `1.875rem` mono score; mono uppercase metadata
for scope, venue and event; an amber-railed series panel when a match belongs to one; a cyan-railed
deciding-factor line when the outcome turned on a rule; and a collapsible trace whose summary is a cyan
mono label and whose lines are `0.75rem` mono in Muted Steel. It is the whole system in one box —
condensed identity, mono figures, state rails, no ornament.

### Signature: The TV Match Spotlight

The featured broadcast matchup gives home and away the same square emblem frame and the same reading
order: emblem, entrant name, then a localized role tag. The frame is `clamp(14vmin, 18vmin, 22vmin)`
at landscape sizes and `64px` in narrow or portrait layouts. The centered score separates the two
equal columns. The tag uses a neutral surface, structure border and secondary text; neither side is
enlarged or identified by the signal accent.

### Signature: The Tactical Grid

A background of 1px cyan lines at 6% opacity on a `24px × 32px` cell. It is the system's only decorative
texture, and it is deliberately below the threshold of noticing — atmosphere on a large empty surface,
never a layer that competes with content.

## Do's and Don'ts

### Do:

- **Do** give both sides of the TV match spotlight equal emblem frames and place each localized role
  tag beneath its entrant name.
- **Do** name a state, never a colour. Components consume `state-live`, not `cyan-400`, so retheming
  "live" is one line in `semantic.ts` rather than a search across three rendering technologies.
- **Do** pair every state colour with its declared non-colour cue — a LIVE label, a scheduled time, a
  result marker, an explicit verb.
- **Do** render every changeable number in the mono face with `tabular-nums`.
- **Do** cut the chamfer with `corner-shape` and `border-radius`, and let unsupported browsers get square
  corners and a working component.
- **Do** keep interactive targets at `44px` in the constrained axis, and let long labels wrap with
  `overflow-wrap: anywhere` rather than overflow — interface copy must survive all eight languages.
- **Do** let containers alternate against their band, and let chrome lift to `ink-850` at any depth.
- **Do** collapse motion to `0s` under `prefers-reduced-motion`, not merely shorten it: state must
  survive in text, icon, border and layout without the animation.
- **Do** scroll wide content inside its own box.

### Don't:

- **Don't** introduce a second accent colour. Cyan is the only voice, and its scarcity is what makes it
  scannable. Data-visualization plot areas are the named exception: they may use only the five declared
  series colours; chart chrome remains in ink and text tokens.
- **Don't** use emblem size, accent colour or placement to imply that either side of the TV match is
  more important.
- **Don't** use `clip-path` for corner geometry. It clips the focus ring and the glow.
- **Don't** let an organizer's team accent reach `state-live`, `state-upcoming`, `state-positive`,
  `state-destructive` or `focus-ring`, or appear in core chrome — navigation, primary buttons, system
  badges.
- **Don't** ship a badge, chip or status mark whose only signal is its colour.
- **Don't** add a resting shadow. Shadow means suspended (a dialog) or pressed (the primary button).
- **Don't** use translucent surface fills where a row's contrast has to be verifiable; resolve them to
  opaque tokens.
- **Don't** reach for `text-muted` for body copy — it is a label colour.
- **Don't** reintroduce SebaSOFT's identity: `#f3e600`, `#c5003c`, CP2077 or DATA_BLOB vocabulary, TRON
  references, scanlines, or a grid glow used as a state indicator. CI scans generated output for all of
  them.
- **Don't** introduce a spacing, radius, font-size, tracking or breakpoint value outside the named
  scales. A hardcoded literal at a call site is how a scale becomes an accident.

## Surfaces and Devices

Judge the live match console as a tablet-first, touch-first surface at 768–1024px. Its event actions
must be reachable by finger and thumb, and common events must take one tap. Judge public pages at 375px
and 960px or wider with equal weight. Judge TV and broadcast surfaces at 1280px and 1920px. The review
matrix covers Spanish and German at 375px, 768px, 1024px and 1440px; use 188px and all eight interface
languages on pages flagged by overflow detection. Review TV at both specified widths.

## References

Use external products and broadcasts to assess hierarchy, pace and information density only. TV
scorebugs are compared with FIFA and UEFA broadcasts; public match centres with ESPN and FotMob; control
surfaces with a broadcast vision mixer and Bloomberg-dense tables. Do not reproduce trade dress.

The owner adopted these layout compositions as guidance for layout, spacing, hierarchy, density and
intended user journey. Their prose descriptions are the complete source for each composition:

| Surface | Adopted composition |
| --- | --- |
| Control foundation | Shared screen templates, a scope rail header and the organization dashboard. |
| Tournament setup | Tournament settings and rules, wizards, zones and groups, promotion planning, seeding and image cropping. |
| Operations and administration | Venues, schedule and officials, roles and permissions, analytics, audit trail, preferences and invitation acceptance. |
| Public | Tournament overview, matches, stages and the not-found page. |
| TV | Kiosk, live presentation and multi-match dashboard. |

Adopted compositions never supply palette, icons, shadows, tokens or technical guidance. `DESIGN.md`
and the token source govern every conflict. Reject fabricated system chrome such as ports, latency,
FPS, telemetry, clusters, nodes or links to unrelated system services. Reject invented domain features,
including disciplinary tribunals, court temperature, federation certification, VAR, cryptographic
ledgers, storage telemetry and password entropy meters. Sport-specific widgets such as possession
meters appear only when declared by the discipline. Text must never overlap, overflow or clip. Do not
use bilingual headings, slash separators or scanline digit treatments.

## Interaction States

- **Loading:** The `Skeleton` atom renders opaque `ink-850` blocks, lines and table rows shaped like
  the final layout, with `aria-busy` and hidden loading text. Do not shimmer; keep the layout stable
  when data arrives. The `ReadState` template preserves the page heading during loading and failure.
- **Empty:** Show an `ink-850` icon well, a heading, a one-sentence explanation and a primary action
  that resolves the empty state. Use the `EmptyState` molecule in React and its server-rendered Astro
  counterpart on public pages. An explicit no-permission state replaces the action with who can act.
- **Error with prior data:** Keep the last good data visible, mark it stale and show its age. A toast
  states what failed and offers Retry. `StaleMark` includes a relative age; after five minutes
  `ReadState` also offers Retry beside the retained data. Never render a failed refresh as empty.
- **Error without prior data:** Keep the skeleton, show a Retry toast and retry automatically with
  backoff. `useResilientRead` owns the 2, 4, 8, 16, 30-second schedule, holding at 30 seconds, and
  resets it on manual retry. Its in-memory cache is scoped to the authenticated session and resource;
  it never persists across a document reload. Mutation results update the cached value.
- **Offline console:** Show connection status, queued count and last sync in the header. Use amber while
  work is queued and red only after rejection. The `ConnectionStatus` organism announces changes
  politely. The `EventSyncMark` molecule shows queued, sent, confirmed or refused, with the server's
  refusal reason in an alert. Confirmed requires a server acknowledgement, never an optimistic write.

## Iconography

Use Lucide as the primary icon set. Use Tabler only for missing glyphs and scale each Tabler glyph to
110% around its centre inside the same 16px, 20px or 24px box, so its smaller optical drawing matches
Lucide. Use custom inline SVG only as a last fallback. Icons use a 1.5px stroke and `currentColor`.
Reserve 16px for inline icons, 20px for controls and 24px for headers.
Every call site requests a semantic key from `apps/web/src/lib/icon-registry.ts`; it never imports an
icon package. React and Astro render through `apps/web/src/control/components/ui/atoms/icon.tsx` and
`apps/web/src/components/ui/atoms/Icon.astro`, respectively, so public and TV pages keep their SVGs
without JavaScript. Keys are `activity`, `calendar`, `check`, `club`, `clock`, `copy`, `download`,
`event`, `export`, `external-link`, `language`, `menu`, `more`, `pause`, `play`, `retry`, `start-clock`,
`team`, `trophy`, `upload`, `user`, `venue`, `warning`, `offline`, `close`, `zoom-in`, `zoom-out`,
`pause-clock`, `basketball`, `football`, `tennis`, `podium`, `scoreboard`, `cards` and `unknown`.
Unknown runtime keys resolve to a neutral custom event glyph. Decorative icons are hidden from
assistive technology; a standalone meaningful icon has an accessible label. State always has a text or
shape cue as well.

## Data Visualization

Use this fixed plot-series order: violet `#796CE0`, cyan `#00D4FF`, teal `#11A68B`, amber `#FF9C1E`,
magenta `#C959A9`. Fold a sixth and later series into “Other”. On light surfaces, use the corresponding
steps violet `#6351CA`, cyan `#0094C3`, teal `#007E57`, amber `#CF7100` and magenta `#B43694`; never use
the dark cyan or amber on a light ground. Keep chart axes, grid, labels and legend text in ink and text
tokens. On light themes, place the plot on the panel surface, not the base, because cyan and amber fall
below 3:1 on the base.

The dark palette passes the 3:1 contrast floor and colour-separation checks. Its closest adjacent
colour-blind pair is amber–teal at ΔE 12.9; its closest normal-vision pair is teal–cyan at ΔE 18.6.
The accepted lightness warning is that cyan (L 0.80) and amber (L 0.78) sit above the tested 0.48–0.67
band, so those series read heavier and can share a hue with a nearby live or upcoming badge. The light
palette's closest adjacent colour-blind pair is amber–teal at ΔE 8.0, and its closest normal-vision
pair is teal–cyan at ΔE 16.4. Every light slot remains at least 3:1 on white, `#F4F6FA` and the L3
panel. On the L3 base, cyan (2.83:1) and amber (2.84:1) fall below 3:1. Reordering the fixed slots can
also fail colour separation; magenta beside teal measures ΔE 4.9 for deutan vision. For two or more
series, provide a legend; directly label up to four series, pair status colours with their text labels,
and offer the same values in a table view.

The One Signal Rule has one scoped exception: a plot area may use these five series colours. The
exception does not extend to chart chrome or other interface areas.

## Motion

Use a cyan-well flash for 600ms when a score changes, a one-time translate-and-opacity entry for a new
event over 200ms, and a LIVE dot whose opacity fades and returns over successive 2000ms phases (a
4000ms round trip). The words carry each state; its motion only draws attention. Live dots start in
phase, with one dot per match card. State cues animate only `transform`, `opacity` and
`background-color`; nothing enters on page load. The drawer and feedback for user actions may also move.
Under `prefers-reduced-motion`, collapse every duration to `0s`; hold the score's cyan-well fill for
600ms, show new events in place, and keep the live dot steady. Preserve meaning through text, icons,
borders and layout.

## Imagery

Contain crests in a square chamfered frame. When a crest is missing, show a monogram tile built from the
entrant's existing abbreviation in the mono face. Render stored abbreviations of one to four
characters at figure size and five to six at one step smaller; absent or longer abbreviations use the
shield. Never derive initials or truncate while rendering. Keep the tile in neutral chrome ink with a
structure border and paper text. Player photos use a 4:5 cover crop.

## Voice

Button labels name the action and its object: “Publish schedule”, “Save settings”, or “Rename stage”,
not a bare “Publish”, “Save”, or “Rename”. A success toast repeats the action verb: “Publish schedule”
leads to “Schedule published”. Error messages state what failed and give the next step, without
apologizing. Catalogue strings use sentence case; CSS supplies uppercase styling.

## Public Casing

Use uppercase for display and headline levels. Keep page titles, entrant names and long-form subheadings
in sentence case on public reading pages.

## Non-Latin Scripts

Declare script-specific fallbacks through `unicode-range`. Barlow and Barlow Condensed remain the
Latin faces; Roboto Condensed handles Cyrillic display text and Roboto handles Cyrillic body text.
Noto Sans SC handles Chinese display and body text, and Chinese glyphs in mono content; figures keep
`tabular-nums`. Latin-only pages do not download Cyrillic or CJK font files because Google Fonts
delivers the fallback faces in script-specific subsets.

## Reading Width

Do not cap prose by character count. Set a readable measure through the page container and its column
widths; review the layout itself rather than imposing a `ch` limit.

## Accessibility Target

Meet WCAG 2.2 AA. Keep the existing 44px minimum interactive target rule.

## Hierarchy and Scanning

Every screen has one focal point in its first viewport, placed top-left or top-centre. Public
tournament overviews lead with live matches, then the next fixtures and latest results; control
dashboards lead with tournaments that need action. Figures use the figure token at a minimum of
1.875rem; labels use 0.75rem.

Each view region has one primary action. Supporting actions use secondary or tertiary treatment.
Active filters use the cyan well token, not a cyan-filled action style. Keep the signal colour for
actions, selections and state.

Progressively disclose detail: tournament overviews show up to four upcoming fixtures and four latest
results, then link to the complete match list; the overview shows full entrant names and keeps
abbreviations for tickers. Schedules group matches by day and venue, with collapsible days and filters;
standings reveal tie-break detail for one position at a time; activity feeds group consecutive
identical actions while preserving the complete audit trail.

Use LIVE and its live colour only for a match in play. A tournament that is underway uses a neutral
“In progress” badge. A featured tournament that is also live appears once, with both state badges.

For linked cards, make the title the link and use a single overlay hit target for the remaining card
area. Keep non-link text visually unadorned. Sort fixtures chronologically within rounds, order cups
by their promotion tier, and name bracket rounds by their meaning.

Do not use cyan for decoration, including taglines, rails or resting glows. Upcoming matches have no
score; show a dash instead of zeroes, and pair an empty live state with the next kickoff time. Charts
identify series by entity name and also provide the same values in a table. Forms show validation only
after a field is blurred or submitted, never on first render.

## Deliberate Choices

These are deliberate CopaLibre brand choices, not generic-UI findings: the ink ground with one cyan
accent, tracked uppercase labels, monospace data labels and middle-dot metadata strings.
