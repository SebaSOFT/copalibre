---
title: 安装
description: 如何使用 copalibre CLI 从零开始安装 CopaLibre。
---

## 环境要求

主机上需要 Docker 和 Docker Compose。无需安装 PostgreSQL 或其客户端工具——它们运行在 `copalibre` 管理的容器内。

## 步骤

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # 将非敏感的默认值写入 .env
```

编辑 `.env`：PostgreSQL 密码、`COPALIBRE_BOOTSTRAP_TOKEN`、OIDC JWKS/issuer/audience、浏览器客户端 ID，以及一个邮件服务提供商。

```bash
./copalibre doctor    # 在启动任何进程之前验证配置
./copalibre start     # 启动 PostgreSQL、运行 doctor，并启动每个进程
./copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

`docker-compose.yml` 刻意不终止 TLS——反向代理（Caddy 或 NGINX）位于边缘。示例配置位于仓库的
`deploy/proxy/` 下；使用 `./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`
验证安装。

关于持久化数据、备份/恢复和反向代理的完整细节，请参阅仓库中的 `docs/self-hosting.md`。
