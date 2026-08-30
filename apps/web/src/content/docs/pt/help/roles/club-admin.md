---
title: Admin de clube
description: O que a função club-admin pode fazer, o que herda, e o que não pode fazer.
capabilities:
  - control-web/roles-permissions
roles:
  - club-admin
---

## Para que serve esta função

Autoridade sobre um clube: o que essa atribuição nomeia, e apenas esse clube. Um admin de clube mantém
a identidade desse clube — seu nome, alias, abreviação e emblema — sem precisar de acesso de
administrador em nível de organização para isso.

## O que pode fazer

<!-- GENERATED:CAPABILITIES:START -->

- `org.manage-clubs`

<!-- GENERATED:CAPABILITIES:END -->

Limitado, não em nível de organização: um admin de clube que age sobre um clube que não administra é
recusado, da mesma forma que um participante é recusado ao agir sobre os registros de outro
participante.

## O que herda

Nada — club-admin não possui as capacidades de nenhuma outra função. [Admin](/pt/help/roles/admin/)
herda `org.manage-clubs` de club-admin, não o contrário: admin possui tudo o que club-admin possui, sem
limite, além do próprio.

## O que não pode fazer

Nada fora da administração de clube. Um admin de clube não pode convidar ou gerenciar usuários, mudar as
configurações da organização, criar ou administrar torneios, revisar inscrições, ou operar uma partida
— cada uma dessas ações precisa de uma capacidade que esta função não possui. Também não pode agir sobre
um clube que não administra, mesmo dentro da mesma organização.

## Telas que vê

Cada tela do painel de controle que os membros desta organização veem, exceto "Funções" — a
administração de usuários é `org.manage-users`, uma capacidade que club-admin nunca possui, então essa
entrada de navegação nunca aparece para ele. Isso decorre da correspondência declarada, não de uma lista
de exclusão por tela: adicionar amanhã uma nova tela de administração de usuários exclui club-admin
automaticamente, sem nada a lembrar de atualizar aqui.
