# Firefly V1.1.1 — TypeScript 与分发收尾

## 基线与范围

- 分支：`firefly-v1.1.0`
- HEAD：`30ac278cdf0f7419510ae575737ab0ee44d1d744`
- 版本：`1.1.1`
- 本轮保留旧养成退役及前四批全部工作树修改；未提交、未推送、未发布。

本轮只收敛第一方测试、构建/校验工具和 CLI 的 TypeScript 执行与检查边界，未新增产品能力，也未改变 TTS、Live2D、MouthSync、面板、角色行为或主动策略。

## 最终源码归属

第一方维护源码已经按用途迁移为 TypeScript：

- CLI：`src/cli/firefly.mts`
- npm 包装器：`tools/npm/npm.mts`
- 构建资源复制：`tools/build/copy-runtime-resources.mts`
- 架构、TypeScript 与外部验证工具：`tools/verify/*.mts`
- 第一方测试：`tools/test/**/*.ts`

`src` 与 `tools` 中不再有第一方 `.js`、`.mjs` 或 `.cjs` 维护源码。唯一保留的源码目录非 TypeScript 文件是 `src/renderer/live2d/live2dcubismcore.min.js`，它是第三方 Cubism 运行库，由 TypeScript 守卫显式列入允许清单。工作树中的 `.venv`、scratch 及外部缓存不属于维护源码迁移范围。

前四批的领域归属保持不变：应用组合根在 `src/main/application/`，Agent 邻接模块在 `src/main/orchestrator/`，Memory/RAG/Settings 分别在 `src/main/memory/`、`src/main/rag/`、`src/main/settings/`，Proactive/Music/TTS 分别在 `src/main/proactive/`、`src/main/music/`、`src/main/tts/`。本轮没有创建第二套所有者或转发副本。

## TypeScript 检查与执行

严格检查配置为：

- `tsconfig.test.json`：全部 `tools/test/**/*.ts`，`strict: true`、`noEmit`。
- `tsconfig.tools.json`：`tools/build/**/*.mts`、`tools/verify/**/*.mts` 与 `tools/npm/**/*.mts`，严格检查、`noEmit`。
- `tsconfig.cli.json`：`src/cli/**/*.mts`，严格检查并生成 `dist/cli/`。

`package.json` 的 `typecheck` 已串接 `typecheck:tests` 和 `typecheck:tools`；测试与工具执行使用 `node --experimental-strip-types`。迁移旧测试时保留原断言，删除被替代的活动 `.mjs` 副本，默认 `npm test` 只执行当前 TypeScript 测试入口，每个活动测试执行一次。

Windows 包装器 `tools/npm/npm.cmd`、`tools/npm/npm.ps1` 与 `setup.bat` 已改为调用 `tools/npm/npm.mts`，并保留原命令参数和工作目录处理。`npm run typecheck` 通过 `typecheck:tools` 对该 `.mts` 包装器执行 `strict`、`noEmit` 检查；它不依赖构建后的 CLI 或 Main 输出。

## CLI 与发布入口

`src/cli/firefly.mts` 是唯一 CLI 源实现。`npm run build:cli` 将其生成到 `dist/cli/firefly.mjs`，`package.json` 的两个命令保持同一编译入口：

```json
{
  "firefly": "./dist/cli/firefly.mjs",
  "firefly-agent": "./dist/cli/firefly.mjs"
}
```

保留的选项为 `--help`/`-h`、`--version`/`-v`、`--dev` 和 `--smoke-test`；编译入口在缺少主进程产物时仍以非零状态退出。未新增 CLI 命令或产品模式。

## 构建与资源

`tools/build/copy-runtime-resources.mts` 保留精确复制和旧输出清理职责，复制：

- `src/main/rag/knowledge/` → `dist/main/main/rag/knowledge/`
- `src/main/settings/settings.example.json` → `dist/main/main/settings/settings.example.json`
- `src/main/music/scripts/` → `dist/main/main/music/scripts/`

它精确清理本轮迁移对应的旧输出根：

- `dist/main/main/character/memory`
- `dist/main/rag`
- `dist/main/settings`
- `dist/main/main/orchestrator/proactive`
- `dist/main/main/runtime/music`
- `dist/main/main/runtime/tts`

没有清理用户配置、Memory 数据、RAG 索引、缓存、模型、外部语音资源或无关输出。QQMusic bridge 已移除仓库源码脚本回退；运行时只从编译目录及其分发包内的 `dist/main/main/music/scripts/` 定位脚本。发布清单不再声明 `src/main/music/scripts`。

## 本轮验证

本轮实际执行结果：

- `npm run typecheck`：PASS；包含主进程、preload、renderer、全部 TypeScript 测试、构建工具与 CLI 的严格检查。
- `npm run build`：PASS；CLI、Main、Preload、Renderer 和三组运行资源均生成。Vite 保留既有 Cubism 外部脚本及大 chunk 警告，但未失败。
- `npm test`：PASS；包含隔离 npm tarball 测试、前四批目录/生命周期/授权/Worker/Memory/RAG/Music/TTS/界面回归及全部迁移后的 TypeScript 测试。
- `npm run verify:typescript`：PASS；守卫扫描 `src` 与 `tools`，只发现并批准第三方 Cubism runtime 一个非 TypeScript 文件。
- `npm run verify:architecture`：PASS；新目录存在且被扫描，旧目录退役及单一所有者约束有效。
- `git diff --check`：PASS；仅报告 Git 的换行符转换提示，无 whitespace error。

## 组合根启动修复补充

`tools/npm/npm.mts` 已加入 `tsconfig.tools.json` 的严格 `noEmit` 范围，
并继续由 `npm run typecheck` 通过 `typecheck:tools` 执行。它与构建工具、
验证工具和 `src/cli/**/*.mts` 的覆盖范围分开列出，避免把 npm 包装器误算为
CLI 编译产物。

本轮 `npm run typecheck`、`npm run build`、`npm test`、
`npm run verify:typescript`、`npm run verify:architecture` 和
`git diff --check` 均实际通过。构建后的应用使用
`node --experimental-strip-types tools/npm/npm.mts run start` 启动成功；
这项结果补充了此前仅有自动测试通过、但未覆盖默认组合根真实启动的缺口。

`npm test` 中的发布测试在临时目录执行 `npm pack`、解包、隔离 CLI `--version` 与资源检查；没有执行 `npm publish` 或全局安装。没有进行真实 QQMusic 播放、GPT-SoVITS 实时语音/真人听感或 GUI 人工验收。

## 剩余非 TypeScript 文件与边界

| 文件或范围 | 处理结论 |
| --- | --- |
| `src/renderer/live2d/live2dcubismcore.min.js` | 第三方 Cubism 运行库，保留并由 TypeScript 守卫显式批准。 |
| `setup.bat`、`tools/npm/npm.cmd`、`tools/npm/npm.ps1` | 平台包装器，不属于 JavaScript 源码迁移对象；入口已指向当前 TypeScript 工具。 |
| `dist/**/*.js`、`dist/**/*.mjs` | TypeScript/Vite 构建产物，正常保留，不计为未迁移源码。 |
| `.venv`、scratch、外部缓存 | 不属于第一方维护源码，不纳入本轮。 |

本轮完成后停止，不自动进入第六批；未提交、未推送、未发布。
