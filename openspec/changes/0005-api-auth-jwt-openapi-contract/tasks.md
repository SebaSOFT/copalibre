## 1. JWT verification

- [ ] 1.1 Add a JWKS client with cached-fetch and bounded TTL
- [ ] 1.2 Implement signature/algorithm/issuer/audience/expiration validation guard
- [ ] 1.3 Reject `alg: none` and any non-allowlisted algorithm explicitly
- [ ] 1.4 Extract subject/tenant(org)/scope claims into a typed request-context object

## 2. Policy layer

- [ ] 2.1 Implement the Public-read policy (no token required, sanitized output only)
- [ ] 2.2 Implement the Authenticated-interaction policy (resource-ownership: subject may act only on their own records)
- [ ] 2.3 Implement the Admin/control policy (tenant/resource scoped, stronger scopes, explicit confirmation required for destructive actions)
- [ ] 2.4 Implement the Integration policy stub (narrow scopes; full OAuth-client/webhook support deferred to a later phase, but the policy shape exists now)
- [ ] 2.5 Wire policy evaluation to reject with 403 (not 401) once authentication has already succeeded but authorization fails

## 3. Controllers

- [ ] 3.1 Implement thin read/write controllers over phase 4's Organization/Tournament repositories
- [ ] 3.2 Apply the JWT guard + policy layer to every route; explicitly tag each route's security plane

## 4. OpenAPI and contracts

- [ ] 4.1 Add `@nestjs/swagger` decorators to every controller/DTO
- [ ] 4.2 Add a build script generating the versioned OpenAPI JSON artifact
- [ ] 4.3 Add contract-lint tooling (schema completeness, every route tagged with a security plane)
- [ ] 4.4 Add a breaking-change check comparing the new artifact against the last published version
- [ ] 4.5 Scaffold `packages/contracts` with generated TypeScript types from the OpenAPI artifact

## 5. Browser auth flow contract

- [ ] 5.1 Document and implement the Authorization Code + PKCE flow contract consumed by phase 14's control web
- [ ] 5.2 Document the strict-stateless vs. pragmatic-persistent mode distinction; ship strict-stateless as the default

## 6. Unit tests

- [ ] 6.1 Unit test JWT validation for each rejection case (bad signature, wrong alg, wrong aud, expired, not-yet-valid)
- [ ] 6.2 Unit test policy evaluation for each of the four planes, including resource-ownership rejection

## 7. Integration tests

- [ ] 7.1 Nest testing-module integration tests for each controller route (200/401/403 cases)
- [ ] 7.2 Integration test: participant token cannot access another participant's resource
- [ ] 7.3 Integration test: token passed as a query parameter is treated as unauthenticated
- [ ] 7.4 OpenAPI snapshot test: generated artifact matches controller decorators exactly

## 8. CI wiring

- [ ] 8.1 Add an `openapi-contract` job (needs `install`, `typecheck`) to `.github/workflows/ci.yml`: generate the OpenAPI artifact, run contract-lint, run the breaking-change check against the last published artifact
- [ ] 8.2 Extend the `integration-tests` job (added in phase 4) to include `apps/api`'s guard/policy/controller test suite
