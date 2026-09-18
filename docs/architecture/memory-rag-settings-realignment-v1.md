# Firefly V1.1.1 — Memory / RAG / Settings Realignment V1

## 基线与范围

- 分支：`firefly-v1.1.0`
- 基线提交：`30ac278cdf0f7419510ae575737ab0ee44d1d744`
- 版本：`1.1.1`
- 本轮只整理仓库目录、消费者导入、运行资源定位和 TypeScript 测试检查。
- 不改变 Memory/RAG 数据模型、Settings 结构、用户数据位置、权限语义或产品行为。
- 不提交、不推送；前两批及工作树中的既有修改保留。

## 实际旧路径 → canonical 路径

| 旧路径 | 当前路径 | 保留的所有者 |
| --- | --- | --- |
| `src/main/character/memory/` | `src/main/memory/` | `FireflyMemoryService`、Memory Store、协调、检索、写入、维护与演化模块 |
| `src/rag/` | `src/main/rag/` | Knowledge Coordinator、摄取、Hybrid/Vector/Lexical 检索、投影与知识资源 |
| `src/settings/` | `src/main/settings/` | `SettingsManager` 与 `settings.example.json` |

迁移通过物理目录移动完成。生产导入、组合根、测试导入、架构守卫和发布清单均指向 canonical 路径；旧源码根和本轮对应的旧构建根不再作为活动入口。

## 生产消费者与所有权

`src/main/application/default-dependencies.ts` 继续是组合根，构造并传递同一个 Memory service、SettingsManager、KnowledgeCoordinator、MemorySlot、RagSlot 和 ContextManager。Chat、Music Preference 和 Character 通过既有服务/接口消费 Memory，没有新增记忆状态所有者。

`SettingsManager` 仍是权限配置的唯一持久化所有者。Provider、TTS、窗口和 UI 配置仍属于原有 Settings snapshot/update 契约；本轮没有改写配置结构或清空用户字段。

`KnowledgeCoordinator` 仍拥有 RAG 运行时流水线。它的默认资源解析顺序是：

1. 编译运行时 `__dirname/knowledge`；
2. 开发源码 `process.cwd()/src/main/rag/knowledge`；
3. 若两者都不存在，返回编译运行时目录供后续缺失资源处理。

组合根使用 `resolveKnowledgeDataDir()`，因此开发运行和构建/分发运行不会继续依赖旧的 `src/rag/knowledge`。

## 用户数据与仓库资源

本轮没有移动用户数据：

- Settings：`app.getPath("userData")/settings.json`；非 Electron 测试回退为工作目录 `settings.json`。
- Memory：`app.getPath("userData")/memory.json`；非 Electron 测试回退为工作目录 `memory.json`。
- Memory Store 继续保留当前 schema、legacy `memory.json` 只读兼容和原子写入语义。
- RAG 的仓库知识资源位于 `src/main/rag/knowledge/`；向量索引等可写数据仍由实际调用方通过既有路径/选项提供，本轮不搬动用户索引。
- Settings 示例位于 `src/main/settings/settings.example.json`，构建时复制到 `dist/main/main/settings/settings.example.json`。
- 知识资源构建时复制到 `dist/main/main/rag/knowledge/`。

`tools/build/copy-runtime-resources.mts` 在复制前只精确清理本轮迁移对应的旧构建根：`dist/main/main/character/memory`、`dist/main/rag`、`dist/main/settings`。没有清理用户目录、模型、Memory 数据或其他缓存。

## 发布与构建

`package.json` 的 `files` 保留 `dist`，并包含：

- `src/main/settings/settings.example.json`
- `src/main/rag/knowledge`

因此 npm 分发同时包含编译运行资源和 canonical 源资源。分发测试在临时目录打包、解包和检查，不改写真实用户文件。

## TypeScript 测试检查

新增 `tsconfig.test.json`，对 `tools/test/**/*.ts` 启用 `strict: true`、`noEmit` 和当前 Node/ESM 导入语义。`package.json` 新增 `typecheck:tests`，默认 `typecheck` 在主进程、preload、renderer 检查后执行它。

本轮涉及的 Memory、RAG、Settings 及其目录契约测试已迁移到 `.ts`，默认 `npm test` 使用 `node --experimental-strip-types` 执行；未涉及的工具测试仍按原入口保留。类型检查与运行测试是两个独立门槛。

`tools/verify/verify-architecture.mts` 明确检查三个 canonical 源根包含 TypeScript 文件且被扫描，并拒绝三个旧源码根；它同时保留前两批的 Agent、Tool、Authorization、Worker 唯一所有者检查。

## 本轮验证记录

- `npm run typecheck:tests`：PASS（0 个 TypeScript 诊断）。
- `npm run typecheck`：PASS。
- `npm run build`：PASS；构建资源复制 PASS，Vite 仅保留既有资源/大 chunk 警告。
- canonical/retired 资源路径契约测试：PASS（`tools/test/core/memory-rag-settings-realignment.test.ts`，4 项）。
- `npm run verify:typescript`：PASS。
- `npm run verify:architecture`：PASS。
- `git diff --check`：PASS（仅有 Git 的换行符转换提示，无空白错误）。
- 完整 `npm test`：PASS；包含迁移后的 Memory、RAG、Settings、Character、权限、Worker、界面与目录契约测试。
- `tools/test/core/memory-rag-settings-realignment.test.ts`：PASS（4/4，源码根、构建根、资源、用户数据契约与发布清单）。
- GUI/人工验收：未执行；本轮为目录、构建和契约整理，不构成 GUI 通过证据。

## 保留与后置

保留 Memory 的存储、检索、写入策略、冲突处理、衰减、维护和音乐偏好证据等级；保留 RAG 的摄取、索引、检索和 Context 投影；保留 Settings 的现有配置结构及唯一持久化所有权。

第四批已将 Proactive、Music、TTS 归位到 `src/main/proactive/`、`src/main/music/`、`src/main/tts/`；本轮及第四批均不新增主动来源、不恢复旧养成状态或主动生产注册，不扩展 Worker/SubAgent，不修改语音、Live2D、MouthSync 或面板 UI。
