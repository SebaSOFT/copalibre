---
title: '入门指南：自托管'
description: 在 Windows、macOS 或 Linux 上从源代码运行 CopaLibre，然后选择反向代理或 Kubernetes 部署拓扑。
---

本页将帮助您在自己的机器或服务器上运行一份新检出的代码，然后说明将其暴露给真实流量的两种受支持方
式。CLI 命令参考见[安装](/help/cli/installation/)；备份/恢复和持久数据详情见仓库中的
`docs/self-hosting.md`。

## 1. 各平台的先决条件

每个角色都以一个直接从本仓库构建的多角色 Docker 镜像发布——不存在单独的"生产构建"步骤。您需要
Docker、Docker Compose v2 和 Git；主机上无需运行其他任何东西。

**Linux**——从您所用发行版的包管理器或 [Docker 官方仓库](https://docs.docker.com/engine/install/)
安装 Docker Engine 和 Compose 插件（`docker-ce`、`docker-compose-plugin`）。将您的用户添加到
`docker` 组，这样 `./copalibre` 就无需 `sudo`。

**macOS**——安装 [Docker Desktop](https://docs.docker.com/desktop/install/mac-install/)（Apple
Silicon 或 Intel）。如果您不想运行 Docker Desktop，Colima 配合独立的 `docker`/`docker-compose`
命令行工具也可以使用。

**Windows**——安装 [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) 并启用
**WSL2 后端**，并在 WSL2 发行版内部（Ubuntu 是测试最充分的选择）运行下面的每条命令，而不要直接从
PowerShell 或 `cmd.exe` 运行。`./copalibre` 是一个 POSIX `sh` 脚本；WSL2 为它提供了真正的 shell，
并让 Docker Desktop 的 WSL 集成无需额外网络配置即可为其暴露守护进程。Git Bash 在紧急情况下可以运
行 `sh copalibre <command>`，但在 WSL2 下卷挂载路径和文件权限更加可预测——对于快速本地测试之外的
任何用途，请优先使用 WSL2。

## 2. 从源代码运行

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
./copalibre init      # 将非敏感默认值写入 .env，并列出所需的敏感信息
```

编辑 `.env`：一个强 PostgreSQL 密码、一个不透明的 `COPALIBRE_BOOTSTRAP_TOKEN`、您的 OIDC
JWKS/issuer/audience 值（或原生的邮箱/密码身份提供方——见[角色与权限](/help/control/roles-permissions/)）、
公开浏览器客户端 ID，以及一个受支持的邮件提供商。

```bash
./copalibre doctor    # 在任何服务启动前校验配置
./copalibre start     # docker compose up --detach --wait —— 在本地构建镜像
./copalibre create-admin --organization-alias my-league --organization-name "My League" \
  --email admin@example.com
```

默认情况下，`./copalibre start` 会从此检出目录构建 `copalibre:local` 和 `copalibre-web:local`——
该构建**就是**"从源代码运行"。如果您更愿意拉取一个发布版本而非自行构建，可将
`COPALIBRE_IMAGE`/`COPALIBRE_WEB_IMAGE` 改为指向已发布的标签。

此时，整套服务已在运行，但尚无法从主机外部访问：`docker-compose.yml` 有意从不自行终止 TLS 或暴露
公共端口。请从下面两种拓扑中选择一种，以真正将其面向用户开放。

## 3. 选择如何对外暴露

### 方案 A——单主机，边缘反向代理

最简单的受支持拓扑：一台运行 Compose 的 Docker 主机，前面由 Caddy 或 NGINX 终止 TLS 并将流量路由
到内部服务。上述三个平台上，`./copalibre start` 默认就是为此而构建的。

1. 将 `COPALIBRE_APP_HOST`、`COPALIBRE_API_HOST` 和 `COPALIBRE_EVENTS_HOST` 设置为您的公开主机
   名，并设置 `ACME_EMAIL`，以便代理可以自动申请证书。
2. 将普通 API 流量路由到 `api:3001`，SSE 流量路由到 `events:3002`，公开 SSR 路由到 `web-ssr:3005`，
   静态 control/public web 流量路由到 `web:4321`。示例配置：
   [`deploy/proxy/Caddyfile`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/Caddyfile)
   和 [`deploy/proxy/nginx.conf`](https://github.com/SebaSOFT/copalibre/blob/main/deploy/proxy/nginx.conf)。
   代理必须保留转发头、保持 SSE 不被缓冲，并让空闲流能挺过心跳——Caddy 示例正是为此设置了
   `flush_interval -1`。
3. 验证：`./copalibre doctor --check-proxy --proxy-url https://events.example/events/proxy-check`。

这在 Linux、macOS 和 Windows（WSL2）上表现一致——代理只是同一个 Compose 服务栈前面的另一个容器
（或同一主机上的一个进程）。

### 方案 B——Kubernetes（从 K3s 到企业级集群）

对于多节点、水平扩展或托管基础设施上的部署，一个 Helm chart（`deploy/helm/copalibre/`）会部署与
Compose 安装相同的镜像、环境约定、健康检查和迁移流程——使用默认值安装它的行为与仅使用基础 chart
完全一致。

```bash
helm install my-copalibre deploy/helm/copalibre/ \
  --set image.tag=<version> --set web.image.tag=<version>
```

按需叠加以下这些默认关闭的可加性 `values.yaml` 分组——都无需 fork 模板：

- **`autoscaling`**——按角色的 HPA（`api` 基于 HTTP 请求速率，`events` 基于活跃 SSE 连接数，
  `worker` 基于 outbox 队列深度/年龄）——需要自定义指标适配器（Prometheus Adapter、KEDA）；这三项
  信号都不是 Kubernetes 原生指标。
- **`podDisruptionBudget`** 和 **`affinity.antiAffinity`**——中断保护和跨节点的柔性分布，独立于自
  动扩缩容。
- **`networkPolicy`**——按角色默认拒绝，其中 `publicRoles`（默认为 `api`、`events`，加上始终包含
  的 `web`）对外部流量开放。
- **`ingress`**——需要 ingress controller，若需自动 TLS 则还需要 cert-manager。
- **`externalSecrets`**——需要 External Secrets Operator；从您真实的密钥库而非简单的 `Secret`
  清单中获取 `DATABASE_URL`、`COPALIBRE_OBJECT_STORAGE_*` 凭据等。

托管 PostgreSQL、兼容 S3 的对象存储（AWS S3、MinIO、R2、B2），或托管虚拟机路径（Kamal，
`docs/deployment/kamal.md`）都属于配置，而非代码更改——`packages/persistence` 已经通用地支持这些
目标。在触及真实集群之前，先在一次性的多节点集群上本地验证任何 chart 更改：

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

完整的先决条件清单，以及支撑这一说法的多节点故障切换、备份恢复和升级安全性的实测证据：见仓库中的
`docs/deployment/enterprise-kubernetes.md`。

## 4. 后续步骤

- [您的第一场赛事](/help/getting-started/)——安装启动后创建并发布一项赛事。
- [运营与可追溯性](/help/operations/)——安全地进行比赛和更正结果。
- [CLI 参考](/help/cli/commands/)——每一个 `copalibre` 子命令，包括 `backup`、`restore` 和
  `upgrade-check`。
