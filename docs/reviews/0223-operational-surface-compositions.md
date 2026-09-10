# Operational surface compositions — 0223 parity review

## Scope

The batched parity pass over every reference `0223` carries, run once across the whole set rather
than per component. It records what was checked, where the evidence is, and — deliberately — what
was **not** checked, because an unreviewed example reported as parity is worse than one reported as
unreviewed.

`0220` supplied the foundation: the owned public and TV tiers, the calibrated surface and typography
roles, the canonical fixtures and the Astro preview seam. Nothing here re-calibrates a token.

## The reference index is the entry point

`Reference index` (a top-level Storybook story, sourced from
`apps/web/src/control/components/ui/reference-index.ts`) maps every reference to the story that
renders it and the production surface that consumes it. `apps/web/src/reference-index.test.ts` keeps
it honest: it fails when a listed consumer path does not exist, when a listed story title is not
declared by any stories file, or when a row with no consumer carries no explanation.

Start a review there, not in the sidebar.

## What automated evidence covers

| Reference                                                | Story or route                                                  | Locale        | Viewport                              | Evidence                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------- | ------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Public header, in-flow menu                              | `/{org}/tournaments/{t}`                                        | en, es        | 375                                   | `e2e/operational-surface-compositions.spec.ts` — displacement, tab order, Escape and focus return, CTA in both places, locale change |
| Public page without JavaScript                           | `/{org}/tournaments/{t}`, `/es/...`                             | en, es        | 375                                   | same spec, `javaScriptEnabled: false` — navigation already expanded, no control that would do nothing                                |
| Ticker — pause                                           | `/{org}/tournaments/{t}`                                        | en            | default                               | same spec — keyboard-operated, `aria-pressed`, transport actually stops                                                              |
| Ticker — reduced motion                                  | `/{org}/tournaments/{t}`                                        | en            | default                               | same spec, `reducedMotion: 'reduce'` — wrapping static list, transform unchanged over time, declared height retained                 |
| Ticker — empty and stale                                 | `Public/Astro preview` — `ScoreTickerEmpty`, `ScoreTickerStale` | eight         | workbench                             | preview seam; states unit-covered in `ticker-items.test.ts`                                                                          |
| Bracket stage — graph                                    | `/{org}/tournaments/{t}/stages/1`                               | en            | 1024                                  | same spec — own scroll region, no body-level overflow, every node links to a report                                                  |
| Bracket stage — textual view                             | same route                                                      | eight         | 188, 374                              | same spec — outline visible below the floor, pending sources named                                                                   |
| Outcome legend                                           | same route                                                      | en            | default                               | same spec — each outcome carries its written word                                                                                    |
| Standings panel                                          | same route, and `Admin/Organisms/StandingsPanel`                | en            | default                               | same spec plus `StandingsPanel.test.tsx` — deciding comparator marked, chain in configured order, no footer where no chain           |
| Code block — file variant                                | `e2e/control-descriptor-profile-builders.spec.ts`               | es            | default                               | filename header, no dots or prompt, document matches what is submitted, refused clipboard reported, text still selectable            |
| Metric strip, step heading, inverse card, editorial card | `Admin/Molecules/*`                                             | eight         | workbench                             | unit suites plus their named consumers                                                                                               |
| Rendered faces and accent                                | `/{org}/tournaments/{t}/stages/1`                               | en            | default                               | same spec — display/body/mono roles and `--cl-primary` resolved from the stylesheet, chrome set in the mono face                     |
| Every reference, narrow floor                            | `/{org}/tournaments/{t}/stages/1`                               | **all eight** | 188                                   | same spec — no body-level overflow, controls keep non-empty accessible names                                                         |
| Representative widths                                    | same route                                                      | en            | 375, 768, 1024, 1440, 640 (200% zoom) | same spec — no body-level overflow at any of them                                                                                    |

Contrast is not sampled here: `packages/design-tokens/src/contrast.ts` gates every role pair at the
declared value, and `check:integrity` proves closure between what the stylesheet declares and what
every first-party surface references (332 files, 96 tokens, clean).

## What this pass found

**`[hidden]` was not hidden.** The UA rule `[hidden] { display: none }` sits at zero specificity, so
every class in the generated stylesheet declaring its own `display` outranked it. The ticker's pause
control and the header's menu toggle both stayed on screen with JavaScript disabled, doing nothing
when clicked — the exact failure they were written to avoid. The stylesheet now resets `[hidden]`
globally, which fixes the class of bug rather than the two known instances. Found by the
no-JavaScript end-to-end tests, not by eye.

**The header's action was an underlined button.** `.cl-btn` never removed the link underline; every
call site had been doing it inline, and the one that forgot shipped it. The class now owns
`text-decoration: none`, so a link wearing the button treatment is a button everywhere.

**The header row could not wrap.** At the 188px zoom floor the brand, locale control, action and
toggle cannot share one line, and a row that refused to wrap pushed the whole page sideways. The
actions group wraps now, and the action drops to its own line rather than off the screen.

**The reference's repeated drawer CTA was dropped.** The reference puts one in its drawer because
its drawer covers the row; this menu displaces the page instead, so the row stays on screen and a
second link with the same text and destination would have been visible beside the first.

**`.cl-stat-grid` and `.cl-metric-strip` were two rules for one pattern.** The dashboard's grid was
folded into the strip, which lays out any number of tiles rather than exactly three.

**Two predecessors have no production consumer.** `LiveMatchScorecard` — the live page renders
`LiveMatchHero` — and `LanguageSelector`, which duplicates the `LanguageSwitcher` the operator shell
actually uses. Both are recorded in the reference index with their reasons rather than adopted:
giving either a consumer changes what a shipped surface shows, which is not this change.

## What remains unreviewed

Stated plainly, and **not** recorded as parity achieved:

- **No human visual pass.** There are no screenshot baselines and no diffing service in this
  repository by design, so "reads like the reference" is a person's judgement and nobody has made it
  for these compositions yet. The automated evidence above proves behaviour, structure, layout
  containment and token resolution — not likeness.
- **Broadcast overlays over light and dark backgrounds at 1920×1080** were not exercised for the
  compositions this change adds. The ticker's broadcast presentation is unchanged in layout from
  `0220`'s, and the TV routes were not otherwise touched, but that is an argument rather than
  evidence.
- **Hover and focus appearance** is asserted structurally (visible focus is a token-level rule) but
  not compared against the reference by eye.
- **Double elimination** is out of scope: the new visual example is single elimination, the
  championship node is marked only where the last round holds exactly one match, and the textual
  view carries what the graph does not draw.

## Reproducing

```bash
yarn workspace @copalibre/web storybook            # the reference index and every story
yarn workspace @copalibre/web dev                  # required for the Astro preview stories
yarn test:e2e e2e/operational-surface-compositions.spec.ts
yarn test:e2e e2e/control-descriptor-profile-builders.spec.ts
yarn workspace @copalibre/design-tokens check:integrity
```

Run the end-to-end suite on its own: `apps/web/src/help-static.integration.test.ts` builds into the
same `apps/web/dist` Playwright serves from.
