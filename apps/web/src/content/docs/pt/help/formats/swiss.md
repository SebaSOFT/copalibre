---
title: Sistema Suíço
description: Mecânica de emparceiramento, grupos de pontuação, flutuadores e byes em torneios suíços.
capabilities:
  - tournament-engine/tournament-fixture-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## Visão Geral

O sistema suíço emparelha os participantes ao longo de várias rodadas sem eliminação imediata. Diferente das eliminatórias simples onde uma derrota elimina, ou de pontos corridos onde todos se enfrentam, no sistema suíço disputa-se um número pré-definido de rodadas contra oponentes com campanhas iguais ou similares.

## Mecânica de Emparceiramento

- **Grupos de Pontuação**: Em cada rodada após a primeira, os competidores são agrupados por pontos somados (ex.: 2-0, 1-1, 0-2).
- **Sem Revanches**: Competidores nunca enfrentam o mesmo adversário duas vezes na mesma fase suíça.
- **Flutuadores (Floaters)**: Quando um grupo de pontos tem número ímpar, um jogador "flutua" para o grupo vizinho para viabilizar as partidas.
- **Folgas (Byes)**: Se o total de participantes for ímpar, o participante elegível de menor ranking sem folga prévia recebe um bye (1 vitória com margem zero).

## Sistemas de Pontuação

- `match-wins`: Pontos por resultado da partida (1 vitória, 0.5 empate, 0 derrota).
- `game-points`: Saldo acumulado de games ou sets.

## Classificação e Desempates

Utiliza critérios de força de tabela (Buchholz e Sonneborn-Berger) para classificar com precisão os concorrentes rumo aos playoffs eliminatórios.
