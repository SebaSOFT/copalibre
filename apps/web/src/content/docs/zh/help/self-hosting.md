---
title: '入门指南：自托管'
description: 在 Windows、macOS 或 Linux 上从源代码运行 CopaLibre，然后选择反向代理或 Kubernetes 部署拓扑。
capabilities:
  - platform/self-hosted-deployment
roles:
  - super-admin
---

本页将帮助您在自己的机器或服务器上运行一份新检出的代码，然后说明将其暴露给真实流量的两种受支持方
式。CLI 命令参考见[安装](/help/cli/installation/)；备份/恢复和持久数据详情见仓库中的
`docs/self-hosting.md`。

## 1. 各平台的先决条件

需要 Docker、Docker Compose v2 和 Git。源码包装脚本还需要主机安装 Node.js 24 和 Corepack。独立 CLI 二进制文件不需要 Node.js；请参阅[安装](/zh/help/cli/installation/)。

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

在仓库根目录构建两个镜像，然后在空目录中初始化安装：

```bash
git clone https://github.com/SebaSOFT/copalibre.git
cd copalibre
docker build --target runtime -t copalibre:local .
docker build --target web -t copalibre-web:local .
mkdir my-league && cd my-league
../copalibre init
```

启动前编辑 `.env`：设置 `COPALIBRE_IMAGE=copalibre:local` 和 `COPALIBRE_WEB_IMAGE=copalibre-web:local` 以使用本地构建。否则 `init` 会选择与 CLI 版本对应的已发布镜像。替换开发密码和 bootstrap 令牌，配置身份认证、邮件和公开 URL。使用 `openssl rand -hex 32` 生成 `GARAGE_RPC_SECRET`；即使可选存储服务未启用，Compose 也会展开此必填值。

```bash
../copalibre doctor
../copalibre start
../copalibre status
../copalibre restart
../copalibre stop
../copalibre create-admin --organization-alias my-league --organization-name "My League" --email admin@example.com
```

使用 copalibre status 检查容器和网关。copalibre restart 会检查 PostgreSQL 和 doctor，然后重新启动服务。copalibre stop 会保留卷；--down 会移除容器和网络。Kubernetes 模式下，start/stop/restart 会显示 Helm 或 kubectl 操作说明。

网关在 `http://localhost:8080`（`COPALIBRE_PORT`）提供 HTTP。Compose 也会发布服务端口；请在主机和网络层限制访问。TLS 由边缘代理终止。

## 3. 选择如何对外暴露

### 方案 A——单主机，边缘反向代理

将应用域名转发到 Compose 网络内的 `gateway:80`；若代理运行在主机上，则使用 `127.0.0.1:8080`。网关处理同源 API、认证、SSE 和网页路由；web 容器将动态页面转发到 `web-ssr`。使用 `deploy/proxy/Caddyfile` 或 `deploy/proxy/nginx.conf`，配置 TLS 和公开 URL，并关闭 SSE 缓冲。同源部署不必使用独立的 API/events 域名。

```bash
../copalibre doctor --check-proxy --proxy-url https://app.example/events/proxy-check
```

### 方案 B——Kubernetes（从 K3s 到企业级集群）

对于多节点、水平扩展或托管基础设施上的部署，一个 Helm chart（`deploy/helm/copalibre/`）会部署与
Compose 安装相同的镜像、环境约定、健康检查和迁移流程——使用默认值安装它的行为与仅使用基础 chart
完全一致。

在仓库根目录运行 Helm，事先在 `my-values.yaml` 中配置数据库、身份认证、邮件和公开 URL。两个镜像都必须使用已发布版本；1.2.6 在发布后才可用。

```bash
cd ..
helm show values deploy/helm/copalibre/ > my-values.yaml
```

```bash
helm install my-copalibre deploy/helm/copalibre/ -f my-values.yaml \
  --set image.repository=ghcr.io/sebasoft/copalibre --set-string image.tag=1.2.6 \
  --set web.image.repository=ghcr.io/sebasoft/copalibre-web --set-string web.image.tag=1.2.6
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

托管 PostgreSQL、兼容 S3 的对象存储（AWS S3、Garage、R2、B2），或托管虚拟机路径（Kamal，
`docs/deployment/kamal.md`）都属于配置，而非代码更改——`packages/persistence` 已经通用地支持这些
目标。在触及真实集群之前，先在一次性的多节点集群上本地验证任何 chart 更改：

```bash
k3d cluster create --config deploy/helm/k3s-dev-cluster.yaml
```

完整的先决条件清单，以及支撑这一说法的多节点故障切换、备份恢复和升级安全性的实测证据：见仓库中的
`docs/deployment/enterprise-kubernetes.md`。

## 4. 通知邮件

赛事和组织的动态会通过为邀请配置的邮件服务商（`COPALIBRE_EMAIL_PROVIDER`）以邮件通知，无需额外设置。在开发环境中，邮件会进入 Mailpit。

- 新赛事和新俱乐部会通知组织管理员。
- 新报名以及俱乐部提交名单，会通知组织管理员和该赛事的管理员。触发该事件的人不会收到邮件。
- 邮件使用组织的主要语言，页眉显示其徽标和名称，并由 Copa Libre 署名，附带指向 [copalibre.app](https://copalibre.app) 的链接。
- CSV 导入和 `copalibre dev demo` 不发送邮件。
- 同一封邮件绝不会向同一收件人发送两次。如果服务商在确认前超时，该邮件不会重试，因此可能漏发，但不会重复。

## 5. 后续步骤

- [您的第一场赛事](/help/getting-started/)——安装启动后创建并发布一项赛事。
- [运营与可追溯性](/help/operations/)——安全地进行比赛和更正结果。
- [CLI 参考](/help/cli/commands/)——每一个 `copalibre` 子命令，包括 `backup`、`restore` 和
  `upgrade-check`。
