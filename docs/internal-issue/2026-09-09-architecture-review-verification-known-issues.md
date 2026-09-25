# 项目级架构评审核验与待办（2026-09-09）

> 范围：当前 `master` 的 `src/main`、测试配置与 GitHub Actions（GitHub 自动化流水线）；前端 UI（用户界面）不作为主要评价对象。
> 核验基线：`d1b4b3a2a5810a432e99eb5f74d176d8e6decf8c`，本地 `master` 与 `origin/master` 一致，核验前后工作区干净。
> 方法：静态代码走读、测试文件与 CI（持续集成）路径匹配核算、完整 Vitest（测试框架）测试执行。
> 结论：外部架构评审的主要事实基本正确；两个 P1（高优先级）问题真实存在，但部分重构优先级和风险解释需要修正。

## 当前状态

| # | 项目 | 核验状态 | 当前判断 |
| --- | --- | --- | --- |
| 1 | CI 未覆盖权威测试全集 | **已确认，未修复** | P1；实际遗漏范围比外部评审列举的更大 |
| 2 | Memory recovery（记忆恢复）备份失败后仍可能覆盖原文件 | **已确认，未修复** | P1；存在用户数据不可恢复风险 |
| 3 | Memory 正常保存不是 atomic write（原子写入） | **已确认，未修复** | 与问题 2 合并处理，并补故障注入测试 |
| 4 | `core-bootstrap.ts` 沙箱降级注释过期 | **已确认，未修复** | 立即修正文案；代码安全边界本身正常，定为 P2 |
| 5 | 渠道实际发送文本与提交历史可能不一致 | **已确认，未修复** | P2 正确性问题；截断后仍提交模型原始全文 |
| 6 | `tool-registry.ts` 混入具体记忆工具实现 | **已确认，未修复** | P2 架构债务，不是当前运行时缺陷 |
| 7 | 工具注册仍有模块加载副作用 | **已确认，未修复** | P2；应逐步改为显式注册函数 |
| 8 | Plugin Runtime（插件运行时）仍依赖全局单例 | **已确认，未修复** | P2；主要影响依赖透明度和可测试性，不等于安全隔离 |
| 9 | 渠道日志在主进程消息路径同步读写 | **已确认，未修复** | P2 性能债；当前按行而非按字节限制 |
| 10 | Channels / Scheduler 等待 MCP（模型上下文协议）恢复 | **顺序已确认，问题未证实** | Scheduler（调度器）存在明确依赖，不能直接拆除屏障 |
| 11 | Electron（桌面应用框架）渲染进程显式关闭沙箱 | **已确认，未修复** | P2/P3 安全加固项；需先验证 preload（预加载脚本）兼容性 |

## 验证结果

执行：

```powershell
npm test -- --reporter=dot
```

结果：

```text
Test Files  452 passed (452)
Tests       3931 passed (3931)
Duration    138.29s
```

这证明当前完整测试全集是绿色的，但不能证明 GitHub Actions 当前会执行该全集。

---

## 问题 1（P1）：CI 绿色不等于完整测试全集绿色

### 证据

[`vitest.config.ts`](../../vitest.config.ts) 的 `include` 定义了以下权威范围：

```text
src/plugins/**/*.test.ts
src/main/**/*.test.ts
src/renderer/**/*.test.ts
src/shared/**/*.test.ts
src/cli/**/*.test.ts
skills/**/tests/**/*.test.ts
scripts/cline-poc/**/*.test.ts
packages/*/src/**/*.test.ts
```

但 [`.github/workflows/test.yml`](../../.github/workflows/test.yml) 采用手工目录分组，并用非递归 `Get-ChildItem` 兜底 `src/main` 与 `src/main/orchestrator` 根目录。

按当前仓库文件与工作流路径匹配核算：

| 口径 | 测试文件数 |
| --- | ---: |
| Vitest 权威全集 | 452 |
| 当前 CI 可覆盖 | 约 357 |
| 当前 CI 遗漏 | **95** |

