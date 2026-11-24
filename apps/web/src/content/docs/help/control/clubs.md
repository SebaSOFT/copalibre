---
title: Clubs
description: List, create, and edit an organization's clubs, and upload their emblems.
capabilities:
  - control-web/identity-visuals
  - public-web/club-page
  - public-web/organization-club-history
roles:
  - admin
  - club-admin
---

## What this screen is for

An organization's clubs are managed here: create one, edit its name/alias/abbreviation, and upload or
replace its emblem. A club's emblem is shown wherever the club appears — its entrant listings, its
public organization page grid — with a placeholder used until one is uploaded.

## Key fields

- **Name**: the club's full name.
- **Alias**: a URL-safe identifier, unique within the organization. Suggested from the name at
  creation if left blank.
- **Abbreviation**: a short label shown on constrained surfaces (e.g. a scoreboard).
- **Emblem**: an image uploaded through this screen, replacing any previous one.

## Where a club appears publicly

The alias is the club's public address. A club with an alias gets:

- **A club page in each published tournament it plays in**, at
  `/{organization}/tournaments/{tournament}/clubs/{alias}`. It shows the club's status, next match,
  standing, results, squad and knockout path. The tournament's club index at
  `/{organization}/tournaments/{tournament}/clubs` lists its clubs and links to these pages.
- **An organization club page**, at `/{organization}/clubs/{alias}`. It lists the published
  tournaments the club played in the organization, with its titles and podium places, and links to its
  page in each one. The organization page links each club to it.

Team names across the public pages link to their club's page. A club without an alias has no public
page.

Changing a club's alias keeps old links working: a visitor who opens a page under a former alias is
moved permanently to the same page under the current one.

## What you cannot do here

A club's teams and their rosters are managed elsewhere — this screen only manages a club's own
identity fields and image.
