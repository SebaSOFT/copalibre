---
title: Organization dashboard
description: Organization activity, tournament summaries, and quick statistics.
capabilities:
  - control-web/organization-dashboard
  - design-system/interaction-states
roles:
  - admin
  - club-admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

The dashboard is the home screen for one organization. It brings together quick statistics, that
organization's tournaments, display-device activity, and recent activity.

## Quick statistics

The summary reports active tournaments, pending registrations, and matches scheduled for today.
These totals cover the organization selected in the control panel.

## Tournaments

Each tournament card provides a summary and links to its operational screens. Depending on your
permissions and the tournament's state, its actions may also let you export tournament data or
configuration, manage broadcast display tokens, or archive the tournament. Operators with permission
to create tournaments can start one from this section.

## Display devices and recent activity

The display-device section reports the heartbeat state of broadcast devices associated with the
organization's tournaments. Recent activity lists the latest recorded organization actions.

## Loading, empty, and stale data

While a screen loads, shaped placeholders show where its data will appear. A real empty result is
different from a failed read: when a refresh fails after data was loaded, the dashboard keeps the
previous data, marks it stale with its age, and offers Retry in a notice. A failed first read keeps
the loading state and retries automatically. Empty results explain what is missing and offer an
action when your role can resolve it; otherwise, they say who can.