主要遗漏：

| 目录 | 遗漏测试文件数 |
| --- | ---: |
| `src/main/orchestrator/` 未列出的子目录 | 24 |
| 其中 `src/main/orchestrator/harness/` | 22 |
| `src/main/plugin-host/` | 11 |
| `src/main/tts/` | 11 |
| `src/main/application/` | 10 |
| `src/main/moments/` | 10 |
| `src/main/lsp/` | 5 |
| `src/main/code-git/` | 4 |
| `src/main/settings/` | 4 |
| 其他目录与 `packages/plugin-sdk` | 16 |

### 建议方案

保留现有分组用于失败定位，但增加最终权威门禁：

```yaml
- name: Test authoritative suite
  run: npm test
```

不要继续手工维护第二份测试目录清单。完整范围已经由 `vitest.config.ts` 管理，CI 直接复用即可。

### 验收标准

1. CI 中存在一次不带目录过滤的 `npm test` 或 `npx vitest run`。
2. `src/main/application`、`src/main/plugin-host`、`src/main/orchestrator/harness` 的测试失败能让 CI 失败。
3. `packages/*/src/**/*.test.ts` 新增测试无需再修改工作流即可被执行。

---

## 问题 2（P1）：Memory 恢复可能覆盖唯一原始文件

### 证据链

[`src/main/memory/memory-store.ts`](../../src/main/memory/memory-store.ts) 的 `load()` 当前行为：

```text
读取或迁移 memory.json 失败
  → 尝试 backupMemoryFile()
  → 备份异常被 catch 吞掉
  → 创建默认 Memory
  → save() 写回 memory.json
```

关键代码位于 `memory-store.ts:68-75`。其中注释明确写着，即使备份失败也继续生成默认文件。

[`src/main/memory/memory-store-io.ts`](../../src/main/memory/memory-store-io.ts) 当前实现：

- `backupMemoryFile()` 使用 `copyFileSync`；
- `writeMemoryFile()` 使用 `writeFileSync` 直接覆盖目标文件；
- 没有临时文件、刷盘和 rename（重命名替换）步骤。

因此在备份目录无权限、磁盘空间不足或其他 I/O（输入输出）故障下，默认写入仍可能截断或覆盖原始 `memory.json`，使人工恢复失去唯一数据源。

### 测试缺口

现有测试只覆盖：

- 正常读写；
- 缺目录时自动创建；
- 备份成功；
- 原文件不存在时备份为空操作；
- 旧版本迁移成功且生成备份。

尚未覆盖：

- 备份失败后原文件保持逐字节不变；
- 临时文件写入失败；
- rename 失败；
- 进程在写入中途退出后的恢复行为。

`memory-store.test.ts` 中“atomic write APIs”指业务更新接口，不是文件系统原子写验证，不能作为本问题已受保护的证据。

### 建议方案

1. 恢复失败且备份失败时，只在内存中启动默认状态，标记 Memory degraded（降级），禁止写原路径。
2. 只有确认备份成功后，才允许把恢复状态持久化。
3. 正常保存改成临时文件写入完成后再 rename 替换。
4. 优先复用仓库已有原子落盘模式：
   - `src/main/token-usage-store.ts`；
   - `src/main/plugin-host/secrets-service.ts`；
   - `src/main/orchestrator/review/run-review-tracker.ts`；
   - `src/main/learn/obsidian/obsidian-workspace-service.ts`。
5. 如果多个存储模块都需要相同保证，再提取小型共享 helper（辅助函数）；不要在每个模块重复实现。

### 验收标准

1. 故障注入令备份抛错后，原 `memory.json` 内容完全不变。
2. 加载可以返回内存默认状态，但必须可观察到 degraded 原因。
3. 正常保存不直接以 `w` 模式打开正式文件。
4. 临时写入或替换失败时，上一版正式文件仍可解析。

---

## 问题 3（P2，立即小修）：沙箱启动注释与实际安全语义冲突

