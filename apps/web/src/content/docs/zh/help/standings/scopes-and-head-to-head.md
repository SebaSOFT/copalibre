---
title: 积分榜范围与胜负关系（对赛成绩）
description: 评估范围（总计、相互交手记录、负场）与多方平局递归解决机制。
capabilities:
  - tournament-engine/standings-explainability
  - tournament-engine/rules-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## 概述

当选手积分相同时，CopaLibre 支持在不同计算范围内进行平局决胜：全阶段总计（`overall`）、平局方相互战绩（`head-to-head`）以及仅限负场统计。对于三人及以上的复杂平局，引擎支持自动递归拆解。
