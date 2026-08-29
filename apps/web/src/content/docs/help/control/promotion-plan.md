---
title: Promotion plan
description: Configure how a zone's groups combine into the next stage's seeding — reviewed before acting.
capabilities:
  - tournament-engine/stage-qualification
roles:
  - admin
---

## What this screen is for

Once a zone's groups have finished their round-robin play, this screen configures how many entrants
advance from each group and how those groups combine into one ordered list for the next stage. It then
shows that computed, ordered list for review — it never creates or changes any seeding on its own.

## Key fields

- **Entrants advancing per group**: how many entrants from each group promote.
- **Bands**: when the next stage has more than one zone, which contiguous slice of the combined list
  routes to which of that stage's zones.
- **Review**: the ordered candidate list this plan would promote, computed the same way every time —
  nothing is written to the next stage until an operator explicitly configures its seeding from the
  seeding builder, which pre-fills from a reviewed plan when one exists.

## What you cannot do here

If a group has an unresolved tie at its own cut line, this screen reports that rather than presenting
an incomplete list — resolve the tie (an audited correction, if the source result needs one) before a
combined list can be computed.
