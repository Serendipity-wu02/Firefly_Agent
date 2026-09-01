# Firefly-Pet 开发与贡献指南

- **当前版本**：V2.4 (Development)
- **基线状态**：Node.js 24+ / npm 11 基线已锁定
- **技术栈**：Electron + TypeScript + React 19 + PixiJS Live2D + Vite

---

## 1. 环境基线与项目随附 npm 11 提供机制 (Environment Baseline & npm 11)

- **Node.js**: `>= 24.0.0` (推荐 Node.js 24 LTS，项目提供 `.node-version` 与 `.nvmrc`)
- **npm**: `>= 11.0.0` (项目通过 `package.json` 中的 `packageManager: "npm@11.17.0"` 与 `engines` 锁定)
- **开发者无需手动升级全局 npm**：项目随附提供 Corepack 自动调度与项目级 CLI 封装器，满足任意一种启动方式即可统一运行 npm 11：
  1. **一键初始化（推荐）**：双击运行 `setup.bat`，自动完成依赖安装、环境基线自检与全工程构建；
  2. **项目级脚本启动**：使用 `node tools/npm.mjs <command>` 或 `.\tools\bin\npm.cmd <command>`（例如 `node tools/npm.mjs install`、`node tools/npm.mjs test`）；
  3. **Corepack 原生支持**：执行 `corepack enable` 后直接运行标准 `npm <command>`。
- **强制引擎校验**: 项目根目录配置 `.npmrc` (`engine-strict=true`)，杜绝非兼容版本安装
- **基线自检**: 执行 `node tools/test_environment_baseline.mjs` 验证当前环境与工具链是否 100% 就绪

---

## 2. 工程规范与构建指令

### 开发模式
```bash
npm run dev
```

### 类型检查
```bash
npm run typecheck
```

### 正式构建
```bash
npm run build
```

---

## 3. 自动化测试套件

### Node.js 核心回归测试
```bash
# 执行全部 Node.js 测试 (包含环境基线与 23 个测试套件)
npm test

# 或单独执行环境基线自检：
node tools/test_environment_baseline.mjs
```

### Python 资产与意图校验
```bash
python tools/validate_ai_intent.py
python tools/validate_asset_structure.py
python tools/validate_character_resources.py
python tools/validate_firefly_assets.py
python tools/validate_persistence.py
```

### 真实模型推理与 Electron 烟雾测试
```bash
node tools/verify_live_voice.mjs
$env:ELECTRON_SMOKE_TEST="1"; npx electron .
```

---

## 4. 架构分层约定

1. **Agent Core 纯粹性**：`src/main/agent/firefly-agent-core.ts` 严禁直接引入渲染层、UI 层、Live2D、TTS 或窗口对象，必须保持纯逻辑状态。
2. **多进程通信**：所有主进程向渲染进程广播通过 `WindowManager.broadcast(channel, data)` 统一分发，信道常量必须集中定义在 `src/shared/ipc-channels.ts`。
3. **音频处理原则**：真实语音推理仅通过 HTTP API 访问外部 GPT-SoVITS 服务，大型权重文件严禁复制入 Electron 代码仓库。
