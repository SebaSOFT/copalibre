---
title: 角色手册
description: CopaLibre 中每个角色能做什么、继承什么、以及不能做什么。
capabilities:
  - control-web/roles-permissions
  - platform/help-and-api-docs
roles:
  - admin
  - club-admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
  - super-admin
---

每个角色的权限都来自一份声明式的对应关系,而不是靠阅读提到它的每一个界面和路由。本节每个角色一页,分别说明该角色能做什么(直接从对应关系生成,因此不可能悄悄偏离实际执行的授权)、继承自哪个角色、明显不能做什么,以及能看到哪些控制面板界面。

- [Admin](/zh/help/roles/admin/)
- [俱乐部管理员](/zh/help/roles/club-admin/)
- [赛事管理员](/zh/help/roles/tournament-admin/)
- [裁判](/zh/help/roles/referee/)
- [转播](/zh/help/roles/broadcaster/)
- [Viewer](/zh/help/roles/viewer/)
- [超级管理员](/zh/help/roles/super-admin/)

Admin、俱乐部管理员、赛事管理员、裁判、转播和 viewer 都是组织角色 —— 在一个组织内持有,离开该组织即无意义。超级管理员不同:它是安装级别的角色,位于每个组织之上一层,单独在自己的页面中说明。
