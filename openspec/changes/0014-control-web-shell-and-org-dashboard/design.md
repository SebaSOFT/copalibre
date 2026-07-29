## Context

`apps/web` currently has only a placeholder `/control` mount point from `bootstrap-monorepo-
toolchain`. The component stack, session model, and license posture are already decided in
`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md` ("Control web",
"License and AGPL policy", "JWT access and stateless API nodes"). A1's visual layout already exists
as a static mockup at `../copalibre-design-system-fixed/a1-organization-dashboard/code.html`. This
design covers standing up the shell and wiring A1 to real data — not choosing the stack.

## Goals / Non-Goals

**Goals:**
- Every later control-web phase (15–18) builds inside this shell without re-deriving auth/layout/API-client wiring.
- The two supported JWT modes from the architecture doc (strict stateless vs. pragmatic persistent)
  are both representable by this shell's session module, even though this phase only exercises strict
  stateless mode end-to-end (no refresh-token/identity-provider integration exists yet).
- `THIRD_PARTY_NOTICES.md` is a living artifact from the first copied component onward, not a
  retrofit before release.

**Non-Goals:**
- No identity-provider integration — that remains an explicit open gate in chaos-vault; this phase
  builds the PKCE-compatible client contract against a stub/mock authorization server for now.
- No screens beyond A1 — A2–A7 are phases 15–18.
- No RBAC enforcement UI (role-based visibility) — that's `0018-roles-permissions-rbac` (phase 18); this
  phase's dashboard scoping requirement is organization-membership scoping only, not fine-grained role gating.

## Decisions

**Owned component source lives in-repository, not as an npm dependency.** Per the architecture doc's
AGPL rationale: "the component implementation lives in SebaSOFT's repository rather than behind a
framework-specific styling runtime or opaque abstraction." Each shadcn/ui component is copied in,
reviewed, and tracked — never pulled from a proprietary registry or paid block per the doc's explicit
prohibition.

**Session module abstracts strict-vs-persistent mode behind one interface** so identity-provider
integration (a later, separately-gated decision) can plug in without changing every screen that
consumes `useAuth()`. Alternative considered: hardcode strict-stateless now and rework later —
rejected because the architecture doc treats both modes as first-class, and reworking every
screen's auth assumption later is more expensive than abstracting once now.

**A1's dashboard stats and activity feed are read from the API client's generated types
(`packages/contracts`), not hand-written interfaces**, so a breaking API change is caught by
TypeScript at build time rather than silently drifting.

## Risks / Trade-offs

- [Risk] Building a real screen (A1) against a mocked identity provider risks integration surprises
  once a real OIDC provider is selected. → Mitigation: the session module's interface is designed
  exactly to the architecture doc's Authorization Code + PKCE contract, not to the mock's specifics,
  so swapping the mock for a real provider should not require changing consuming screens.
- [Risk] In-repository component copies can drift from upstream shadcn/ui fixes. → Mitigation:
  `THIRD_PARTY_NOTICES.md` records the source version per component, making future audits/upgrades
  traceable.
- [Risk] Cross-organization data leakage in the dashboard query is a real security risk, not just a
  UX bug. → Mitigation: the organization-scoping requirement is enforced server-side (API policy
  layer in `0005-api-auth-jwt-openapi-contract`), and this phase's integration tests assert it explicitly
  rather than trusting client-side filtering alone.

## Open Questions

- Exact mock/stub strategy for the identity provider during this phase's development (a local
  fake-OIDC server vs. a hand-rolled JWT minting script) is an implementation detail left to
  `tasks.md`; it does not change this phase's spec-level behavior.
