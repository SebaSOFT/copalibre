---
title: GSL Dual Tournament (Bracket Groups)
description: 4-player double-elimination groups featuring Opening, Winners, Elimination, and Decider matches.
capabilities:
  - tournament-engine/tournament-fixture-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Overview

Bracket Groups (commonly known in esports as the GSL format or dual tournament) divide participants into 4-player double-elimination pods. Two victories earn advancement to the playoffs; two defeats eliminate an entrant from the tournament.

## Group Match Flow

Each group contests up to 5 matches across 3 rounds:

1. **Round 1 (Opening Matches)**:
   - Match 1: Seed 1 vs Seed 4
   - Match 2: Seed 2 vs Seed 3
2. **Round 2 (Winners & Elimination Matches)**:
   - **Winners Match**: M1 Winner vs M2 Winner. The winner finishes 2-0 and advances as the Group 1st Seed.
   - **Elimination Match**: M1 Loser vs M2 Loser. The loser finishes 0-2 and is eliminated.
3. **Round 3 (Decider Match)**:
   - Winners Match Loser vs Elimination Match Winner. Both carry a 1-1 record.
   - The winner finishes 2-1 and advances as the Group 2nd Seed; the loser finishes 1-2 and is eliminated.

## Multi-Match Series

Every fixture in a GSL bracket group can be configured as a best-of series (e.g. Bo3 or Bo5). Standings within the group are determined strictly by qualification status.
