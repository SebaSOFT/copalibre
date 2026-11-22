---
title: 更新
description: 更新 CopaLibre 框架及其已安装模块的非破坏性路径。
capabilities: []
roles:
  - super-admin
---

## 更新 copalibre CLI 本身

`copalibre --version` 会输出已安装二进制文件的版本号。重新运行安装脚本会获取最新的已发布版本并原
地替换该二进制文件——该操作是幂等的：会先检查已安装的版本，若已经一致则跳过下载：

```bash
curl -fsSL https://github.com/SebaSOFT/copalibre/releases/latest/download/install.sh | bash
```

这只会替换 `copalibre` 二进制文件，对正在运行的安装实例没有任何影响——关于更新框架及其模块，请参
见下文。

## 更新框架

在安装目录中运行 `copalibre upgrade`，使用目标版本的 CLI。先查看它将做什么；这不会改变任何内容：

```bash
copalibre upgrade --check
```

### 从哪个版本开始

| 您的安装由以下版本创建                    | 操作                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| 1.2.5 或 1.2.6                            | `copalibre upgrade --self`，然后 `copalibre upgrade --check` 和 `copalibre upgrade` |
| 1.2.1 或更早（其 CLI 没有 `upgrade`）     | 用上面的安装脚本安装新 CLI，然后 `copalibre upgrade --check` 和 `copalibre upgrade` |
| 1.2.x 的 CLI 已运行过 `copalibre upgrade` | 安装新 CLI，再运行一次 `copalibre upgrade`                                          |

不要让 1.2.x 的 CLI 单独运行 `copalibre upgrade`。它会把新版本写入 `.env`、`docker-compose.yml` 和
`.copalibre/installation.json`，报告成功，却让所有容器继续使用旧镜像；下次重启时，新镜像会在旧的
Compose 文件上启动，无法正常工作。新 CLI 能识别处于这种状态的安装，无论其标记写的是什么，并完成剩余工作。

### 升级会做什么

1. 在安装继续运行时拉取新镜像，这样缺少某个镜像时不会停止任何服务。
2. 停止整个栈，确保不丢失任何写入，并把数据库备份到
   `backups/pre-upgrade-<原版本>-to-<目标版本>-<日期>.tar.gz`。
3. 当 `docker-compose.yml` 和 `deploy/gateway/Caddyfile` 仍是某个版本发布时的原样，就用新版本的文件替换它们，
   并把原文件保留为 `docker-compose.yml.<原版本>.bak` 和 `deploy/gateway/Caddyfile.<原版本>.bak`。更新
   `.env`（新设置、新镜像标签、已移到 `/api` 下的密钥集地址），并保留 `.env.<原版本>.bak`；您设置的值会被保留。
4. 把数据库从 PostgreSQL 17 迁移到 18：将备份恢复到新卷（`postgresql-data`），并在继续之前比较每张表的行数。
   17 的卷不会被改动。
