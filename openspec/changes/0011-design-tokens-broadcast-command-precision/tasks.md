## 1. Token source definition

- [ ] 1.1 Define primitive color scale (ink, text, cyan, amber, green, red, reserved team-accent slot) as a single TS/JS source object
- [ ] 1.2 Define semantic state token mapping (live, upcoming, disputed/destructive, positive result) onto primitives
- [ ] 1.3 Define typography tokens (Barlow Condensed, Barlow, JetBrains Mono) with local-font fallback stack
- [ ] 1.4 Choose and define a spacing scale (resolves the open question in design.md)
- [ ] 1.5 Define the chamfer-size token and radius tokens
- [ ] 1.6 Define motion/duration tokens including the `prefers-reduced-motion` collapsed variant

## 2. Generators

- [ ] 2.1 Implement `build:css` generator producing CSS custom properties for Astro/Pico/Starlight consumption
- [ ] 2.2 Implement `build:tailwind` generator producing Tailwind theme tokens for the React control app
- [ ] 2.3 Implement chamfer `clip-path`/`corner-shape: bevel` output with `@supports` square-corner fallback

## 3. Core component tokens

- [ ] 3.1 Implement `.cl-card` colored left-accent-bar-by-state tokens
- [ ] 3.2 Implement `.cl-badge` token contract requiring a paired text label (never color-only)
- [ ] 3.3 Implement `.cl-btn` variant tokens (primary/secondary/destructive/destructive-outline) with 44px minimum touch target
- [ ] 3.4 Implement `.cl-inline-alert` and `.cl-stat-tile` tokens
- [ ] 3.5 Implement `.cl-focusable:focus-visible` two-layer box-shadow focus-ring tokens

## 4. Forbidden-token compliance

- [ ] 4.1 Build the forbidden-value list from `copalibre-visual-identity.md` (`#f3e600`, `#C5003C`, CP2077/DATA_BLOB token-name patterns, TRON grid/scanline definitions)
- [ ] 4.2 Implement a script scanning generated CSS/Tailwind output against the forbidden-value list
- [ ] 4.3 Implement an ESLint/stylelint rule flagging raw color literals used outside `packages/design-tokens`

## 5. Style guide route

- [ ] 5.1 Build a style-guide route rendering every card/badge/button/alert/stat-tile component using the generated tokens
- [ ] 5.2 Include both the chamfer-supported and fallback rendering side-by-side for visual verification

## 6. Unit tests

- [ ] 6.1 Token-source-to-CSS-output generator unit tests
- [ ] 6.2 Token-source-to-Tailwind-output generator unit tests
- [ ] 6.3 Badge-requires-label contract unit test (build fails / validation error without a label)

## 7. Integration / build tests

- [ ] 7.1 Forbidden-token scan integration test: injecting a known-forbidden value into the source causes the scan script to fail
- [ ] 7.2 Full monorepo build test: `packages/design-tokens` output resolves correctly when imported by a placeholder Astro page and a placeholder React component

## 8. E2E / visual tests

- [ ] 8.1 Playwright visual snapshot of the style-guide route (baseline captured, diffed on future PRs)
- [ ] 8.2 Playwright test simulating `prefers-reduced-motion: reduce` and asserting no animated transition duration is applied
- [ ] 8.3 Playwright test rendering the style guide with `@supports` chamfer support disabled (simulated) and asserting square-corner fallback renders correctly

## 9. CI wiring

- [ ] 9.1 Add `packages/design-tokens` unit tests to the existing `unit-tests` job in `.github/workflows/ci.yml`
- [ ] 9.2 Add a new `forbidden-token-scan` job to `.github/workflows/ci.yml`, running the scan script from task 4.2 against the built output on every pull request
- [ ] 9.3 Add a new `visual-regression` job to `.github/workflows/ci.yml` running the style-guide Playwright snapshot test and uploading diffs on failure
