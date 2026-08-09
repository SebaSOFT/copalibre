---
title: 命令参考
description: 每个 copalibre CLI 命令、其用法及其选项标志。
---

每个命令都以完全相同的用法文本响应 `--help`/`-h`，这些文本由 CLI 内部的同一处来源生成——本页面无法以不同于 CLI 实际执行方式的方式来描述某个命令。

## init

`copalibre init [--file <path>]`

写入非敏感的默认值，并列出所需的密钥。

- `--file <path>`：目标文件（默认 `.env`）

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

如果任何已安装模块将与目标版本不再兼容，则以非零状态退出。完整流程请参阅[更新](/help/cli/updating/)。

## create-admin

`copalibre create-admin --organization-alias <alias> --organization-name <name> --email <email>`

创建某个组织的第一个管理员账户。

## module

`copalibre module <add|list|remove|verify>`

管理已安装的项目和赛事配置文件模块。

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
[MCP 工具详情](/help/cli/mcp/)。
