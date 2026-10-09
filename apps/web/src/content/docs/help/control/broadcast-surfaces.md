---
title: Broadcast and public surfaces
description: Display tokens for venue-TV and streaming-overlay rendering, and what the public site shows a spectator.
capabilities:
  - live-operations/broadcast-tv-surfaces
  - live-operations/tv-dashboard-localization
  - live-operations/public-live-surfaces
  - public-web/public-web-shell
  - public-web/tournament-winner-resolution
  - public-web/tournament-overview
  - design-system/operational-surface-parity
roles:
  - broadcaster
  - admin
---

## Display tokens

A `/tv/**` route — a full-rotation venue display or a single pinned match, either as a normal page or as
a transparent `?mode=overlay` for chroma-key capture in a stream — is authorized by a device-scoped
display token, not by a person's own login. A token is issued from the organization dashboard, bound to
one `/tv/**` path, and independently revocable: revoking one device's token stops only that device, and
every other device and every person's own session is unaffected.

A device holding a valid token needs no person present to keep working. It survives a power cycle without
re-entering credentials, and recovers silently from a lost connection or unavailable data — a `/tv/**`
surface never shows an error a person would need to dismiss.

## Broadcaster Studio

`/control/<organization>/tournaments/<tournament>/broadcaster` is a self-service console for a
streamer or media operator: it issues your own device-scoped display token automatically, lets you
pick the overlay mode (a lower-third strip over your camera, or a full-screen scene with no camera
needed) and a preview background (transparent, green screen, magenta screen, or a dark stadium
backdrop), and gives you a ready-to-paste OBS Browser Source URL with a live preview — no
administrator has to hand you a token or share their own login. While that overlay is open, a goal,
point, or card recorded live pops an animated callout naming the entrant and player, then dismisses
itself automatically; it never needs anyone at the venue to trigger or clear it.

## What the venue display shows

The full-rotation display cycles through the standings, the top performers, the tournament statistics and, when the featured stage has it, the bracket, then the match list. A `?view=standings` or `?view=matches` address pins that one section full-frame instead of rotating (`?view=fixtures` still works as the old name of `matches`). The champion recap of a finished tournament belongs to the rotating display alone. The header names the tournament's status: a tournament still being played shows a labelled clock to the minute in the organization's time zone, and a finished one shows the day its last match was played, with no running clock.

A pinned match — `/tv/<organization>/tournaments/<tournament>/stages/<stage>/matches/<number>` — is addressed the way the public match page is, by the match's number within its stage, and always shows that match's score, sides and recorded events, finished or not. A number the stage does not have is reported as a match that does not exist.

A stage can mix formats, so the display presents each zone by the format it plays:

- **Standings**: Every zone that ranks entrants in a table gets its own table, headed by the zone's name. Rows of different zones are never mixed in one ranking, and each table shows up to eight rows. A stage whose zones all play the stage's own format keeps a single table without a heading.
- **Bracket**: Zones that play an elimination format are drawn as a bracket.
- **Matches**: Lists every match of the tournament in a compact table, two to a row with abbreviations and score, one page at a time; the pages advance with the rotation, and a fixed `matches` view keeps paging.

The lower-third overlay is not affected: it names a match, not a stage.

### Overlays: one match, series and sets

An overlay (`?mode=overlay`) shows only the match it was given: the one named in its address (`/tv/<organization>/tournaments/<tournament>/stages/<stage>/matches/<number>?mode=overlay`) or, with `?court=<venue>`, the live match of that court. Opened with neither it says that no match is selected and shows no score, so two overlays never show the same match by accident. A match inside a series shows where the series stands (games won by each side and the game in play) next to the score, and a match played in sets shows the sets already played and the one in play, scored home side first, with the set label of the discipline in the page's language. A discipline played in timed segments names the segment in play instead. A match with none of these looks as before.

### The display launcher

`/tv` is a launcher that builds the address of a venue screen or an overlay: pick the organization, tournament and view (rotating dashboard, standings, match list, a pinned match, or the broadcast overlay), the background and the language. The language changes the launcher's own labels immediately, without reloading. Stages are listed with their number and name, and matches are grouped by zone and group with their round, the two entrants and their number (`#34`). The pinned-match and overlay views ask for a match, and the launch link carries it, so several overlays can each show their own match; an overlay may instead follow the live match of a court (`court=`).

## What a spectator sees on the public site

The public site (no login) shows a tournament's standings, bracket, and match reports as they are
published, at the same organization/tournament address the control panel and the `/tv/**` surfaces use. A
[series](/help/control/series) in progress shows its running score and which side is ahead on the public
bracket the same way it does in the control panel, and a match not yet scheduled is shown as such, never
guessed at. Completed elimination tournaments identify champions from the championship fixture even
when classification fixtures share its final round; a tied championship can show both co-champions.

A tournament whose playoff stage resolved more than one final zone — a Gold/Silver bracket split, for
example — shows a champions podium on its overview page once finished: one entry per resolved zone,
naming every declared champion and any explicitly resolved runner-up and third place. The page never
invents a rank a zone did not explicitly resolve, and shows no podium at all for a single-zone
tournament or one that has not finished yet.

On the TV kiosk, the recap of a finished tournament that was decided zone by zone lists the champion or co-champions of each zone of the last stage under the zone's name, the same winners the public overview shows. A tournament with one champion keeps the single-champion presentation, and a standings leader of an earlier stage is never presented as the champion.

## What you cannot do here

Neither surface accepts input from a spectator or a kiosk device: both are read-only renderings of
already-published data. Changing what is published happens in the organization's own control panel, not
on the public or `/tv/**` surfaces themselves.
