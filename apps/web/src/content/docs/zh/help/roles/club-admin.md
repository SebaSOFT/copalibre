---
title: 俱乐部管理员
description: club-admin 角色能做什么、继承什么、以及不能做什么。
capabilities:
  - control-web/roles-permissions
roles:
  - club-admin
---

## 这个角色的用途

对一个俱乐部的权限:该指派所指定的那一个,且仅限那一个俱乐部。俱乐部管理员维护该俱乐部的身份信息 —— 名称、别名、缩写和徽标 —— 而无需组织级别的管理员访问权限。

## 能做什么

<!-- GENERATED:CAPABILITIES:START -->

- `org.manage-clubs`

<!-- GENERATED:CAPABILITIES:END -->

范围有限,而非整个组织:俱乐部管理员若对自己不管理的俱乐部执行操作会被拒绝,就像参与者对另一名参与者的记录执行操作会被拒绝一样。

## 继承什么

没有 —— club-admin 不拥有任何其他角色的能力。[admin](/zh/help/roles/admin/) 从 club-admin 继承
`org.manage-clubs`,而不是反过来:admin 拥有 club-admin 拥有的一切,不受限定,并叠加自己的能力。

## 不能做什么

除俱乐部管理之外的一切都不能做。俱乐部管理员不能邀请或管理用户、更改组织设置、创建或管理赛事、审核报名、或操作比赛 —— 每一项都需要该角色不具备的能力。它也不能对自己不管理的俱乐部执行操作,即使在同一个组织内也是如此。

## 能看到哪些界面

该组织成员能看到的每一个控制面板界面,除了"角色" —— 用户管理需要 `org.manage-users`,club-admin 从不拥有该能力,因此该导航项对它永不出现。这是从声明的对应关系中得出的,而不是靠逐个界面维护的排除列表:明天新增一个用户管理界面会自动排除 club-admin,这里没有任何东西需要记得更新。
