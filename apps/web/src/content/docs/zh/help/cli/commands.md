---
title: 命令参考
description: 每个 copalibre CLI 命令、其用法及其选项标志。
---

每个命令都以完全相同的用法文本响应 `--help`/`-h`，这些文本由 CLI 内部的同一处来源生成——本页面无法以不同于 CLI 实际执行方式的方式来描述某个命令。`copalibre --version` 仅输出已安装的版本号，供脚本使用。

## init

`copalibre init [--module-dev]` 或 `copalibre init --kubernetes [--namespace <ns>] [--release <name>] [--context <ctx>]`

将一份完整的安装写入当前目录。无需源代码检出：在任意空目录中运行它，之后的每个命令都会根据它所写
入的标记文件（`.copalibre/installation.json`）自动识别该目录——与 `.git` 标记仓库检出的方式相同。
若目录中已存在一份安装，则拒绝再次运行。目录会固定绑定到创建它时所用的 CopaLibre 版本——并行运行
多个版本意味着每个目录都要运行与之匹配的 CLI 版本（参见[更新](/zh/help/cli/updating/)）。

若不带 `--kubernetes`，会写入 `docker-compose.yml` 和带有非敏感默认值的 `.env`，并列出之后需要在
`.env` 中补全的必需密钥。

- `--module-dev`：同时写入 `docker-compose.module-dev.yml` 和一个 `modules-dev/` 目录，挂载到
  `api`/`worker` 中并预设 `COPALIBRE_MODULE_SOURCE_ALLOWLIST`——与 `module scaffold --output
modules-dev/<alias>` 和 `module add <alias> --source
file:///var/lib/copalibre/modules-dev/<alias>` 搭配使用，可在无需源代码检出的情况下针对一个正在运
  行的自托管实例开发模块。

若带 `--kubernetes`，则会改为写入一个 Helm `values.yaml` 脚手架——没有 compose 文件，也没有
`.env`；Kubernetes 自身的 Secret/ConfigMap 机制仍是配置的权威来源。完整流程，包括将首位管理员的引
导过程作为一次性 Helm Job 执行：见仓库中的 `docs/deployment/enterprise-kubernetes.md`。

- `--kubernetes`：搭建 Helm 安装的脚手架，而非 Compose 安装
- `--namespace <ns>`：要记录的 Kubernetes 命名空间（默认：`default`）
- `--release <name>`：要记录的 Helm release 名称（默认：`copalibre`）
- `--context <ctx>`：要记录的 kube-context（默认：无——需每次显式传入）

## doctor

`copalibre doctor [--check-proxy] [--proxy-url <url>]`

在启动前验证配置和依赖项。

- `--check-proxy`：同时验证反向代理配置
- `--proxy-url <url>`：使用 `--check-proxy` 时用于测试的公开 URL

## dev

`copalibre dev [--hybrid]`

运行开发环境，可以是容器化的或混合模式。

- `--hybrid`：基础设施运行在 Docker 中，应用进程运行在主机上

## start

`copalibre start`

启动 PostgreSQL、运行 doctor，并启动每个进程角色。

## migrate

`copalibre migrate`

运行待应用的数据库迁移。

## backup

`copalibre backup [--file <path>] [--retain <n>] [--dry-run]`

在 `backups/` 下创建一个压缩的**备份包**（`.tar.gz`），其中包含 PostgreSQL 转储和一个清单（日期和
CopaLibre 版本）。应用保留策略：成功备份后，删除超出 `--retain` 数量之外的旧备份包。仅删除匹配备份包命名模式
（`copalibre-<date>.tar.gz`）的文件——绝不触碰 `backups/` 下的其他任何文件。

- `--file <path>`：备份包目标位置，位于 `backups/` 内（默认：带时间戳的名称）
- `--retain <n>`：此次备份后保留的备份包数量（默认：5）
- `--dry-run`：打印备份计划而不实际运行

已安装模块的数据（项目描述符、赛事配置文件）存储在 PostgreSQL 中，因此包含在转储中。对象存储中的对象字节
（`object-storage-data`）不在此命令的范围内——请按照自托管指南的说明，在基础设施层面单独备份它们。

## restore

`copalibre restore --file <path> (--confirm | --dry-run) [--allow-newer-backup]`

提取一个备份包，恢复其 PostgreSQL 转储，运行待应用的迁移，并确认应用后的架构与本实例匹配——所有这些都在一次调用中完成。

- `--file <path>`：要恢复的备份包，位于 `backups/` 内
- `--confirm`：实际执行恢复所必需的标志
- `--dry-run`：打印恢复计划而不实际运行
- `--allow-newer-backup`：恢复由比当前运行版本更新的 CopaLibre 版本生成的备份包（默认拒绝）

成功执行 `pg_restore` 后，`restore` 会自动运行 `copalibre migrate`，然后建立连接以验证应用后的架构版本是否与本实例的预期完全一致（与 `GET /ready` 所用的检查相同）——因此一次恢复绝不会让代码与数据库悄悄地失去同步。如果迁移失败，`restore` 会通过其退出码报告失败，而不会谎称成功；请重试 `copalibre migrate`，然后运行 `copalibre doctor`。