[`src/main/application/core-bootstrap.ts`](../../src/main/application/core-bootstrap.ts) 当前注释写着：

```text
SRT 沙箱：失败不阻塞启动（fallback 到直接 spawn）
```

实际 [`run-shell-tool.ts`](../../src/main/orchestrator/tools/builtin-tools/run-shell-tool.ts) 已采用 fail-closed（失败关闭）执行计划：

- 包装异常：拒绝，不启动进程；
- `wrap_failed`：拒绝；
- `not_ready`：只读和写操作都拒绝；
- `disabled + mutation`：拒绝；
- 仅 `disabled + read`：允许直接执行。

`run-shell-fail-closed.test.ts` 已用 `spawnCalls === 0` 保护该不变量，本次完整测试也通过。

建议只改注释并增加准确指向，不需要重写运行时代码。正式严重度为 P2，但因改动极小且误导安全维护，建议与 P1 同批完成。

---

## 问题 4（P2）：渠道实际发送文本与历史提交文本不一致

[`src/main/channels/dispatcher.ts`](../../src/main/channels/dispatcher.ts) 已正确实现“发送成功后才提交助手历史”，发送失败不会污染助手历史。

剩余问题位于：

- `outgoing-composer.ts:102-107`：按渠道 `maxTextLength` 截断实际发送文本；
- `outgoing-composer.ts:255`：`assistantText` 仍保存未截断的模型原始回复；
- `channel-context.ts:192-210`：渠道与绑定桌面会话都提交 `prepared.assistantText`。

结果是：用户收到的可能是截断文本，但下一轮模型历史中记录的是完整文本，模型会误以为未发送部分已经送达。

建议 `PreparedOutgoing` 明确区分：

```text
sourceText       模型原始回复
committedText    根据最终 OutgoingMessage 实际可见文本生成
```

发送成功后只把 `committedText` 写入对话历史；原始文本如需诊断应进入单独日志或元数据。

---

## 已确认的架构债务

### `default-dependencies.ts`

当前约 659 行。作为 Composition Root（组合根），体积本身不是问题；但文件中已经出现：

- Memory / RAG（检索增强生成）协调；
- 多窗口运行状态广播；
- Moments 媒体匹配器注册；
- Plan IPC（计划模式进程间通信）条件；
- Toast（提醒弹窗）抑制规则。

原则：允许决定“谁连接谁”，业务条件和恢复策略应逐步移入所属模块。当前无需仅为减少行数机械拆分。

### `cyrene-agent.ts`

当前 682 行，确实同时承担运行参数、生命周期、事件映射、工具调用入口、权限、取消和终态映射等职责。它是下一阶段候选重构点，但当前没有证据表明必须立即拆分。

### `tool-registry.ts`

当前约 475 行。前半部分是注册表类型和查询机制，后半部分直接实现并注册：

- `imported_docs`；
- `user_memory`；
- `read_memory`；
- `write_memory`。

具体 Memory Tools（记忆工具）应迁移到独立模块，再通过显式 `registerMemoryTools(registry)` 注册。

`tool-registration.ts` 仍通过导入 `fs-tools` 和 `built-in-tools` 触发注册；`built-in-tools.ts` 虽然集中列出工具，但仍在模块加载时直接调用全局注册表。应逐步改为显式注册函数，避免隐藏执行行为。

### `plugin-runtime.ts`

已经存在 `PluginRuntimeDeps`，但仍直接导入：

- `channelManager`；
- `toolRegistry`；
- `activeChatTargetRegistry`；
- 聊天存储与提示词注册表。

继续 Dependency Injection（依赖注入）有利于依赖透明度、测试隔离和未来多实例支持。

但必须区分：DI 不是插件安全边界。当前插件通过 `require()` / 动态 `import()` 在 Electron 主进程执行，项目文档也明确采用“可信同进程插件模型”。即使全部改为 DI，恶意插件仍可直接使用完整 Node.js（JavaScript 服务端运行时）能力。

