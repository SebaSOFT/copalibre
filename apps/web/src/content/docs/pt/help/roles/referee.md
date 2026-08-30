---
title: Árbitro
description: O que a função referee pode fazer, o que herda, e o que não pode fazer.
capabilities:
  - control-web/roles-permissions
roles:
  - referee
---

## Para que serve esta função

Operar uma partida enquanto está ao vivo: registrar eventos, controlar o relógio, resolver
temporizadores, e selecionar uma escalação — o console que um oficial no local usa, sem nada da
administração do torneio ao redor.

## O que pode fazer

<!-- GENERATED:CAPABILITIES:START -->

- `org.operate-match`

<!-- GENERATED:CAPABILITIES:END -->

Possuir `org.operate-match` sozinho não é o mesmo que estar designado para uma partida específica — o
console de partida verifica adicionalmente uma atribuição limitada à partida (`MATCH_CAPABILITIES`)
antes de admitir um comando, uma autoridade mais restrita do que a que a própria função de organização
concede.

## O que herda

Nada — referee não possui as capacidades de nenhuma outra função, e nenhuma função herda de referee.

## O que não pode fazer

Referee não pode corrigir um resultado de partida finalizado (`org.correct-match-results` — essa é
autoridade de admin ou tournament-admin, exercida depois da partida, não durante), e não possui nenhuma
das capacidades de preparação do torneio: nenhuma autoridade de etapa, zona, grupo, calendário, sorteio
ou inscrições, nenhuma revisão de denúncias, nenhuma administração de usuários ou clubes, nenhuma
configuração de organização.

## Telas que vê

Apenas o que `org.operate-match` alcança — principalmente o console de partida ao vivo. Cada outra
entrada de navegação do painel de controle que vê se comporta da mesma forma que para club-admin e
tournament-admin: cada tela exceto "Funções", já que referee também nunca possui `org.manage-users`.
