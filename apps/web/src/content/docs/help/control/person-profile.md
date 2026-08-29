---
title: Person profile
description: A person's photo, display name, nationality, and natural key, reached from the registration review screen.
capabilities:
  - control-web/identity-visuals
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

## What this screen does NOT do

It does not let you edit anything — nationality and photo are set from the registration review
screen's expanded row, not here. There is no separate "edit person" screen.
