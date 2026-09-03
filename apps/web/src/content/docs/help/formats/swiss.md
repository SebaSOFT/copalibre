---
title: Swiss System
description: Pairing mechanics, score groups, floaters, and byes in Swiss tournaments.
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

The Swiss system pairs participants across multiple non-elimination rounds. Unlike single or double elimination where a defeat knocks a player out, or round-robin where every entrant plays all competitors, Swiss participants contest a fixed number of rounds against opponents with identical or very similar accumulated records.

## Pairing Mechanics

- **Score Brackets**: In each round after the first, entrants are sorted into score groups based on accumulated points (for example: 2-0, 1-1, 0-2).
- **Rematch Prevention**: Competitors never face the same opponent more than once in the same Swiss stage.
- **Floaters**: When a score bracket contains an odd number of competitors, an entrant "floats" to the adjacent bracket to ensure complete pairings.
- **Byes**: When the total field size is odd, the lowest-ranked eligible player without a previous bye receives a bye (awarded 1 match win with zero score margin).

## Scoring Systems

CopaLibre supports two primary Swiss scoring models:

- `match-wins`: Awards competition points per match outcome (e.g. 1 point for a win, 0.5 for a draw, 0 for a loss).
- `game-points`: Accumulates individual game or set differentials for ranking within score groups.

## Standings & Progression

Swiss stage standings are evaluated using Strength-of-Schedule tiebreakers such as Buchholz and Sonneborn-Berger. Organizers commonly use Swiss stages to qualify the top 8 or 16 players into a single-elimination playoff bracket.
