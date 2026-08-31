---
title: Viewer
description: O que a função viewer pode fazer, o que herda, e o que não pode fazer.
capabilities:
  - control-web/roles-permissions
roles:
  - viewer
---

## Para que serve esta função

A função de organização menos privilegiada — associação na taxonomia da organização para alguém que
deveria constar como pertencente a ela, sem conceder nenhuma autoridade operacional.

## O que pode fazer

<!-- GENERATED:CAPABILITIES:START -->

Nenhuma capacidade é concedida a esta função hoje.

<!-- GENERATED:CAPABILITIES:END -->

Assim como com [broadcaster](/pt/help/roles/broadcaster/), isto é dito com clareza em vez de deixado
sem documentação: nenhuma rota admite viewer a nada que a correspondência nomeie. Tudo o que é
genuinamente público — resumos ao vivo, tabelas publicadas, chaveamentos e perfis — não precisa de
nenhuma função e é acessível a qualquer pessoa, membro ou não.

## O que herda

Nada — nenhuma função herda de viewer, e ele não herda de nenhuma.

## O que não pode fazer

Tudo o que uma capacidade de organização protege, assim como broadcaster: nenhuma administração,
nenhuma operação de partida, nenhum acesso a dados além do que a leitura pública já expõe a alguém que
não é membro.

## Telas que vê

Cada tela do painel de controle exceto "Funções" — idêntico ao que broadcaster vê, pelo mesmo motivo.