如果备份包清单记录的 CopaLibre 版本比当前运行的版本更新，则在触碰数据库之前就会被拒绝，并同时列出两个版本——请先升级本实例，或者如果你确实打算继续，可传入 `--allow-newer-backup`。

## upgrade-check

`copalibre upgrade-check --target-version <semver>`

在升级前检查已安装模块的兼容性和待应用的迁移。

- `--target-version <semver>`：用于检查模块和迁移的目标 CopaLibre 版本

如果任何已安装模块将与目标版本不再兼容，则以非零状态退出。完整流程请参阅[更新](/zh/help/cli/updating/)。

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <name> --email <email>`

创建某个组织的第一个管理员账户。

## login

`copalibre login [--api-url <url>] [--token <token>]`

保存一个个人访问令牌，使 `statistics-rebuild` 和 `module add/list/remove/verify` 能够通过已认证的
HTTP 连接对远程安装实例进行操作——这是管理一个已在运行的安装实例的途径，包括在 Docker 已经运行之
后安装或更新 CLI，且所用机器完全不需要数据库凭据。请在已登录状态下，从控制面板的偏好设置界面生成
该令牌，然后粘贴到此处。保存前会通过一次已认证的调用校验该令牌；若令牌无效，则拒绝保存且不保存任
何内容。

- `--api-url <url>`：目标安装实例（默认：`COPALIBRE_API_URL`，`copalibre init` 已将其写入 `.env`）
- `--token <token>`：令牌本身（默认：若通过管道传入则从 stdin 读取，否则通过一个会遮蔽每次按键的
  交互式提示读取）

将凭据保存到当前目录的 `.copalibre/credentials.json`（`0600`）——请在 `copalibre init` 所创建的
安装目录内部运行 `login`。在同一目录中再次运行 `login` 会替换已保存的令牌，这与 `init` 的标记文
件不同。

## statistics-rebuild

`copalibre statistics-rebuild --organization <alias> [--tournament <alias>]`

根据源事实——已完成比赛的已记录事件、名单和手动调整——重新计算每一项折叠统计总量
（`statistic_totals`），默认针对整个组织，也可限定为某一项赛事。

- `--organization <alias>`：要为其重新计算统计数据的组织
- `--tournament <alias>`：将重新计算限定在组织内的某一项赛事

幂等：使用与事件驱动触发相同的 `refold` 及"先删除再插入"写入路径，因此连续运行两次会产生逐字节相
同的 `statistic_totals` 行（`updated_at`/内部投影版本除外）。可用于补录统计折叠引擎出现之前记录
的历史数据，或随时对照事实校验统计总量。需要在通过 [`login`](#login) 登录后拥有组织管理员权限。

## module

`copalibre module <add|list|remove|verify>`

管理已安装的项目和赛事配置文件模块。`add`/`list`/`remove`/`verify` 需要在通过 [`login`](#login)
登录后拥有该安装实例范围内的超级管理员权限。

### module add

`copalibre module add <alias>[@range] [--source <url>] [--allow-unsatisfied-capabilities]`

按别名安装一个模块，可选地固定到某个版本范围。

- `--source <url>`：一个已显式启用的替代源，而非默认的精选源
- `--allow-unsatisfied-capabilities`：即使所声明的必需能力尚未满足也强制安装

### module list

`copalibre module list [--outdated]`

列出已安装的模块，或仅列出存在更新版本的模块。

- `--outdated`：仅显示存在已发布新版本的模块

### module remove

`copalibre module remove <alias>`

移除一个未被任何已启动赛事引用的已安装模块。

### module verify

`copalibre module verify`

针对当前运行的核心版本重新验证每个已安装模块。

### module scaffold

`copalibre module scaffold <discipline|tournament-profile> <alias> [--author <name>] [--licence <licence>] [--name <name>] [--source-url <url>] [--output <dir>]`

生成一个结构有效的模块包以开始编写——种子取自 CopaLibre 自身某个已有效的目录文档，而非对模式的盲目猜测——作为一个已打标签的本地 Git 仓库，可直接编辑、验证和安装/提交。

- `--author <name>`：署名作者（默认：Unknown）
- `--licence <licence>`：SPDX 标识符（默认：AGPL-3.0-only）
- `--name <name>`：部署名称（默认：该别名）
- `--source-url <url>`：署名来源 URL
- `--output <dir>`：模块仓库的写入位置（默认：`modules/<alias>`）

### module validate-local

`copalibre module validate-local <path>`

在不搜索或安装本地模块包的情况下对其进行验证——与 `module add`/`module verify` 已应用的检查相同。

### module submit

`copalibre module submit <path> [--upstream <owner/repo>] [--base <branch>]`

Fork `copalibre-modules`，将本地模块复制到一个新分支，推送该分支，并打开一个拉取请求。

- `--upstream <owner/repo>`：目标仓库（默认：`SebaSOFT/copalibre-modules`）
- `--base <branch>`：拉取请求的基础分支（默认：`main`）

## mcp

`copalibre mcp`

启动一个本地 Model Context Protocol（MCP）服务器，使 AI 能够操作 CopaLibre。详情请参阅
[MCP 工具详情](/zh/help/cli/mcp/)。
