---
title: Person profile
description: A person's photo, display name, nationality, and natural key, reached from the registration review screen.
capabilities:
  - control-web/identity-visuals
  - platform/personal-data-publication
roles:
  - admin
  - club-admin
---

## What this screen is for

Shows one registered person's identity: their photo (or a placeholder when none has been uploaded),
display name, nationality flag, and natural key — the same document number used to recognize them
across teams and competitions. Reached via "View profile" from the registration review screen's
expanded row.

## Key fields

- **Photo**: shown when one has been uploaded through the registration review screen; otherwise a
  placeholder silhouette renders instead, never a broken image.
- **Nationality**: the flag for the person's recorded ISO 3166-1 alpha-2 country code, when set.
- **Natural key**: the identifying document (e.g. a national identity number) recorded for this
  person, when one exists.
- **Public visibility**: an administrator can hide this person's profile from public pages. The
  choice is audited; match and tournament results do not change.

## Public profile privacy

When a profile is hidden, public pages show a translated “hidden at their request” label and omit the
photo, profile link, and career information. Tournament-wide youth-profile rules are managed in the
[tournament's Privacy settings](/help/control/tournament-authoring#participant-public-profiles).

This screen does not edit the person's name, nationality, photo or natural key. Those details remain
read-only here.
