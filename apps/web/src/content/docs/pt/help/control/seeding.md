---
title: Sorteio e chaveamento
description: O que são as cabeças de chave, os byes, e as restrições de sorteio que esta tela respeita.
capabilities:
  - tournament-engine/bracket-seeding-builder
  - tournament-engine/draw-constraints
roles:
  - admin
---

## Para que serve esta tela

Monta o sorteio/chaveamento de uma fase: atribui a cada participante uma posição inicial (uma
"cabeça de chave"), respeitando as restrições declaradas para essa disciplina/formato.

## Campos principais

- **Cabeça de chave (seed)**: a posição de um participante no chaveamento — determina contra quem
  ele joga primeiro e em qual rodada poderia cruzar com outras cabeças de chave altas.
- **Bye**: quando o número de participantes não completa um chaveamento perfeito, algumas posições
  "avançam de rodada" sem jogar. A tela os distribui sempre seguindo a mesma regra, nunca ao acaso.
- **Restrições de sorteio**: regras declaradas (por exemplo, que dois participantes do mesmo clube
  não se enfrentem na primeira rodada) que o sorteio respeita automaticamente — a tela não permite
  salvar um sorteio que as viole.

## Quando pode ser refeito

O sorteio pode ser refeito enquanto a fase não tiver começado. Uma vez que a fase está em andamento,
refazer o sorteio deixaria de fazer sentido com partidas já jogadas — a tela não permite isso nesse
ponto.
