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

保留与 `.copalibre/installation.json` 匹配的 CLI。替换二进制文件不会更新标记、Compose 文件或镜像版本。升级前备份 PostgreSQL、对象、配置和签名密钥，并保留旧镜像版本。

```bash
copalibre backup --file backups/pre-upgrade.tar.gz
```

在现有安装目录中审查目标版本的 Compose 和配置变更，然后修改 `.env` 中的两个镜像引用。保留原有 Compose 项目和卷。拉取并检查目标镜像，不启动依赖，也不执行迁移：

```dotenv
COPALIBRE_IMAGE=ghcr.io/sebasoft/copalibre:1.2.5
COPALIBRE_WEB_IMAGE=ghcr.io/sebasoft/copalibre-web:1.2.5
```

```bash
docker compose pull
docker compose run --rm --no-deps upgrade-check --target-version 1.2.5
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
