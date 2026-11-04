# Design review, November 2026

Closing review of the redesign, measured against `DESIGN.md`. It fixes nothing: each remaining root
cause below is proposed as one small change for the owner to select.

**Status: partial.** See [What this review did not cover](#what-this-review-did-not-cover).

## Setup

| Item    | Value                                                                                         |
| ------- | --------------------------------------------------------------------------------------------- |
| Date    | 2026-11-04                                                                                    |
| Data    | Panamericano demo, first game day 2026-11-03; 2 matches played, 1 in progress, 69 scheduled   |
| Capture | `scripts/design-review-capture.mjs`, dark theme                                               |
| Pages   | 50 routes, 324 first-pass captures in Spanish and German, plus 48 at 188px in eight languages |
| Help    | Captured from a production build; the dev server serves a placeholder there                   |

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
The remaining problems sit in a few shared components, which is why most of them need only one fix.

| Severity | Root causes |
| -------- | ----------- |
| Blocker  | 1           |
| Major    | 8           |
| Minor    | 7           |

| 2026-10-21 audit status    | IDs (57) | F-items (26) |
| -------------------------- | -------- | ------------ |
| Fixed                      | 43       | 18           |
| Partly fixed               | 6        | 3            |
| Open                       | 3        | 0            |
| Blocked by RC1             | 1        | 1            |
| Not verified               | 3        | 4            |
| Accepted by owner decision | 1        | 0            |

## Root causes

Each root cause maps to one proposed follow-up change. The level names the lowest component that owns
the fix.

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
contract's `0.75rem`.

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
edge. It repeats on every card with a header
([capture](assets/design-review-2026-10/zones.png)).

**RC7. Public lists are very long on phones.** Level: organism. Section: Hierarchy and Scanning.

At 375px, Matches measures 16,750px, Groups 10,679px and Live 10,613px. Live lists every upcoming match.
The contract asks for summaries before full lists, and phones are the public site's priority
([capture](assets/design-review-2026-10/matches-375.png)).

**RC8. The interface language leaks.** Level: template. Section: Voice.

- Control declares `<html lang="en">` in every language, so screen readers use the wrong voice.
- The `auth.*` strings exist only in English, so the login screen mixes languages
  ([capture](assets/design-review-2026-10/login-375.png)). A code comment records this as pending.
- TV falls back to English without `?lang`, ignoring the organization's language
  ([capture](assets/design-review-2026-10/tv.png)).

**RC9. Public match presentation is unclear.** Level: organism. Section: Hierarchy and Scanning.

- "Ahora" shows three cards all titled "Partido 1"
  ([capture](assets/design-review-2026-10/overview.png)). The number repeats across the tournament, so
  it identifies nothing.
- A live match at 0–0 shows "—" on the public site and "0 : 0" on TV.
- Matches features an undecided cup match over the match that is live.

### Minor

**RC10. Navigation names and targets disagree.** Level: organism. "Torneos" and "Panel" open the same
screen. Clubs and person pages highlight "Canchas y árbitros". The breadcrumb says "Fase 1" while the
stage is named "Fase de grupos".

**RC11. Live console state needs review.** Level: page. With a match in progress, Segment is empty,
Start still shows, an unlabelled box sits above the log note, and five primary actions appear. These
come from the capture; the console was not operated.

**RC12. Heading outline gaps remain.** Level: page. Platform and discipline jump h1 to h3 (audit H8).
Settings, ruleset and schedule render empty headings.

**RC13. Raw values reach the screen.** Level: page. The live console shows an alias (audit R9). Platform
shows a principal UUID and an untranslated "active". Ruleset and discipline show raw keys such as
`score-difference`. Standings shows "Proyección v1".

**RC14. The API reference does not exist.** Level: documentation. `AGENTS.md` describes a Scalar route,
and the dev server injects a placeholder for it, but the production build answers 404 and `apps/web/src`
has no Scalar page.

**RC15. An installation can lack a super-admin.** Level: product. With none active, no supported command
creates the first one: the API requires an existing super-admin and the CLI has no such command.

**RC16. Smaller items.** The detector reports `cramped-padding` on `cl-image-frame`, and `side-tab` on
`StandingsTable` and `TournamentCard`. The schedule is still 16,439px tall (audit S3). Date inputs show
`mm/dd/yyyy`, softened by a hint (audit R14). In Zones, the select spans 1136px beside 720px cards (audit
W7). Matches view keeps 225 display-face texts that are not headings, down from 360 (audit H9). 108
entrant names are clipped with an ellipsis across public lists; that needs a judgment call.

## Contract holds

Not defects: the ink ground with a single cyan accent, tracked uppercase labels, mono data labels, and
middle-dot meta strings. Keeping the touch target at 44px also holds; only its visible box is RC3.

## Audit status

Fixed unless listed here.

| Status         | IDs                                                                 |
| -------------- | ------------------------------------------------------------------- |
| Partly fixed   | W7, H9, R5, S3, S5, S6                                              |
| Open           | H8, R9, R14                                                         |
| Blocked by RC1 | W8                                                                  |
| Not verified   | S7, S11, T3                                                         |
| Accepted       | T4: Control at 375px is out of scope by the owner's device priority |

R6 is fixed on the public overview; the raw keys that remain in Control are in RC13.

| F-item status  | Items                                                |
| -------------- | ---------------------------------------------------- |
| Partly fixed   | Tournament setup F.2; operations F.3 and F.5         |
| Blocked by RC1 | Operations F.6                                       |
| Not verified   | Tournament setup F.4; operations F.1 and F.4; TV F.1 |

## What this review did not cover

- **Review skills.** Only the `impeccable` detector ran, and on three public pages plus a source scan.
  The `impeccable` critique and audit, `ui-ux-pro-max` and `frontend-design` passes did not run. The
  findings above come from measurements and direct reading of the captures.
- **Transactional emails** were not rendered.
- **Light theme** was not captured. TV backdrops were not checked.
- **German** was checked for overflow only.
- **Adopted compositions** were not compared one by one.
- **Storybook states** (error, empty, offline, loading) were not captured, apart from the field states.
- **Organization and Preferences** could not be reviewed with real data (RC1).
- **Accessibility** was limited to heading outlines and language. Keyboard, focus and contrast checks
  did not run.
