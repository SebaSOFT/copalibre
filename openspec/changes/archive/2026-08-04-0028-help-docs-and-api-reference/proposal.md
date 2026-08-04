## Why

CopaLibre's architecture already selects Starlight and Scalar for `/help/**` documentation and the
interactive OpenAPI reference
(`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md` "Consolidated web, help,
and API reference"), backed by a documented framework bake-off against Next.js+Nextra, Nuxt,
SvelteKit, TanStack Start, and VitePress
(`../chaos-vault/50-research/help-documentation-and-openapi-reference-2026.md`) that chose Astro/
Starlight specifically to avoid replacing the working Astro assumption everywhere else in the stack.
However, the source docs are explicit that **Starlight is pre-1.0/beta at the time of this decision**
— the architecture doc says to "pin its version and make its integration a build-test gate." This
phase exists to actually run that gate, not just declare the decision, and to have a documented
fallback if the spike fails.

## What Changes

- Spike task (first, gating everything else in this phase): validate Astro + Starlight + `@scalar/
  astro` navigation, static build success, and CSS isolation from the rest of `apps/web` (public and
  `/control/**` styling must not leak into or be leaked into by Starlight's theme). Explicit go/no-go
  criteria; if it fails, fall back to the documented Next.js+Nextra alternative from the same
  framework-evaluation research, as a **separate, later change** (not silently swapped in-place here).
- `/help/**` Starlight documentation routes (Markdown/MDX, navigation, table of contents, search,
  i18n).
- `/help/api-reference/` interactive OpenAPI reference through the pinned Scalar CDN in a plain
  Astro document. `@scalar/astro` 0.4.12 supports only Astro 4/5, so its official component cannot
  be installed into CopaLibre's Astro 7 application. The Starlight sidebar forces a full document
  load for this route, allowing the CDN renderer to initialize without relying on client-transition
  script execution.
- `public/openapi/v1.json` copied from a reviewed, versioned, CI-generated build artifact — the
  static build never fetches a live API.
- `Try It` is disabled by default; any future interactive console must target an explicit
  same-origin or documented environment and never publish tokens, internal hosts, or production
  credentials in static documentation.

## Capabilities

### New Capabilities
- `help-and-api-docs`: Starlight-powered `/help/**` documentation and a Scalar-powered, statically
  generated OpenAPI reference at `/help/api-reference/`, gated behind a validated Starlight
  integration spike.

### Modified Capabilities
(none)

## Impact

- **New routes**: `apps/web` `/help/**`, `/help/api-reference/`.
- **New build step**: OpenAPI artifact generation from `apps/api` (phase 5's contract), contract
  lint/breaking-change checks, artifact copy into the Astro build — all before the static build runs.
- **Risk concentration**: this is the one phase whose primary technology choice (Starlight) is
  explicitly unproven at decision time; its tasks.md is structured so the spike's outcome is known
  before any other work in this phase proceeds.
