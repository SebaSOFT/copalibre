---
title: Admin
description: O que a função admin pode fazer, o que herda, e o que não pode fazer.
capabilities:
  - control-web/roles-permissions
roles:
  - admin
---

## Para que serve esta função

O operador de mais alto nível da própria organização. Um admin executa tudo o que a organização faz:
cria e publica torneios, convida e administra qualquer outro usuário, administra cada clube, e opera
partidas, assim como qualquer outra capacidade da organização — nada aqui está limitado a um clube ou
um torneio.

## O que pode fazer

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.create-tournaments`
- `org.manage-clubs` (herdado de `club-admin`)
- `org.manage-display-tokens`
- `org.manage-persons`
- `org.manage-registrations`
- `org.manage-resources`
- `org.manage-schedule`
- `org.manage-seeding`
- `org.manage-settings`
- `org.manage-stages`
- `org.manage-tournament-data`
- `org.manage-tournament-lifecycle`
- `org.manage-users`
- `org.manage-zones-groups`
- `org.operate-match`
- `org.rebuild-statistics`
- `org.review-reports`
- `org.view-internal-standings`
- `org.view-internal-tables`

Além das próprias, esta função possui cada capacidade que `club-admin` possui, por herança — uma
capacidade adicionada lá chega a esta função sem precisar de uma segunda edição aqui.

<!-- GENERATED:CAPABILITIES:END -->

## O que não pode fazer

A autoridade de admin nunca cruza para outra organização — o admin de uma segunda organização é uma
atribuição totalmente diferente, que ninguém possui até que alguém o convide para lá. Admin também não
possui nenhuma autoridade em nível de instalação: criar organizações, gerenciar os super-admins da
instalação, e instalar módulos de disciplina ou perfil de torneio para toda a instalação pertencem a
[super-admin](/pt/help/roles/super-admin/), uma função acima de admin, não abaixo.

## Telas que vê

Cada tela do painel de controle de sua organização, sem nenhuma entrada de navegação oculta — admin é a
única função de organização que sempre vê a tela "Funções", já que a administração de usuários
(`org.manage-users`) é dela mesma.
