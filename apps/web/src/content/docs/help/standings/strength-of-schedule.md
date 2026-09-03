---
title: Strength of Schedule Tiebreakers
description: Buchholz, Median-Buchholz, and Sonneborn-Berger tiebreaking formulas.
capabilities:
  - tournament-engine/standings-explainability
  - tournament-engine/rules-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Overview

In Swiss and open tournament formats, competitors face varying opponent schedules. Strength-of-Schedule (SoS) metrics reward participants whose opponents earned higher results throughout the competition.

## Supported Formulas

- **Buchholz**: The sum of all tournament points earned by an entrant's opponents.
- **Median-Buchholz (Cut 1 / Cut 2)**: Buchholz score excluding the single highest and lowest scoring opponents (Cut 1), or the top 2 and bottom 2 (Cut 2), reducing the impact of extreme outliers.
- **Sonneborn-Berger**: The sum of points earned by opponents whom the entrant defeated, plus half the points earned by opponents with whom the entrant drew.

## Configuration

Tiebreak pipelines declare Strength-of-Schedule parameters in priority order:

```jsonc
[
  { "id": "points", "direction": "higher_wins" },
  { "id": "buchholz", "direction": "higher_wins" },
  { "id": "sonneborn-berger", "direction": "higher_wins" },
]
```
