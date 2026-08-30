---
title: Admin de torneio
description: O que a função tournament-admin pode fazer, o que herda, e o que não pode fazer.
capabilities:
  - control-web/roles-permissions
roles:
  - tournament-admin
---

## Para que serve esta função

Autoridade para conduzir um torneio — o que essa atribuição nomeia — sem alcance em nível de
organização. Uma organização que quer que alguém conduza uma única competição do início ao fim, e nada
mais, usa esta função em vez de admin.

## O que pode fazer

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.manage-display-tokens`
- `org.manage-registrations`
- `org.manage-schedule`
- `org.manage-seeding`
- `org.manage-stages`
- `org.manage-tournament-data`
- `org.manage-zones-groups`
- `org.operate-match`
- `org.review-reports`
- `org.view-internal-standings`
- `org.view-internal-tables`

<!-- GENERATED:CAPABILITIES:END -->

Cada uma dessas capacidades é limitada ao torneio que a atribuição nomeia. Agir contra um torneio
diferente na mesma organização é recusado por motivos de titularidade, da mesma forma que o limite de
clube é aplicado para club-admin.

## O que herda

Nada. Cada capacidade que tournament-admin possui, ele possui diretamente —
[admin](/pt/help/roles/admin/) possui o mesmo conjunto de capacidades operacionais de torneio também,
sem limite, mas como um conjunto próprio declarado diretamente em vez de herdado de tournament-admin.

## O que não pode fazer

Nenhuma autoridade em nível de organização: tournament-admin não pode convidar ou gerenciar usuários,
mudar as configurações da organização, ou administrar clubes — `org.manage-users`, `org.manage-settings`
e `org.manage-clubs` nunca estão em seu conjunto. Também não pode criar um novo torneio
(`org.create-tournaments`) nem mudar o ciclo de vida de um torneio existente — publicar, arquivar, ou
seus scripts personalizados (`org.manage-tournament-lifecycle`): isso continua exclusivo de admin, já
que criar ou encerrar um torneio é uma decisão em nível de organização, não uma decisão interna ao
torneio. E não pode agir sobre nenhum torneio diferente daquele que sua atribuição nomeia, mesmo dentro
da mesma organização.

## Telas que vê

Cada tela do painel de controle que os membros desta organização veem, exceto "Funções" — o mesmo que
[club-admin](/pt/help/roles/club-admin/), e pelo mesmo motivo: a administração de usuários precisa de
`org.manage-users`, que tournament-admin nunca possui.
