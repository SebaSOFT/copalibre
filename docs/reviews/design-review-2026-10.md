# Design review, November 2026

Closing review of the redesign, measured against `DESIGN.md`. It fixes nothing: each root cause below
has a small follow-up change, proposed for the owner to select. The changes are not applied.

## Setup

| Item    | Value                                                                                       |
| ------- | ------------------------------------------------------------------------------------------- |
| Date    | 2026-11-04                                                                                  |
| Data    | Panamericano demo, first game day 2026-11-03; 2 matches played, 1 in progress, 69 scheduled |
| Capture | `scripts/design-review-capture.mjs`, dark theme, Spanish and German                         |
| Pages   | 51 routes; 48 further captures at 188px in eight languages                                  |
| Light   | 11 routes in Spanish at their main widths                                                   |
| States  | 34 Storybook stories for error, empty, offline and loading, in Spanish and German           |
| Emails  | 7 templates, 98 captures at 600 and 375px, eight languages                                  |
| Help    | Captured from a production build; the dev server serves a placeholder there                 |

Widths follow the owner's device priority, decided on 2026-11-04. Mobile is a priority on the public
site only:

| Surface                 | Widths (px)          |
| ----------------------- | -------------------- |
| Public, 404, Help, auth | 375, 768, 1024, 1440 |
| Control                 | 768, 1024, 1440      |
| TV                      | 1280, 1920           |

## Summary

No page overflows horizontally in any capture. The atomic-composition gate passes, and Control has no
inline page styles and no arbitrary spacing values, so the system is sound at the structural level.
The light theme and the error, empty, offline and loading states hold, and TV meets every minimum type
size. The remaining problems sit in a few shared components, which is why most of them need only one fix.

| Severity | Root causes |
| -------- | ----------- |
| Blocker  | 1           |
| Major    | 12          |
| Minor    | 14          |

| 2026-10-21 audit status    | IDs (57) | F-items (26) |
| -------------------------- | -------- | ------------ |
| Fixed                      | 46       | 22           |
| Partly fixed               | 6        | 3            |
| Open                       | 3        | 0            |
| Blocked by RC1             | 1        | 1            |
| Accepted by owner decision | 1        | 0            |

## Root causes

Each root cause maps to one proposed change, named in the follow-up table below. The level names the
lowest component that owns the fix.

### Blocker

**RC1. Organization and Preferences never load.** Level: page.

The page requests `/api/auth/pat`, but the API serves `/auth/pat`. The API has no global prefix and the
gateway does not strip `/api`, so the request answers 404 and the whole page falls into its error state
([capture](assets/design-review-2026-10/organization-error.png)). The end-to-end tests stub `fetch` with
the same wrong URL, so they pass. Also, one failing secondary read takes down every section of the
page, including the organization settings that do not depend on tokens.

This conclusion comes from the API's answer and the gateway configuration. It was not reproduced on a
deployed installation.

### Major

**RC2. A field's height depends on its state.** Level: molecule (`Field`). Section: Inputs / Fields.

`Field` renders its message conditionally, with no reserved space. Measured in Storybook:

| State                       | Field height (px) |
| --------------------------- | ----------------- |
| Resting, required, disabled | 64.8              |
| One line of help or error   | 86.8              |
| Long help or error          | 158.8             |

On real screens, 5 of the 20 screens with fields mix heights. Tournament settings shows 65, 111 and
174px in one form ([capture](assets/design-review-2026-10/settings.png)). Separately,
`.cl-form-field` is a grid without `align-content: start`, so in a stretched row a neighbouring input
grows from 44 to 111px ([capture](assets/design-review-2026-10/field-row-alignment.png)). That stretch
does not show on real screens at rest, and it was not tested with live errors.

The owner's rule: a message sits in reserved fixed space, or appears as an icon with a popover. Also
remove the page override at `apps/web/src/styles/control.css:1065`, which raises help text above the
contract's `0.75rem`. `DESIGN.md` is silent on layout stability, so this is also a **contract gap**.

**RC3. Checkbox and radio draw a 44px box.** Level: atom. Section: Inputs / Fields.

