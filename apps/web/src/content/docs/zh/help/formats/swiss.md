---
title: 瑞士轮赛制
description: 瑞士轮对阵机制、积分分组、跨组匹配（Floaters）与轮空（Byes）。
capabilities:
  - tournament-engine/tournament-fixture-engine
roles:
  - admin
  - tournament-admin
  - referee
  - broadcaster
  - viewer
---

## 概述

瑞士轮赛制在多轮比赛中进行非淘汰制对决。与单败淘汰或循环赛不同，参赛者在固定的轮次中与战绩相同或最接近的对手展开较量。

## 对阵与匹配机制

- **积分组（Score Brackets）**：每轮结束后，选手按总积分进入相应积分组（如 2-0、1-1、0-2）。
- **避免重复对局**：在同一阶段内，任意两位选手最多只对战一次。
- **跨组浮动（Floaters）**：当某个积分组人数为奇数时，选拔一名选手进入相邻积分组进行配对。
- **轮空（Byes）**：总参赛人数为奇数时，此前未轮空的最低位选手获得轮空胜（积1胜，分差为0）。

## 计分体系

- `match-wins`：以大场胜负计分（胜1分，平0.5分，负0分）。
- `game-points`：以小局净胜分计分。

## 积分榜与平局决胜

采用布赫霍尔茨（Buchholz）和索恩伯恩-伯格（Sonneborn-Berger）等对手分机制进行平局决胜，通常用于决出晋级淘汰赛的前8或前16名。
