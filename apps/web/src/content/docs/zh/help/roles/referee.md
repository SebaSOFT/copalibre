---
title: 裁判
description: referee 角色能做什么、继承什么、以及不能做什么。
capabilities:
  - control-web/roles-permissions
roles:
  - referee
---

## 这个角色的用途

在比赛进行期间操作比赛:记录事件、控制计时、解决计时器问题、以及选择名单 —— 这是现场裁判使用的控制台,不涉及周边的赛事管理工作。

## 能做什么

<!-- GENERATED:CAPABILITIES:START -->

- `org.operate-match`

<!-- GENERATED:CAPABILITIES:END -->

仅拥有 `org.operate-match` 并不等同于被指派到某场特定比赛 —— 比赛控制台在接受指令前还会额外检查限定于该比赛的指派(`MATCH_CAPABILITIES`),这是比组织角色本身所授予的更窄的权限。

## 继承什么

没有 —— referee 不拥有任何其他角色的能力,也没有任何角色继承自 referee。

## 不能做什么

referee 不能更正已终结的比赛结果(`org.correct-match-results` —— 这是 admin 或 tournament-admin
的权限,在比赛结束后而非进行中行使),也不拥有任何赛事筹备相关的能力:没有阶段、区域、分组、赛程、种子排位或报名相关的权限,没有举报审核,没有用户或俱乐部管理,没有组织设置。

## 能看到哪些界面

只能看到 `org.operate-match` 所能到达的部分 —— 主要是现场比赛控制台。它能看到的其他任何控制面板导航项的表现与 club-admin 和 tournament-admin 相同:除"角色"外的每一个界面,因为 referee 同样从不拥有
`org.manage-users`。
