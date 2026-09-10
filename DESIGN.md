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
typography:
  display:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.04em"
  headline:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.04em"
  title:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
  body:
    fontFamily: "'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.05em"
  figure:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.2
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
    backgroundColor: "{colors.cyan-400}"
    textColor: "{colors.ink-950}"
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
recede so that one signal colour — cyan — can mean exactly one thing: this is live, this is the action,
this is where you look. Everything else on screen is instrumentation: condensed uppercase labels,
monospaced tabular figures that do not shift width as a score changes, hairline borders that make
structure countable rather than decorative. The system is built for an operator working a bracket under
time pressure, and for a venue screen read from twelve metres away, with the same tokens serving both.

Density is deliberate and unapologetic. The spacing scale steps in 4px rather than 8px because operator
tables are tight and a scale nobody can honour is a scale that gets bypassed. Surfaces alternate through
opaque named levels — base, panel, chrome, row — rather than through translucency, so any row's contrast
is checkable from its own token instead of from whatever happens to sit behind it. The one piece of
ornament in the whole system is the chamfer: a diagonal pair of bevelled corners, top-right and
bottom-left, cut through `corner-shape` and never through a polygon mask.

The identity is defined as much by refusal as by choice. It is not SebaSOFT's cyberpunk-wireframe world:
no Cyberpunk Yellow, no `#C5003C`, no TRON grids, no scanlines, no ornamental glow standing in for state.
That refusal is scanned in CI against generated output rather than left to brand review. Nor is it a
generic SaaS card grid — there are no soft shadows, no rounded-everything cards, no pastel status chips.
Colour is never the only cue for anything: every state token carries a required non-colour companion, and
the token contract throws at build time when a badge arrives without a label.

**Key Characteristics:**

- Flat, near-black ink surfaces layered by opaque tonal steps, never by translucency or shadow
- One accent — Signal Cyan — reserved for live, active, primary action, and focus
- Condensed uppercase display face for identity; monospace for every figure and label
- Asymmetric chamfer (top-right / bottom-left) as the sole shape signature
- 4px spacing scale, 44px minimum interactive target, tabular figures everywhere numbers appear
- Every state carries a text label, icon, border or position alongside its colour
- A reserved team-accent slot that organizers may fill and may never use to override a state

## Colors

A near-black ink field, three steps of cool grey text, and four saturated signal colours that appear only
where something is true about the state of the tournament.

### Primary

- **Signal Cyan** (`cyan-400`): Live and active state, primary action fills, links, focus rings, the
  match clock, the active pill in a filter group. This is the system's only voice; it is why the ink is
  as dark as it is.
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

### Named Rules

**The One Signal Rule.** Cyan means live, active, primary, or focused — nothing else. A second accent
introduced for decoration destroys the only cue an operator scans for across a dense screen.

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

- **Display** (Barlow Condensed 700, 2.25rem, 1.1, tracked `0.04em`, uppercase): Page and screen titles,
  the broadcast tournament name.
- **Headline** (Barlow Condensed 600, 1.5rem, 1.2, tracked `0.04em`, uppercase): Section headings, card
  titles, toolbar titles, modal titles.
- **Title** (Barlow Condensed 600, 1.25rem, 1.3, uppercase): Entrant names on a match card, activity feed
  headings, sub-section headings.
- **Body** (Barlow 400, 1rem, 1.5): Prose, form values, alert bodies, descriptions.
- **Label** (JetBrains Mono 500, 0.75rem, tracked `0.05em`, uppercase): Field labels, table headers,
  action codes, timestamps, scope and venue metadata, trace summaries.
- **Figure** (JetBrains Mono 500, 1.25rem–1.875rem, `tabular-nums`): Scores, clocks, ranks, stat tile
  values, any right-aligned numeric column.

### Named Rules

**The Tabular Figures Rule.** Any number that can change while someone is looking at it — a score, a
clock, a rank, a stat tile — renders in the mono face with `font-variant-numeric: tabular-nums`. A score
that shifts width as it changes is a score nobody can read.

**The Bare Heading Rule.** Every `h1`–`h6` resolves to the display family without a component asking for
it. A heading rendered in the body face is the identity silently not being applied.

**The Tracked Uppercase Rule.** Uppercase text carries tracking from the named scale — `wide` (0.04em)
for metadata and headings, `wider` (0.05em) for buttons and emphasised labels, `widest` (0.06em) for the
display face set large. Uppercase at `normal` tracking is a bug, not a choice.

## Layout

Three surfaces share one token set and diverge only in density and container behaviour.

**Control (Operate).** A two-column shell: a fixed navigation rail of `minmax(180px, 240px)` against a
fluid main column, full viewport height, main padded at `32px`. Below the `md` breakpoint (768px) the
rail collapses into a slide-in drawer of `min(320px, 85vw)` behind a sticky mobile header, main padding
drops to `16px`, and below 375px to `12px` — the width that 200% zoom exposes. Control composes on a
denser mapping of the same 4px scale: `24px` between sections, `12px` between fields, `8px` between rows,
`4px` inline. No second scale is introduced; each value is an existing step chosen for density.

**Public (Persuade / Read).** A centred `960px` container over a fixed, low-opacity discipline background
image — or, when a discipline ships no imagery, a token-drawn neutral radial ground rather than another
discipline's picture. Card grids are `repeat(auto-fill, minmax(min(100%, 280px), 1fr))`. Output is
durable and JavaScript-independent.

**Broadcast (Experience).** Viewport-relative throughout: type sized in `clamp()` against `vmin` so a
scorebug reads at any venue-screen resolution, and a single alternation step instead of the full
surface ladder.

**Spacing scale.** 4px base — `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`. Four rather than eight
because operator tables are dense and an 8px floor forces every tight layout to opt out.

**Breakpoints.** `375px` (small phone), `768px` (tablet), `1024px` (small laptop), `1440px` (desktop) —
exactly the four widths the screenshot acceptance gate requires, with no undocumented extras.

### Named Rules

**The Alternating Band Rule.** A card over a panel band takes the base fill; the same card over a base
band takes the panel fill. Nesting inverts again. A container never sits on its own colour, so structure
is readable without a single border being required to carry it.

**The Chrome-Lifts Rule.** Chrome — a panel header, a footer, a chip, an icon well — resolves to
`ink-850` wherever it sits, at any depth. A header reads as a header regardless of what it is nested in.

**The No-Sideways-Page Rule.** Wide content scrolls inside its own box (`.cl-table-scroll`,
`overflow-x: auto`). The page body never scrolls horizontally; every layout child carries `min-width: 0`.

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

- **Style:** Chrome Ink fill, `1px` structure border, control chamfer (`8px` top-right / bottom-left),
  `44px` minimum height, `8px 12px` padding, `color-scheme: dark` so native pickers match.
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
  height. Hover takes the hovered surface; `--active` or `aria-current` fills Signal Cyan with Deep Ink
  text.
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

### Signature: The Tactical Grid

A background of 1px cyan lines at 6% opacity on a `24px × 32px` cell. It is the system's only decorative
texture, and it is deliberately below the threshold of noticing — atmosphere on a large empty surface,
never a layer that competes with content.

## Do's and Don'ts

### Do:

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
  scannable.
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