The contract says a `1.25rem` square. `.cl-checkbox` and `.cl-radio` give the visible border to the
44px touch target, so a small tick floats in a large box, and tables gain a wide first column
([capture](assets/design-review-2026-10/registrations.png)). The target should stay 44px and the
visible box should be `1.25rem`.

**RC4. Select looks different from Input.** Level: atom. Section: Inputs / Fields.

Its value is centred while inputs align left. With no value it renders blank, with only the arrow
([capture](assets/design-review-2026-10/standings.png)). A disabled select in Zones measures 54px
against the contract's 44px. The cause of that last one is not confirmed.

**RC5. Input has no font size.** Level: atom. Section: Inputs / Fields.

Inputs render at 13.33px, the browser default. On phones, iOS zooms the page when focusing an input
under 16px, and the auth screens are phone-width surfaces. The iOS behaviour was not tested on a
device. `DESIGN.md` sets no input font size, so this is also a **contract gap**.

**RC6. Card header paints a strip with no padding.** Level: atom (`Card`). Section: Cards.

`.cl-card__header` takes the chrome fill and a border, but no padding, so titles touch the strip's
edge. It repeats on every card with a header ([capture](assets/design-review-2026-10/zones.png)), and
the light theme makes it more obvious ([capture](assets/design-review-2026-10/console-light.png)).

**RC7. Public lists are very long on phones.** Level: organism. Section: Hierarchy and Scanning.

At 375px, Matches measures 16,750px, Groups 10,679px and Live 10,613px. Live lists every upcoming match.
The contract asks for summaries before full lists, and phones are the public site's priority
([capture](assets/design-review-2026-10/matches-375.png)).

**RC8. Control and auth leak English.** Level: template. Section: Voice.

- Control declares `<html lang="en">` in every language, so screen readers use the wrong voice.
- The `auth.*` strings exist only in English, so the login screen mixes languages
  ([capture](assets/design-review-2026-10/login-375.png)). A code comment records this as pending.
- The audit trail shows the API's English refusal text.

**RC9. Public match presentation is unclear.** Level: organism. Section: Hierarchy and Scanning.

- "Ahora" shows three cards all titled "Partido 1"
  ([capture](assets/design-review-2026-10/overview.png)). The number repeats across the tournament, so
  it identifies nothing.
- A live match at 0–0 shows "—" on the public site and "0 : 0" on TV.
- Matches features an undecided cup match over the match that is live.

**RC10. Status text falls below AA.** Level: token. Section: Colors.

`#8c9ab5` on `#0e3e53` measures 4.04:1 at 12px, in the context rail on every Control page and on the
in-progress badge. The TV live badge measures 4.06:1. axe found 18 nodes on 11 of 18 pages in the dark
theme, and 1 in the light theme.

**RC11. Public markup fails semantic rules.** Level: organism. Section: Accessibility.

axe reports `aria-pressed` on non-buttons (25 nodes), `dt` and `dd` without a `dl` (48 nodes over 2
pages), `role="list"` with no items, and `aria-label` on a span with no role.

**RC12. Emails show a raw timestamp.** Level: worker builder. Section: Voice.

Invitations and password resets read "vence el 2026-11-11T18:30:00.000Z", in every language
([capture](assets/design-review-2026-10/email-invitation-375.png)). With images blocked, the organization
name appears twice in the header. The product is written both "CopaLibre" and "Copa Libre". No email
overflows at either width.

**RC13. The schedule repeats the officials list.** Level: template. Section: Hierarchy and Scanning.

The schedule is still 16,439px tall at 1440 (audit S3). In the capture, consecutive matches each render
the full officials list inline. The adopted composition is a table of slot, match, court, state and
actions; the page is an agenda.

### Minor

**RC14. Navigation names and targets disagree.** Level: organism. "Torneos" and "Panel" open the same
screen. Clubs and person pages highlight "Canchas y árbitros". The breadcrumb says "Fase 1" while the
stage is named "Fase de grupos".

**RC15. Live console state needs review.** Level: page. With a match in progress, Segment is empty,
Start still shows, an unlabelled box sits above the log note, and five primary actions appear. These
come from the capture; the console was not operated.

**RC16. Heading outline gaps remain.** Level: page. Platform and discipline jump h1 to h3 (audit H8).
Settings, ruleset and schedule render empty headings. Matches view keeps 225 display-face texts that are
not headings, down from 360 (audit H9).

