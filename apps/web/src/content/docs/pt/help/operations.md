---
title: Operação e rastreabilidade
description: Regras para operar partidas e corrigir dados de torneio.
capabilities:
  - platform/async-job-processing
  - platform/persistence-layer
roles:
  - super-admin
---

## Console de partida

Registre eventos e o cronômetro a partir de um console autorizado. A projeção pública é atualizada a
partir de eventos duráveis e mantém uma versão para recuperação. Toda ação é gravada primeiro numa
fila local antes de ser enviada, para que uma conexão caída a deixe na fila para nova tentativa
automática em vez de perdê-la — veja [Console de partida ao vivo](/pt/help/control/match-console/)
para o comportamento completo.

## Correções

Nunca sobrescreva um resultado calculado. Uma correção exige motivo, autor e uma prévia de impacto
antes de afetar a classificação ou fases posteriores.

## Escalação

A escalação representa os jogadores selecionados por um participante para uma partida. Ela não
representa uma relação persistente entre uma pessoa e uma equipe.