如果未来官方市场允许未经代码审核的不可信插件，需要单独设计独立进程或 Sandbox（沙箱）模型；不能把“去全局状态”当成安全隔离方案。

---

## 性能与安全加固项

### 渠道消息日志

[`src/main/channels/message-log.ts`](../../src/main/channels/message-log.ts) 每次写日志都会：

```text
appendFileSync
→ readFileSync 整文件
→ split
→ 必要时 writeFileSync 整文件
```

该路径位于 Electron 主进程消息处理链。虽然限制为 1000 行，但没有限制单行字节数，因此不能简单视为固定小文件。

建议复用 Node.js（JavaScript 服务端运行时）异步文件接口，实现单写队列；在内存维护行数或按文件字节大小轮转。需要保证进程退出时有明确 flush（刷盘）策略。

### Renderer sandbox（渲染进程沙箱）

桌宠、音乐、Toast 和多数辅助窗口均设置：

```ts
contextIsolation: true
nodeIntegration: false
sandbox: false
```

前两项正确；显式关闭进程沙箱属于可继续加固的点。不要直接全局替换，应先逐个窗口验证 `src/preload` 只使用沙箱预加载允许的能力，并补窗口加载与 IPC 冒烟测试。

Electron 官方安全清单仍建议启用进程沙箱：
<https://www.electronjs.org/docs/latest/tutorial/security>

---

## Background 等待 MCP：当前不应直接拆

[`src/main/application/background.ts`](../../src/main/application/background.ts) 的 Group A 当前严格顺序为：

```text
MCP prune
→ builtin sync
→ MCP restore（最长 30 秒屏障）
→ channels start
→ scheduler start
→ proactive trigger
→ moments scanner
```

外部评审提出“如果后续模块不依赖 MCP，可拆开”是合理的调查方向，但不是已经确认的缺陷。

`src/main/scheduler/bootstrap.ts` 明确声明调度器必须在 MCP 恢复后启动；调度任务执行时会从全局工具注册表读取工具。如果提前启动，恰逢到期任务触发时可能看不到尚未恢复的 MCP 工具。

后续若要缩短后台可用时间，应先分别证明依赖：

1. Channels 是否需要等待 MCP；
2. Proactive 是否通过 Scheduler 或工具集合间接依赖 MCP；
3. 插件任务是否可能在 MCP 恢复完成前触发；
4. 提前启动后如何处理工具目录在运行中增量变化。

在这些契约明确前，不把拆屏障列入 P2 施工。

---

## 建议实施顺序

1. **P1-A：Memory 故障安全恢复 + 原子落盘 + 故障注入测试。**
2. **P1-B：CI 增加权威全集门禁。**
3. **P2-A：渠道 committedText（实际提交文本）与真实发送内容对齐。**
4. **P2-B：修正 `core-bootstrap.ts` 沙箱过期注释。**
5. **P2-C：渠道日志改为异步单写队列并限制文件字节规模。**
6. **P2-D：具体记忆工具移出注册表，消除模块加载副作用。**
7. **P2-E：Plugin Runtime 继续去全局依赖；安全隔离另立议题。**
8. **P2/P3：逐窗验证并尝试开启渲染进程沙箱。**
9. **观察项：记录 `default-dependencies.ts` 与 `cyrene-agent.ts` 的职责增长，不按行数机械拆分。**
10. **调查项：只有完成 MCP 依赖图后再决定是否拆 Background 屏障。**

## 对外部评分的处理

“后端约 8.9/10”以及各模块小数评分属于评审者主观判断，没有统一量表、覆盖率报告、威胁模型验收或性能基线，不能作为可复现工程指标。

可以确认的客观事实是：

- Shell → Core → Background 分层真实存在；
- 多项测试在保护生命周期、发送提交和沙箱安全不变量；
- 当前权威测试全集 452 个文件、3931 项全部通过；
- CI 仍漏掉 95 个测试文件；
- Memory 恢复和直接覆盖写存在真实数据安全缺口；
- 插件系统是明确声明的可信同进程模型，不应误解为已建立恶意代码隔离。