**RC17. Raw values reach the screen.** Level: page. The live console shows an alias (audit R9). Platform
shows a principal UUID and an untranslated "active". Ruleset and discipline show raw keys such as
`score-difference`. Standings shows "Proyección v1". Recent activity shows "Otra actividad · Usuario" on
nearly every row (audit S5).

**RC18. The API reference does not exist.** Level: documentation. `AGENTS.md` describes a Scalar route,
and the dev server injects a placeholder for it, but the production build answers 404 and `apps/web/src`
has no Scalar page.

**RC19. An installation can lack a super-admin.** Level: product. With none active, no supported command
creates the first one: the API requires an existing super-admin and the CLI has no such command.

**RC20. Detector findings have no decision.** Level: organism. `cramped-padding` on `cl-image-frame`,
`side-tab` on `StandingsTable` and `TournamentCard`, and `broken-image` on `EntrantEmblem`, which looks
like a false positive.

**RC21. Control has no skip link.** Level: template. The public site has one. In Control, a keyboard
user is still in the rail after 14 Tab presses. Focus rings are visible.

**RC22. Unknown paths get the wrong page.** Level: page. A deep path under a tournament shows the adopted
404 ([capture](assets/design-review-2026-10/not-found.png)). `/es/a/b/c/d/e` shows "Organización no
encontrada" instead ([capture](assets/design-review-2026-10/unknown-path.png)).

**RC23. Public composition gaps.** Level: organism. See the comparison below.

**RC24. Setup composition gaps.** Level: page. See the comparison below. This includes audit W7.

**RC25. Operations composition gaps.** Level: page. See the comparison below.

**RC26. TV ignores the organization language.** Level: page. TV falls back to English without `?lang`
([capture](assets/design-review-2026-10/tv.png)).

**RC27. Public fallbacks leak English.** Level: module data. "TBD" is hard-coded and shows 72 times on the
Spanish Live page. Discipline descriptors declare column headers in `en` and `es` only, so German
standings read "P W D L".

## Composition comparison

| Page              | Result                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Dashboard         | Matches, except the KPI strip has two tiles, without matches today (RC25)                    |
| Settings, ruleset | Match; 4/8 split, table and section tabs are in place                                        |
| Create wizard     | Stepper matches; step 1 lacks season and the emblem drop zone (RC24)                         |
| Zones             | Groups grid matches; no dashed add card or group footer, and the select is too wide (RC24)   |
| Promotion         | Sections match; the unsaved-changes bar shows at rest when no plan is saved (RC24)           |
| Seeding           | Matches; two-pane workspace (setup F.4 is fixed)                                             |
| Venues, officials | Match; list plus rail                                                                        |
| Schedule          | Agenda instead of the adopted table (RC13)                                                   |
| Roles             | Matches                                                                                      |
| Analytics         | KPI strip and split match; no date range or export in the header (RC25)                      |
| Audit trail       | Table matches; filters lack actor, category and date range (RC25)                            |
| Public overview   | Now strip and bands match; hero lacks venue and discipline, standings header is thin (RC23)  |
| Public matches    | Tables and a collapsed filter bar replace the two-column cards (RC23, owner to choose)       |
| Public stage      | Matches                                                                                      |
| 404               | Matches where it shows (RC22)                                                                |
| TV kiosk          | Matches; at 1920 the score is 12vmin, clock 6, names 3.5 and table 2.2, all at their minimum |

Not compared: Preferences (RC1), invitation acceptance with a real token, the image crop dialog, the
descriptor and profile builders, and the TV live presentation and multi-match dashboard.

## Skill passes

- **`impeccable` detector** ran on `apps/web/src` and `packages/design-tokens/src`: RC20.
- **`impeccable` critique and audit** ran as one single-context pass over contact sheets of each surface,
  not page by page and not as its two isolated assessments. Treat it as a lighter pass than the skill
  intends. No critique snapshot was stored.
- **`ui-ux-pro-max`** was consulted on field errors and skip links; its guidance agrees with RC2 and RC21.
- **`frontend-design`** was applied to typography, structure and copy. It added nothing beyond RC9, RC16
  and RC17.

