# Interaction state review

The control panel keeps a successful read in memory, scoped to the authenticated session and the
resource. A failed refresh keeps that content and marks its age. A first failed read keeps the
heading and skeleton. The failure notification offers an immediate retry; automatic retries wait
2, 4, 8, 16 and then 30 seconds. Cache never survives a document reload.

## Reading surfaces

Every reading page has Loaded, Loading, Failed, Stale and Empty workbench stories. The shared
route-state test mounts each page through its own narrow client fixture, checks the first failure,
reopens successful content with a failing client and distinguishes an empty response from a failure.

| Surface                | Pages                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Organization           | Dashboard, Analytics, AuditTrail, Preferences, RolesPermissions, VenueManagement, ClubManagement                 |
| Tournament             | TournamentHub, TournamentSettings, TournamentRuleset, RegistrationReview, ReportReview, MatchesView, LiveConsole |
| Competition            | StageHub, ZoneGroup, SeedingBuilder, PromotionPlan, Qualification, ScheduleBuilder, Standings                    |
| Match                  | MatchConsole, LoadMatchData                                                                                      |
| Identity and catalogue | PersonProfile, ClubPortalMembers, ClubPortalRoster, DisciplineDocument, PlatformAdministration                   |

BroadcasterStudio creates a display token on request. It has no initial reading operation and does
not automatically retry its token-creation mutation. Mutations on the other pages also retain their
explicit authorization and confirmation paths.

Analytics completion reads retry independently for each tournament. Schedule drafts preserve local
edits during refresh and recover saved placements from the in-memory cache when reopened offline.

## Console and public surfaces

The persistent console header names connectivity, queued and refused actions, and the last successful
synchronization. An optimistic event starts Queued, becomes Sent after the HTTP response and becomes
Confirmed only after its authoritative SSE projection acknowledges it. Refusals retain the server
reason beside the action. Playwright exercises real browser offline mode, reconnection, refusal and
an axe scan of the header.

Public live scores, the ticker and the TV dashboard keep their last rendered values when refresh
fails. Public organization-not-found and tournament-without-live-matches states use the same icon,
heading, explanation and navigation pattern through an Astro molecule. These states render with
JavaScript disabled; the tournament state names the next kickoff when one exists.

Dashboard TV pairing, role invitations and personal access tokens have a next action. A role without
permission receives an explanation naming who can act. Retry labels, state labels and queue counts
exist in all eight supported catalogues. Actions name their operation; failure copy names the read,
the retry delay and the available recovery.

## Verification and discovery

The unit suites are discovered by the existing `unit-tests-group` web workspace step. The API refusal
integration suite runs in `integration-tests-g1`; the browser specs are discovered by
`e2e-tests-shard`. No new CI job or path allowlist is necessary. `test:verify-discovery` checks root
Jest discovery, and Playwright's list command includes the dashboard resilience and offline-console
specs.

Ownership and atomic-composition checks cover the shared components and their stories. The public
Astro molecule has a real-renderer preview in the reference index. The component graph keeps zero
unresolved imports. Impeccable's source detector reports no primary findings on the shared interaction
components and stylesheet. DESIGN.md remains authoritative for the ink ground, cyan accent, tracked
labels and monospace data; contract holds.

The rendered detector flags the empty state's icon well as `icon-tile-stack`. This well is an
explicit interaction-state contract, paired with one contextual recovery action rather than a
repeated feature-card layout. The review retains it: contract holds.
