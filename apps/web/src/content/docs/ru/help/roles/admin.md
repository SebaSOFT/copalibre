---
title: Admin
description: Что может делать роль admin, что она наследует, и что не может делать.
capabilities:
  - control-web/roles-permissions
roles:
  - admin
---

## Для чего эта роль

Оператор высшего уровня самой организации. Admin руководит всем, что делает организация: создаёт и
публикует турниры, приглашает и управляет любым другим пользователем, администрирует каждый клуб, и
проводит матчи — так же, как и любую другую возможность организации — ничто здесь не ограничено одним
клубом или одним турниром.

## Что может делать

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.create-tournaments`
- `org.manage-clubs` (унаследовано от `club-admin`)
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

В дополнение к собственным, эта роль обладает каждой возможностью, которой обладает `club-admin`, по
наследованию — возможность, добавленная там, достигает этой роли без второй правки здесь.

<!-- GENERATED:CAPABILITIES:END -->

## Что не может делать

Полномочия admin никогда не выходят за пределы другой организации — admin второй организации — это
совершенно другое назначение, которым никто не обладает, пока кто-то его туда не пригласит. Admin
также не обладает полномочиями уровня инсталляции: создание организаций, управление супер-админами
инсталляции, и установка модулей дисциплины или профиля турнира для всей инсталляции принадлежат
[супер-админу](/ru/help/roles/super-admin/) — роли выше admin, а не ниже.

## Какие экраны видит

Каждый экран панели управления своей организации, без скрытых пунктов навигации — admin — единственная
роль организации, которая всегда видит экран «Роли», поскольку управление пользователями
(`org.manage-users`) принадлежит ей самой.
