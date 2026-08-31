---
title: Role manuals
description: What each role in CopaLibre can do, what it inherits, and what it cannot do.
capabilities:
  - control-web/roles-permissions
  - platform/help-and-api-docs
roles:
  - admin
  - club-admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
  - super-admin
---

Every role's authority comes from one declared mapping, not from reading every screen and route that
happens to mention it. This section has one page per role, each stating what that role can do (generated
directly from the mapping, so it cannot silently drift from what is actually enforced), what it inherits
and from which role, what it notably cannot do, and which control-panel screens it sees.

- [Admin](/help/roles/admin/)
- [Club admin](/help/roles/club-admin/)
- [Tournament admin](/help/roles/tournament-admin/)
- [Referee](/help/roles/referee/)
- [Broadcaster](/help/roles/broadcaster/)
- [Viewer](/help/roles/viewer/)
- [Super-admin](/help/roles/super-admin/)

Admin, club-admin, tournament-admin, referee, broadcaster and viewer are organization roles — held
within one organization, and meaningless outside it. Super-admin is different: an installation-level
role, one level above every organization, described on its own page.
