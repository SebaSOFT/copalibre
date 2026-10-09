---
title: Criação de torneio
description: O que o assistente de criação de torneio configura e o que cada campo significa.
capabilities:
  - control-web/tournament-authoring
  - tournament-engine/discipline-driven-results
  - tournament-engine/tournament-fixture-engine
  - tournament-engine/tournament-profile
  - tournament-engine/tournament-domain-model
  - tournament-engine/competition-identity
  - tournament-engine/rules-engine
  - tournament-engine/scripting-hook-surface
  - tournament-engine/placement-stage-format
roles:
  - admin
---

## Para que serve esta tela

Cria um novo torneio dentro da organização: escolha a disciplina, o formato e os dados básicos antes
que qualquer participante esteja inscrito.

## Campos principais

- **Disciplina**: o conjunto de regras do esporte/atividade a ser jogado (condição de vitória,
  pontos, segmentos, etc.). Só aparecem disciplinas instaladas nesta instalação — se a que você
  precisa estiver faltando, instale-a primeiro (`copalibre module add`) antes de poder criar o
  torneio.
- **Alias**: o identificador de rota pública do torneio, único dentro da organização. Usa letras
  minúsculas e hífens; aparece na URL pública e não pode ser livremente alterado depois.
- **Formato**: o formato de disputa disponível para a disciplina escolhida (eliminação simples,
  round robin, etc.).

## Planejar zonas

Cada fase pode ser dividida em zonas ao criar o torneio. Abra **Zonas** dentro de uma fase, adicione uma zona e dê um nome a ela. Uma zona joga com o formato e a série da sua fase, a menos que você escolha outro formato para ela (por exemplo, duas zonas de eliminatória e uma liga de pontos corridos dentro da mesma fase) ou defina uma série própria. Os nomes de zona devem ser únicos dentro da fase. O assistente declara apenas a estrutura: os participantes são atribuídos às zonas após a inscrição, na tela de zonas e grupos, onde também é possível alterar o formato de cada zona até que a fase tenha partidas geradas.

## Ciclo de vida

Um torneio recém-criado começa no estado **rascunho**. A partir daí segue um caminho linear:
rascunho → publicado → iniciado → finalizado → arquivado. Cada etapa é uma decisão explícita em
outra tela, nunca algo que esta tela faça por você. Uma vez **iniciado**, a disciplina e o perfil de
torneio ficam congelados na versão que tinham naquele momento — um torneio em andamento nunca muda
suas regras no meio do caminho.
