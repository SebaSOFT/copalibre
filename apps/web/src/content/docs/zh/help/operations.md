---
title: 运营与可追溯性
description: 操作比赛和更正赛事数据的规则。
capabilities:
  - platform/async-job-processing
  - platform/persistence-layer
roles:
  - super-admin
---

## 比赛控制台

通过授权的控制台记录事件和计时。公开投影会根据持久化事件更新，并保留可恢复的版本。每项操作在发送前都会先写入本地队列，因此连接中断时会将其排队等待自动重试，而不会丢失——完整行为参见[实时比赛控制台](/zh/help/control/match-console/)。

## 更正

绝不直接覆盖已计算的结果。更正操作需要提供原因、操作者，并在影响排名或后续阶段之前展示影响预览。

## 阵容

阵容表示某参赛者在一场比赛中所选的球员名单，并不表示某人与某队伍之间的长期关系。
