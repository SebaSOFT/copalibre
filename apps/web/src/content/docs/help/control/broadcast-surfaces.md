---
title: Broadcast and public surfaces
description: Display tokens for venue-TV and streaming-overlay rendering, and what the public site shows a spectator.
capabilities:
  - live-operations/broadcast-tv-surfaces
  - live-operations/public-live-surfaces
  - public-web/public-web-shell
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

## What a spectator sees on the public site

The public site (no login) shows a tournament's standings, bracket, and match reports as they are
published, at the same organization/tournament address the control panel and the `/tv/**` surfaces use. A
[series](/help/control/series) in progress shows its running score and which side is ahead on the public
bracket the same way it does in the control panel, and a match not yet scheduled is shown as such, never
guessed at.

## What you cannot do here

Neither surface accepts input from a spectator or a kiosk device: both are read-only renderings of
already-published data. Changing what is published happens in the organization's own control panel, not
on the public or `/tv/**` surfaces themselves.
