## Why

Every visual surface CopaLibre will build (Astro public pages, Starlight docs, the React control
app, and later the `/tv/**` broadcast surfaces) needs one consistent, implemented token layer.
`../chaos-vault/20-knowledge-domains/copalibre-visual-identity.md` and `../chaos-vault/50-research/
copalibre-visual-design-research.md` already decided CopaLibre's visual identity — **"Broadcast
Command Precision"** — combining sports-broadcast authority, esports command-console density, and
discipline neutrality, with one non-negotiable constraint stated verbatim: "This document must never
be conflated with or substituted by [the SebaSOFT Cyberpunk Wireframe Visual Doctrine], which
governs `sebasoft.app` only... Do not reuse `sebasoft.app`'s cyan-wireframe/CP2077 tokens or
components for any CopaLibre surface — the two products must look unrelated."

A real, working reference implementation of this system already exists as static CSS at
`../copalibre-design-system-fixed/shared/copalibre-system.css` (10 built mockup screens consume it).
This phase turns that reference into `packages/design-tokens`, the shared package
`copalibre-platform-architecture.md`'s "Shared design system" section requires: "Color, typography,
spacing, radius, motion, and semantic state names remain consistent while the rendering technologies
differ."

## What Changes

- Implement `packages/design-tokens` generating **CSS custom properties** (consumed by Astro/Pico/
  Starlight) and **Tailwind tokens** (consumed by the React control app) from one source-of-truth
  token definition — not two hand-maintained copies.
- Port the primitive/semantic token scale from `copalibre-system.css`: ink scale
  (`--cl-ink-950:#0A0E1A` → `--cl-ink-700`), text scale, cyan `#00D4FF`/`#006B82` (live/active),
  amber `#FF9C1E`/`#7A4300` (upcoming), green `#22C55E` (positive result), red `#EF4444`/`#7A1214`
  (destructive/disputed/loss), magenta `#FF2E88` (reserved example team-accent slot only, never core
  UI chrome).
- Port typography: **Barlow Condensed** (display/headline, uppercase, bold, tracked-out),
  **Barlow** (body), **JetBrains Mono** (`.cl-mono` — labels/data/badges/timestamps), with local
  fallbacks.
- Port the signature **chamfered-corner motif** (`--cl-chamfer-size: 14px`, `clip-path`/`corner-
  shape: bevel` with `@supports` fallback to square corners), applied as one shared size, not
  per-screen ad hoc values.
- Port component-level tokens: `.cl-card` colored left-accent-bar-by-state, `.cl-badge` (state badge
  that **always pairs color with a text label, never color alone** — accessibility rule, testable),
  `.cl-btn` variants with 44px minimum touch target, `.cl-inline-alert`, `.cl-stat-tile`,
  `.cl-focusable:focus-visible` two-layer box-shadow ring, `prefers-reduced-motion` global collapse.
- Add a **CI check that lints the generated token output against a forbidden-value list** sourced
  directly from `copalibre-visual-identity.md`'s explicit non-goal: SebaSOFT Cyberpunk Yellow
  (`#f3e600`), CP2077/DATA_BLOB-labeled tokens, `#C5003C`, TRON grid patterns, and scanline effects
  must never appear in `packages/design-tokens`' output.
- Add a **style-guide route** (`/help/style-guide` or equivalent) rendering every token/component for
  visual smoke-testing, mirroring the pattern already used by `sebasoft-app`'s own
  `style-guide.astro`.

## Capabilities

### New Capabilities
- `design-tokens`: the platform provides one generated, dependency-free token source (CSS custom
  properties + Tailwind tokens) implementing the Broadcast Command Precision visual identity across
  every rendering technology in the monorepo, with an enforced guarantee that it never converges
  with `sebasoft-app`'s cyberpunk-wireframe token set.

### Modified Capabilities
(none)

## Impact

- **New code**: `packages/design-tokens` (token source definitions, CSS-custom-property generator,
  Tailwind-token generator, forbidden-value linter script), a style-guide route consuming the
  generated output.
- **Depends on**: `0001-bootstrap-monorepo-toolchain` (workspace scaffolding for `packages/design-
  tokens`, already stubbed there).
- **Consumed by**: every later frontend phase — `0012-public-web-astro-shell`, `public-live-and-bracket-
  surfaces`, `0014-control-web-shell-and-org-dashboard` and every subsequent control screen phase,
  `0020-help-docs-and-api-reference`, `0022-broadcast-venue-tv-surfaces`.
- **Reference source, not to be copied verbatim as files**: `../copalibre-design-system-fixed/
  shared/copalibre-system.css` is a hand-authored prototype; this phase re-implements its token
  values inside `packages/design-tokens`' generator, it does not import the prototype CSS file
  directly into production.
