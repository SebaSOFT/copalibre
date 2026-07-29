## 1. Starlight spike (gates all other work in this phase)

- [ ] 1.1 Add Starlight to `apps/web` at a pinned version, alongside existing public/control routes
- [ ] 1.2 Verify navigation, search, and table-of-contents work under Astro's view-transition routing
- [ ] 1.3 Verify a full static build succeeds with Starlight included
- [ ] 1.4 Verify CSS isolation: no `packages/design-tokens` custom property is overridden by Starlight's theme, and no Starlight style leaks into public/control routes
- [ ] 1.5 Record go/no-go result; if "no-go", stop this phase's remaining tasks and open a follow-up change proposing the Next.js+Nextra fallback instead

## 2. OpenAPI artifact pipeline (proceeds regardless of spike outcome — independent of Starlight)

- [ ] 2.1 Generate a versioned OpenAPI document from `apps/api`'s Nest build
- [ ] 2.2 Add contract-lint and breaking-change checks against the generated document
- [ ] 2.3 Copy the reviewed artifact to `public/openapi/v1.json` as a build step, never a runtime fetch
- [ ] 2.4 Add a secret/internal-hostname scan of the generated artifact

## 3. Help documentation routes (only if spike is "go")

- [ ] 3.1 Author `/help/**` navigation structure and initial Markdown/MDX content
- [ ] 3.2 Configure Starlight i18n consistent with the rest of the site's locale-prefix convention
- [ ] 3.3 Apply `design-tokens` (phase 11) to the Starlight theme

## 4. API reference route (only if spike is "go")

- [ ] 4.1 Integrate `@scalar/astro` at `/help/api-reference/` with `renderMode="client"`
- [ ] 4.2 Point Scalar at the locally-served `public/openapi/v1.json`, never an external/proxy source
- [ ] 4.3 Confirm `Try It` is disabled by default

## 5. Unit tests

- [ ] 5.1 Unit test the OpenAPI-artifact-generation step's output against a known Nest controller fixture
- [ ] 5.2 Unit test the secret/internal-hostname scan against fixtures containing planted secrets (must detect) and clean input (must pass)

## 6. Integration tests

- [ ] 6.1 Integration test: contract-lint fails the build on an intentionally introduced breaking API change
- [ ] 6.2 Integration test: `/help/api-reference/` build succeeds and renders correctly with the API process not running

## 7. E2E tests

- [ ] 7.1 Playwright: navigate `/help/**` via Starlight's view-transition routing and verify no broken navigation/search
- [ ] 7.2 Playwright: open `/help/api-reference/` and verify the OpenAPI reference renders without any network call to a live API
- [ ] 7.3 Playwright: verify no "Try It" request-execution control is present by default

## 8. CI wiring

- [ ] 8.1 Add a `docs-build` job to `.github/workflows/ci.yml` running the Starlight spike's build-and-CSS-isolation checks (task 1) as a required gate before this capability's other jobs run; add `openapi-contract-lint` job (task 2.2) and this capability's Jest/integration/Playwright specs to the existing test jobs' globs
