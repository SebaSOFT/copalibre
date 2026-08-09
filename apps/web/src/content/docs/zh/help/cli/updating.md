---
title: 更新
description: 更新 CopaLibre 框架及其已安装模块的非破坏性路径。
---

## 更新框架

推荐的非破坏性顺序：

1. **备份**：在动手之前先执行 `./copalibre backup --file backups/pre-upgrade.dump`。
2. **更新**：将检出内容或镜像引用更新到新版本（暂不重启服务）。
3. **检查兼容性**：在不重启任何内容的情况下针对新版本进行检查：
   ```bash
   ./copalibre upgrade-check --target-version <new-version>
   ```
   报告是否有已安装的模块将与该版本不再兼容（与 `module verify` 针对运行版本执行的检查相同，但这里针对的是目标版本），并列出待应用的数据库迁移——但不会实际应用任何迁移。如果有任何模块将变得不兼容，则以非零状态退出；请先解决该问题再继续。
4. **重启**：使用新版本重启（`./copalibre start` 或 `docker compose up --detach --wait`）。待应用的迁移会在任何进程角色开始提供服务之前自动按顺序应用——而非单独的手动步骤。

## 更新模块

每个已安装的项目或赛事配置文件都是独立于框架进行版本管理的模块。

```bash
./copalibre module list --outdated
```

仅列出已安装、且存在比当前安装版本更新的已发布版本的模块。

```bash
./copalibre module add <alias>@<range>
```

安装某个已安装模块的特定版本或版本范围（例如 `@^2.0.0`）——以不同版本重新安装即为更新模块的方式。已在进行中的赛事会继续引用其创建时所用的版本；更新模块绝不会追溯性地更改已在进行中的赛事。

关于 `module` 其余选项的说明，请参阅[命令参考](/help/cli/commands/)。
