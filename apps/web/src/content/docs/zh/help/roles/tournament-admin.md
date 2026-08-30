---
title: 赛事管理员
description: tournament-admin 角色能做什么、继承什么、以及不能做什么。
capabilities:
  - control-web/roles-permissions
roles:
  - tournament-admin
---

## 这个角色的用途

有权运营一场赛事 —— 该指派所指定的那一场 —— 而不具备组织级别的覆盖范围。如果一个组织希望让某人从头到尾运营单场赛事,别无其他,就使用这个角色而非 admin。

## 能做什么

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

以上每一项都限定于该指派所指定的赛事。若对同一组织内的另一场赛事执行操作,会因归属原因被拒绝,方式与
club-admin 的俱乐部范围限制相同。

## 继承什么

没有。tournament-admin 拥有的每一项能力都是直接拥有的 —— [admin](/zh/help/roles/admin/) 也拥有同一组赛事运营能力,且不受限定,但那是作为它自己直接声明的一组能力,而不是从 tournament-admin 继承而来。

## 不能做什么

没有任何组织级别的权限:tournament-admin 不能邀请或管理用户、更改组织设置、或管理俱乐部 ——
`org.manage-users`、`org.manage-settings` 和 `org.manage-clubs` 永远不在它的能力集合中。它也不能创建新赛事(`org.create-tournaments`),也不能更改现有赛事的生命周期 —— 发布、归档、或其自定义脚本(`org.manage-tournament-lifecycle`):这些仍然只属于 admin,因为创建或终止一场赛事是组织级别的决定,而不是赛事内部的决定。而且它不能对除其指派所指定赛事之外的任何赛事执行操作,即使在同一组织内也是如此。

## 能看到哪些界面

该组织成员能看到的每一个控制面板界面,除了"角色" —— 与 [club-admin](/zh/help/roles/club-admin/)
相同,原因也相同:用户管理需要 `org.manage-users`,而 tournament-admin 从不拥有该能力。
