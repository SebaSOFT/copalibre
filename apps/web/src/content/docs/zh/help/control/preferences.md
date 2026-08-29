---
title: 偏好设置
description: 管理您的个人访问令牌和 CopaLibre 个人设置。
capabilities:
  - platform/internationalization
  - platform/native-auth
  - platform/personal-access-tokens
roles:
  - admin
  - club-admin
  - referee
  - broadcaster
  - viewer
---

## 此界面的用途

偏好设置界面用于管理您在 CopaLibre 中的个人设置。

## 个人访问令牌

您可以生成个人访问令牌（PAT），用于在不使用用户名和密码的情况下向 CopaLibre API 或 MCP 服务器进行
身份验证。

- **生成令牌**：输入标签和有效期，然后点击"生成"。请务必立即复制该令牌，因为之后将无法再次查看。
- **吊销令牌**：如果令牌已泄露或不再需要，您可以随时将其吊销。

这些令牌是无状态的，会在每次请求时验证您的身份。