| Audit dimension          | Score (0–4) | Reason                                                            |
| ------------------------ | ----------- | ----------------------------------------------------------------- |
| Accessibility            | 2           | RC10 is on every Control page; RC11; RC21                         |
| Performance              | Not scored  | Not measured here; the Lighthouse budgets cover it in CI          |
| Theming                  | 3           | The light theme holds; RC6 and RC10 are token-level               |
| Responsive               | 3           | No overflow; RC7 is the main phone problem                        |
| Implementation integrity | 3           | The atomic gate passes; form atoms depart from the contract (RC2) |

## Contract holds

Not defects: the ink ground with a single cyan accent, tracked uppercase labels, mono data labels, and
middle-dot meta strings. Keeping the touch target at 44px also holds; only its visible box is RC3. An
error without prior data keeps the skeleton and shows a Retry toast, as the contract says. TV stays dark
in the light theme, and its backdrop stays low-contrast behind the panels.

Two items need a judgment call rather than a change: 108 entrant names are clipped with an ellipsis across
public lists, and date inputs show `mm/dd/yyyy` softened by a hint (audit R14), which follows the browser
and was not tested on a real locale.

## Audit status

Fixed unless listed here. S7, S11 and T3 were verified in this pass: a tournament in progress now reads
"En curso", rows are chronological, and the standings headers no longer carry overflowing tooltips.

| Status         | IDs                                                                 |
| -------------- | ------------------------------------------------------------------- |
| Partly fixed   | W7, H9, R5, S3, S5, S6                                              |
| Open           | H8, R9, R14                                                         |
| Blocked by RC1 | W8                                                                  |
| Accepted       | T4: Control at 375px is out of scope by the owner's device priority |

R6 is fixed on the public overview; the raw keys that remain in Control are in RC17.

| F-item status  | Items                                        |
| -------------- | -------------------------------------------- |
| Partly fixed   | Tournament setup F.2; operations F.3 and F.5 |
| Blocked by RC1 | Operations F.6                               |

## Follow-up changes

| Root cause | Change                             | Severity |
| ---------- | ---------------------------------- | -------- |
| RC1        | `pat-requests-reach-the-api`       | Blocker  |
| RC2        | `field-stable-height`              | Major    |
| RC3        | `checkbox-radio-visible-box`       | Major    |
| RC4        | `select-matches-input`             | Major    |
| RC5        | `input-font-size`                  | Major    |
| RC6        | `card-header-padding`              | Major    |
| RC7        | `public-long-lists-on-phones`      | Major    |
| RC8        | `control-auth-language`            | Major    |
| RC9        | `public-match-presentation`        | Major    |
| RC10       | `status-text-contrast`             | Major    |
| RC11       | `public-markup-semantics`          | Major    |
| RC12       | `email-readable-dates`             | Major    |
| RC13       | `schedule-officials-disclosure`    | Major    |
| RC14       | `navigation-names-and-targets`     | Minor    |
| RC15       | `live-console-in-progress-state`   | Minor    |
| RC16       | `heading-outline-and-display-face` | Minor    |
| RC17       | `readable-operator-values`         | Minor    |
| RC18       | `api-reference-route`              | Minor    |
| RC19       | `first-super-admin-path`           | Minor    |
| RC20       | `detector-residue`                 | Minor    |
| RC21       | `control-skip-link`                | Minor    |
| RC22       | `not-found-routing`                | Minor    |
| RC23       | `public-composition-gaps`          | Minor    |
| RC24       | `setup-composition-gaps`           | Minor    |
| RC25       | `operations-composition-gaps`      | Minor    |
| RC26       | `tv-organization-language`         | Minor    |
| RC27       | `public-language-fallbacks`        | Minor    |

## What this review did not cover

- **Organization and Preferences** could not be reviewed with real data (RC1).
- **Light theme** covered 11 routes, not all of them.
- **German** was read on standings and checked for overflow elsewhere. The other six languages were checked
  for overflow on flagged pages and read only in emails.
- **Chinese emails** could not be read: the capture machine has no CJK font, so that text shows as boxes.
- **Keyboard** was checked on the Control rail only. Dialogs, drag-and-drop and the live console were not.
- **Reduced motion** was not retested here.
- **Real clients and devices:** emails were rendered in Chromium, not in mail clients, and no phone was used.
