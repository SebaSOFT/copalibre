## Context

A working prototype token/component reference already exists at `../copalibre-design-system-fixed/
shared/copalibre-system.css`, hand-authored specifically to avoid CDN/JIT flakiness ("No CDN, no
runtime JIT — plain CSS, loads deterministically every time," per that file's own comments, already
read this session). See proposal.md for motivation. This document covers how that prototype becomes
`packages/design-tokens`' generator and how the sebasoft-app divergence is enforced structurally, not
just by convention.

## Goals / Non-Goals

**Goals:**
- One token source generates every consuming format (CSS custom properties, Tailwind config).
- The sebasoft-app non-goal is enforced by an automated CI check, not only written guidance.
- Every later frontend phase can consume this package without redefining any color/type/motion value.

**Non-Goals:**
- Building the actual Astro/React component library that *uses* these tokens — that is
  `0012-public-web-astro-shell` and `0014-control-web-shell-and-org-dashboard` onward.
- Redesigning the visual identity itself — already decided in `copalibre-visual-identity.md`; this
  phase implements it.
- Solving the pending "no concrete spacing scale chosen yet" gap noted in that same source doc as
  not yet validated — see Open Questions.

## Decisions

**Generate CSS custom properties and Tailwind tokens from one JS/TS token source, not two
hand-authored files.** The prototype (`copalibre-system.css`) is plain CSS by design (deterministic,
dependency-free) — appropriate for a static mockup but not for a monorepo needing the same values in
Tailwind's `@theme`/config format for the React control app. A single token-definition module (e.g.
a TS object) with two small generator scripts (`build:css`, `build:tailwind`) preserves the
prototype's "no runtime JIT" property for the public/Astro/Starlight consumers while still feeding
Tailwind for the control app. Alternative considered: maintain the CSS file and a separate Tailwind
config by hand — rejected, this is exactly the "consistent... while rendering technologies differ"
requirement `copalibre-platform-architecture.md` calls out, and hand-duplication is how tokens drift.

**Forbidden-token check is a literal string/value scan against the generated output, run in CI, not
just a design-review guideline.** `copalibre-visual-identity.md`'s non-goal is explicit and testable
(named hex values, named token strings) — treating it as CI-enforceable is more reliable than relying
on a designer's memory during future contribution. Alternative considered: only document the rule in
`design.md`/README — rejected because it does not survive a contributor who has not read this
document.

**Team-accent slot is a distinct, clearly-labeled token, never used in a core-chrome default.** The
prototype already marks its magenta example as "example team-accent slot only" — this phase
preserves that separation structurally (a distinct token namespace, e.g. `--cl-team-accent-*`,
excluded from any core-component default token references) so organizer-branded team colors (used
later in `0022-broadcast-venue-tv-surfaces`' organizer-branding overlay) can never accidentally leak into
system chrome.

## Risks / Trade-offs

- [Risk] A future contributor copies a raw hex value instead of a token reference, silently
  reintroducing drift the single-source generator was meant to prevent. → Mitigation: an ESLint/
  stylelint rule (wired into the zero-warnings gate from `0001-bootstrap-monorepo-toolchain`) flags raw
  color literals outside `packages/design-tokens` itself.
- [Risk] The forbidden-token list undercounts future cyberpunk-wireframe additions to sebasoft-app
  (list goes stale). → Mitigation: document the list's source (`copalibre-visual-identity.md`) so the
  check is trivially updatable, and note this as a review item whenever `sebasoft-app`'s own token
  file changes — a manual cross-repo watch, not automatable without shared tooling this phase does
  not build.
- [Risk] `corner-shape: bevel` is a very new CSS property; fallback coverage must be tested on real
  older browsers, not assumed from spec text. → Mitigation: explicit visual-regression task in
  `tasks.md` covering both the modern and fallback rendering paths.

## Open Questions

- No concrete spacing scale has been chosen yet in the source visual-identity research (explicitly
  flagged there as unresolved). This phase must choose one to ship a working token package — flagging
  here that this phase resolves it (a reasonable numeric scale, e.g. 4px-based), rather than leaving
  spacing undefined, since a design-tokens package without spacing tokens is not shippable. This does
  not change the specs above (they don't mandate a specific scale), so it is safe to resolve during
  implementation rather than beforehand.
