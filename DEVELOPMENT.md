# Firefly-Pet 开发与贡献指南 (V1 Baseline)

- **当前状态**：V1.0.0 COMPLETE (FROZEN)
- **技术栈**：Electron + TypeScript + React 19 + PixiJS Live2D + Vite

---

## 1. 工程规范与构建指令

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

## 2. 自动化测试套件

### Node.js 核心回归测试
```bash
# 执行全部 Node.js 测试
npm test

# 或单独执行特定测试：
node tools/test_firefly_agent_core_freeze.mjs
node tools/test_firefly_agent_core_v1.mjs
node tools/test_firefly_voice_v1.mjs
node tools/test_llm_tts_live2d_chain.mjs
node tools/test_music_system.mjs
node tools/test_qqmusic_desktop_bridge.mjs
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

## 3. 架构分层约定

1. **Agent Core 纯粹性**：`src/main/agent/firefly-agent-core.ts` 严禁直接引入渲染层、UI 层、Live2D、TTS 或窗口对象，必须保持纯逻辑状态。
2. **多进程通信**：所有主进程向渲染进程广播通过 `WindowManager.broadcast(channel, data)` 统一分发，信道常量必须集中定义在 `src/shared/ipc-channels.ts`。
3. **音频处理原则**：真实语音推理仅通过 HTTP API 访问外部 GPT-SoVITS 服务，大型权重文件严禁复制入 Electron 代码仓库。
