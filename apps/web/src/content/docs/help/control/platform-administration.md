---
title: Platform administration
description: Create organizations, manage installation super-admins, and install discipline/profile modules.
capabilities:
  - control-web/platform-administration
  - platform/default-module-catalogue
roles:
  - super-admin
---

## What this screen is for

This is the installation's own console, reached only by a `super-admin` — one level above any
organization. Nothing here is scoped to a single organization; every action here affects the whole
installation.

## Organizations

A new organization is created here — its alias, display name, primary language, and timezone — and its
first administrator is invited by email in the same step. An organization created without an invited
administrator has nobody who can sign in and manage it, so the two are done together.

## Users

Any organization's user list is reached by its alias, so a super-admin can drill in to change a user's
role or status without needing membership in that organization themselves.

## Super-admins

Installation super-admins are listed, created, and removed here. A super-admin is created by principal
ID — the identity must already exist (having signed in at least once) before it can be promoted.

## Modules

Discipline and tournament-profile modules are installed here by alias, an optional version range, and an
optional alternate source for a module not in the default catalogue. Installed modules are listed with
their kind, version, and source, and can be verified or removed. Checking for updates compares installed
versions against what each module's source currently publishes, without installing anything until asked.

## What you cannot do here

Nothing here reaches into an organization's own tournament data — no fixture, result, or registration is
visible or editable from this screen. That is every organization's own control panel, reached by an
organization administrator, not by a super-admin acting through this console.