5. 启动新版本并运行 `copalibre doctor`。在终端中，doctor 会提议配置安装缺少的设置，例如邮件发送；
   参见 [doctor](/zh/help/cli/commands/#doctor)。
6. doctor 通过后，确认备份可以读回，然后删除 PostgreSQL 17 的卷（`postgres-data`）和 `postgres:17` 镜像。
   使用 `--keep-old-volume` 时会保留它们；升级会打印以后删除它们的两条命令。

从第 2 步到第 5 步成功期间，栈处于停止状态；请根据数据库大小安排维护窗口。迁移需要 Docker 所在磁盘的可用空间达到数据库大小的两倍：
空间不足时升级不会开始。升级完成后，请把备份包复制到主机之外。

### 如果您修改过 docker-compose.yml

与任何版本都不匹配的 Compose 文件（您添加的服务、修改的值）保持原样。升级会把新版本的文件写为
`docker-compose.yml.new`，给出提示，并在更改其他任何内容之前停止。请把您的修改合并到该文件中，用结果替换
`docker-compose.yml`，然后再次运行 `copalibre upgrade`。您修改过的网关配置会被保留，升级会说明这一点。

### 1.0 的安装

1.0 没有网关：边缘代理直接访问 `web`、`api` 和 `events`。从 1.1 起，`gateway` 服务是唯一入口，
端口为 `COPALIBRE_PORT`（未设置时为 8080）。升级后，请把代理指向网关，并把 `COPALIBRE_APP_URL`
设为浏览器使用的地址；运行 `copalibre doctor` 确认。

### 回退

如果 doctor 之前的任何步骤失败，升级会放回原来的文件，在未改动的 PostgreSQL 17 卷上启动原版本，并说明停止的原因。
如果 doctor 失败，新版本继续运行，升级会打印以下步骤而不删除任何内容。

当 PostgreSQL 17 的卷仍然存在时（doctor 失败，或您使用了 `--keep-old-volume`）：

```bash
docker compose down
cp docker-compose.yml.<原版本>.bak docker-compose.yml
cp .env.<原版本>.bak .env
cp deploy/gateway/Caddyfile.<原版本>.bak deploy/gateway/Caddyfile   # 若升级替换过它
docker compose up --detach --wait
```

PostgreSQL 18 的卷（`<项目>_postgresql-data`）将不再使用；如果想从头开始，请在再次尝试升级前用
`docker volume rm` 删除它。

升级删除 PostgreSQL 17 之后，回退的途径是备份包。在一个新的空目录中安装原版本的 CLI，在那里运行
`copalibre init`，把备份包复制到其 `backups/` 中并恢复：

```bash
copalibre restore --file backups/pre-upgrade-<原版本>-to-<目标版本>-<日期>.tar.gz --confirm
```

升级之后的写入会丢失。在已迁移的数据库上改用旧镜像，永远不是安全的回退方式。

### 使用 Compose 手动升级（2.x 版本之间）

从 1.x 的安装升级请使用 `copalibre upgrade`：其数据库必须迁移到 PostgreSQL 18，而以下步骤不会做这件事。

保留与 `.copalibre/installation.json` 匹配的 CLI。替换二进制文件不会更新标记、Compose 文件或镜像版本。升级前备份 PostgreSQL、对象、配置和签名密钥，并保留旧镜像版本。

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

在现有安装目录中审查目标版本的 Compose 和配置变更，然后修改 `.env` 中的两个镜像引用。保留原有 Compose 项目和卷。拉取并检查目标镜像，不启动依赖，也不执行迁移：

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.6
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.6
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.6
```

检查成功后安排停机，停止应用进程并执行最终备份，再迁移和重启。迁移失败时不要重启应用：

```bash
docker compose stop gateway web web-ssr api events worker scheduler
copalibre backup --file backups/pre-upgrade.tar.gz
docker compose run --rm migrate && docker compose up --detach --wait
docker compose run --rm doctor
```

不要删除或改写标记来绕过版本检查。跨版本执行数据库操作时使用上面的显式 Compose 服务；新版 CLI 无法对旧标记运行 `migrate` 或 `upgrade-check`。新的 `init` 目录是另一套安装，并非原地升级。

数据库迁移后，仅选择旧镜像不能安全回滚。保持写入进程停止，在运行旧版本的隔离安装中恢复升级前的 PostgreSQL、对象及配置备份。验证恢复后再切换流量；备份之后的写入无法恢复。

## 按部署方式升级

Compose 位于 NGINX 或 Caddy 后方时，保留代理和证书，在迁移期间使用维护路由，仅在代理配置更改时验证并重载。Kubernetes 使用目标 chart、已审查的 values 和两个镜像版本，先运行兼容性 Job，再验证迁移/doctor Job 与 ingress 后恢复流量。Helm rollback 不会撤销数据库迁移。详细命令：

- [Caddy](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/caddy.md#upgrading-copalibre-behind-caddy)
- [NGINX](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/reverse-proxy/nginx.md#upgrading-copalibre-behind-nginx)
- [Kubernetes / Helm](https://github.com/SebaSOFT/copalibre/blob/main/docs/deployment/enterprise-kubernetes.md#upgrading-an-existing-helm-release-safely)

## 更新模块

每个已安装的项目或赛事配置文件都是独立于框架进行版本管理的模块。

```bash
copalibre module list --outdated
```

仅列出已安装、且存在比当前安装版本更新的已发布版本的模块。

```bash
copalibre module add <alias>@<range>
```

安装某个已安装模块的特定版本或版本范围（例如 `@^2.0.0`）——以不同版本重新安装即为更新模块的方式。已在进行中的赛事会继续引用其创建时所用的版本；更新模块绝不会追溯性地更改已在进行中的赛事。

关于 `module` 其余选项的说明，请参阅[命令参考](/zh/help/cli/commands/)。
