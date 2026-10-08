---
title: 赛事编排
description: 赛事创建向导配置的内容以及每个字段的含义。
capabilities:
  - control-web/tournament-authoring
  - tournament-engine/discipline-driven-results
  - tournament-engine/tournament-fixture-engine
  - tournament-engine/tournament-profile
  - tournament-engine/tournament-domain-model
  - tournament-engine/competition-identity
  - tournament-engine/rules-engine
  - tournament-engine/scripting-hook-surface
  - tournament-engine/placement-stage-format
roles:
  - admin
---

## 此界面的用途

在组织内创建新赛事：在任何参赛者报名之前，选择项目、赛制和基本信息。

## 关键字段

- **项目**：所进行的运动/活动的规则集（胜负条件、积分、分段等）。此处仅显示已安装在本实例上的项目——如果所需的项目缺失，须先安装（`copalibre module add`）才能创建赛事。
- **别名**：赛事在公开路由中的唯一标识符，在组织内唯一。使用小写字母和连字符；会出现在公开 URL 中，创建后不可随意更改。
- **赛制**：所选项目可用的竞赛形式（单败淘汰赛、循环赛等）。

## 规划赛区

创建赛事时，可以把每个阶段划分为多个赛区。在阶段下打开**赛区**，添加赛区并命名。除非为赛区另选赛制（例如同一阶段内两个淘汰赛赛区和一个循环赛联赛赛区）或为其设置独立的系列赛，赛区沿用所属阶段的赛制和系列赛。赛区名称在同一阶段内必须唯一。向导只声明结构：参赛者在报名结束后于赛区与小组界面分配到赛区，在阶段生成赛程之前，也可以在那里更改每个赛区的赛制。

## 生命周期

新创建的赛事以**草稿**状态开始。此后遵循线性路径：草稿 → 已发布 → 已开始 → 已结束 → 已归档。每一步都是在其他界面上做出的明确决定，绝非此界面自动完成。一旦进入**已开始**状态，项目和赛事配置就会冻结在当时的版本——进行中的赛事绝不会中途更改其规则。
