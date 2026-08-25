---
title: 安装
description: 如何使用 copalibre CLI 从零开始安装 CopaLibre。
---

## 环境要求

主机上需要 Docker 和 Docker Compose。`copalibre` 是一个独立的二进制文件——无需安装 Node.js。也无
需安装 PostgreSQL 或其客户端工具——它们运行在 `copalibre` 管理的容器内。

`install.sh` 支持 Linux（x86_64/arm64）、macOS（x86_64/arm64，包括通过 Rosetta 运行的 Apple
Silicon）以及 Windows（x86_64）。

## 步骤

```bash
curl -fsSL https://www.copalibre.app/install.sh | bash
mkdir my-league && cd my-league
copalibre init      # 将非敏感的默认值写入 .env
```

编辑 `.env`：PostgreSQL 密码、`COPALIBRE_BOOTSTRAP_TOKEN`、OIDC JWKS/issuer/audience、浏览器客户端 ID，以及一个邮件服务提供商。

```bash
copalibre doctor    # 在启动任何进程之前验证配置
copalibre start     # 启动 PostgreSQL、运行 doctor，并启动每个进程
copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

`docker-compose.yml` 刻意不终止 TLS——反向代理（Caddy 或 NGINX）位于边缘。示例配置位于仓库的
`deploy/proxy/` 下；使用 `copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`
验证安装。

关于持久化数据、备份/恢复和反向代理的完整细节，请参阅仓库中的 `docs/self-hosting.md`。关于更新
`copalibre` 二进制文件本身，请参阅[更新](/zh/help/cli/updating/)。
