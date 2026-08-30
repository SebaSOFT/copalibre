---
title: Viewer
description: viewer 角色能做什么、继承什么、以及不能做什么。
capabilities:
  - control-web/roles-permissions
roles:
  - viewer
---

## 这个角色的用途

权限最低的组织角色 —— 用于让某人被列为该组织的成员,而不授予任何操作权限。

## 能做什么

<!-- GENERATED:CAPABILITIES:START -->

目前没有任何能力被授予该角色。

<!-- GENERATED:CAPABILITIES:END -->

与 [broadcaster](/zh/help/roles/broadcaster/) 一样,这里明确说明,而不是不加记录:没有任何路由允许 viewer
使用对应关系中列出的任何能力。所有真正公开的内容 —— 实时概览、已发布的排名、对阵表和资料页 —— 都不需要任何角色,任何人(无论是否为成员)都可以访问。

## 继承什么

没有 —— 没有角色继承自 viewer,它也不继承自任何角色。

## 不能做什么

任何受组织能力保护的事情,与 broadcaster 相同:没有任何管理权限,没有比赛操作,除公开只读内容已经向非成员开放的部分外没有其他数据访问权限。

## 能看到哪些界面

除"角色"外的每一个控制面板界面 —— 与 broadcaster 所看到的完全相同,原因也相同。
