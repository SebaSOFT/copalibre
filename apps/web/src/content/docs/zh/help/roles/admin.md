---
title: Admin
description: admin 角色能做什么、继承什么、以及不能做什么。
capabilities:
  - control-web/roles-permissions
roles:
  - admin
---

## 这个角色的用途

组织自身的最高级操作者。admin 管理组织所做的一切:创建并发布赛事、邀请并管理其他任何用户、管理每一个俱乐部、并操作比赛,和组织的其他任何能力一样 —— 这里没有任何限定在某个俱乐部或某个赛事之内。

## 能做什么

<!-- GENERATED:CAPABILITIES:START -->

- `org.assign-match-authority`
- `org.correct-match-results`
- `org.create-tournaments`
- `org.manage-clubs`(继承自 `club-admin`)
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

除了自己的能力外,该角色还通过继承拥有 `club-admin` 的每一项能力 —— 在那里新增的能力无需在此再次编辑即可传递到此角色。

<!-- GENERATED:CAPABILITIES:END -->

## 不能做什么

admin 的权限从不跨越到另一个组织 —— 第二个组织的 admin 是完全不同的一项指派,在有人邀请之前没有人拥有它。admin 也不拥有任何安装级别的权限:创建组织、管理安装的超级管理员、以及为整个安装安装项目或赛事简介模块,这些属于[超级管理员](/zh/help/roles/super-admin/)—— 一个高于 admin 而非低于它的角色。

## 能看到哪些界面

其所在组织的每一个控制面板界面,没有任何导航项被隐藏 —— admin 是唯一始终能看到"角色"界面的组织角色,因为用户管理(`org.manage-users`)是它自己的能力。
