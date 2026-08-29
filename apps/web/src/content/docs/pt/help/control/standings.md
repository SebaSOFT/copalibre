---
title: Classificação
description: O que representa a tabela de classificação de uma fase e como os desempates são explicados.
capabilities:
  - tournament-engine/standings-explainability
  - tournament-engine/statistic-collectors
roles:
  - admin
  - club-admin
  - referee
  - broadcaster
  - viewer
---

## Para que serve esta tela

Mostra a tabela de classificação de uma fase do torneio — quem está onde e por quê, com a
explicação do cálculo visível, não apenas o número final.

## Campos principais

- **Fase (stage)**: uma etapa do torneio (por exemplo, "fase de grupos" ou "playoffs") com seu
  próprio formato e sua própria tabela. Um torneio pode ter várias fases encadeadas.
- **Pontos/critérios**: os critérios de cálculo e desempate são os declarados pela disciplina — esta
  tela nunca inventa seu próprio critério, apenas aplica e mostra o que corresponde à configuração
  vigente no momento em que foi calculado.
- **Explicabilidade**: cada posição pode ser expandida para ver exatamente quais dados e qual regra
  determinaram aquele lugar — o rastro de decisão que produziu o número, não apenas o número.

## Quando é atualizada

A tabela reflete resultados já registrados e correções já aplicadas. Um resultado corrigido
recalcula toda a tabela a partir dos fatos vigentes, nunca ajustando o número manualmente.
