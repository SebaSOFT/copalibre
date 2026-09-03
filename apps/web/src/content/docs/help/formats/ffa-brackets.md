---
title: Multi-Round FFA Brackets
description: Multi-lobby elimination tournaments with configured progression cutoffs per lobby across rounds.
capabilities:
  - tournament-engine/tournament-fixture-engine
  - tournament-engine/placement-stage-format
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Overview

Multi-round Free-for-All (FFA) Brackets adapt knockout tournament progression to games with large multi-entrant matches (such as battle royales, kart racers, and battle arenas). Competitors compete in lobbies of size $M$, and only the top $K$ finishers from each lobby advance to subsequent rounds.

## Tournament Progression

- **Round 1 Lobbies**: Entrants are seeded across initial lobbies using snake seeding.
- **Advancement Cutoff**: Each lobby qualifies a configured number of top finishers (e.g. top 8 out of 16).
- **Subsequent Rounds**: Qualifiers from different lobbies are merged into new lobbies until reaching the Grand Final lobby.
- **Scoring Integration**: Placements and in-match statistics (e.g. eliminations or race times) feed directly into the discipline's placement scoring table.
