# Firefly-Agent (流萤桌面智能体) - v1.1.0

> 🚀 **Firefly Desktop AI Agent** — 基于 Electron + TypeScript + PixiJS Live2D + GPT-SoVITS + Windows GSMTC + Memory v2 + RAG 知识库检索与统一具身多模态调度的流萤桌面智能体。

---

## 📌 版本状态 (Release Status)

- **当前版本**：`v1.1.0`
- **基线状态**：**COMPLETE / VERIFIED** (目录重构、GUI 基线修复与运行时验证全部通过)
- **验收报告**：[docs/v1.1.0-runtime-baseline-acceptance-report.md](docs/v1.1.0-runtime-baseline-acceptance-report.md)
- **重构报告**：[docs/v1.1.0-repository-reorganization-report.md](docs/v1.1.0-repository-reorganization-report.md) | [docs/v1.1.0-cleanup-report.md](docs/v1.1.0-cleanup-report.md)

---

## 🌟 核心特性 (Features)

1. **Light Sky 对话视窗与认知心境 (Harness Chat & Mood Window)**：
   - **与流萤对话 (Chat Window)**：`1344 × 756` (16:9 桌面标准布局)，浅绿晴空纯净视觉，真实角色头像与气泡。
   - **流萤认知心境 (Mood Window)**：`254 × 388` 独立无边框置顶视窗，支持独立自由拖拽（`-webkit-app-region: drag`），单次初始锚定 Chat 右侧，移动与 Desktop Pet / Chat 彻底解耦。
   - **真实在线状态 (ProviderStatus)**：真实展示内置规则引擎状态或外部 API 连接状况，未配置时显示离线，绝不伪造在线。

2. **桌面交互与 Live2D 表现 (Desktop Pet - Live2D Only)**：
   - `429 × 315` 纯净透明视窗，Live2D Cubism 3 模型 (`Firefly.model3.json`) 渲染。
   - 默认稳定启动表情 `expression00` 与待机动作 `Idle/0`。
   - 像素级 Alpha 透明度采样（`alphaThreshold: 15`）、鼠标穿透、平滑拖拽与右键托盘/上下文菜单。

3. **FireflyAgentCore (智能体核心)**：
   - `FireflyAgentCore` 是公共 `IAgentCore` facade，唯一的 Agent Loop 由内部 `FireflyHarness` 持有。
   - 具备 Context 预算层、Tool Policy 策略控制、多步骤有界规划（Bounded Planner）与断点容灾恢复（Recovery Manager）。
   - 防崩溃事件总线 (`AgentEventBus`) 与防御性消息隔离 (`AgentSession`)。
   - 真实报错传播，故障时绝不伪造 Persona 回复。

4. **统一具身策略驱动 (Unified Embodiment Multimodal Chain)**：
   - `CharacterPolicyEngine` 统一仲裁 BehaviorDecision 并输出 `EmbodimentPlan`。
   - 依托唯一的 `correlationId` 跨进程同步调度 Live2D 动作、TTS 语音韵律及心境卡片总结。

5. **动态流萤 AI Voice (GPT-SoVITS AI Voice)**：
   - 接入本地独立运行的 GPT-SoVITS 推理服务（`http://127.0.0.1:9880/tts`）与云端多引擎。
   - 实时音频口型同步（`MouthSyncController`），具备完整的 `[TTS Trace]` 诊断链路与真实错误状态呈现。

6. **Memory v2 (分层认知记忆系统)**：
   - L0 工作记忆 / L1 短期情境 / L2 长期语义三层分级架构。
   - 5 维记忆加权打分检索器（Exact, Partial, Entity, Importance, Recency）。
   - 记忆生命周期演进：Ebbinghaus 衰减引擎、冲突消解仲裁（Conflict Resolver）与访问升阶整合（Consolidator）。

7. **RAG 知识库检索增强 (Canonical Knowledge Corpus & Hybrid Retrieval)**：
   - 官方只读知识库语料（`src/main/character/resources/`，806 文件）切片索引。
   - 预构建向量索引与标准化切片位于 `data/knowledge/`。
   - 词法倒排 + 稠密向量双流召回，5 维重排序打分（`KnowledgeReranker`）。

8. **系统媒体控制 (QQ Music GSMTC)**：
   - 通过 Windows GSMTC (Global System Media Transport Controls) API 深度桥接本地运行的 `QQMusic.exe`。
   - 支持 Agent 原生查询当前曲目、艺术家、进度并执行播放/暂停控制。

---

## 📁 目录结构 (Directory Structure)

```text
Firefly-Pet/
├── data/knowledge/            # RAG 运行时切片与向量索引 (只读缓存)
│   ├── chunks.json            # 5,665 个预解析切片
│   ├── vector_index.json      # 向量索引数据
│   └── manifest.json          # 语料清单 SHA-256
├── docs/                      # 架构全景、阶段交付与验收报告
├── src/
│   ├── cli/                   # 命令行启动入口 (firefly.mjs)
│   ├── main/                  # Electron 主进程
│   │   ├── character/         # 角色策略、具身映射与 806 篇官方原始语料 resources
│   │   ├── chat/              # Chat IPC 通信与 EmbodimentPlan 调度
│   │   ├── llm/               # LLM Provider 工厂与适配层
│   │   ├── orchestrator/      # AgentCore facade, FireflyHarness, ContextManager, ProactiveScheduler
│   │   ├── rag/               # RAG 协调器与检索流水线
│   │   ├── runtime/           # Runtime 服务 (TTS, Music, Execution)
│   │   ├── state/             # 角色状态管理器
│   │   ├── tools/             # 工具注册中心与分发器
│   │   └── windows/           # WindowManager (Pet, Chat, Mood, Settings)
│   ├── preload/               # 上下文安全隔离 Preload 脚本
│   ├── renderer/              # 渲染层 (PixiJS Live2D + Light Sky React UI)
│   │   ├── public/            # Live2D 模型、动作与表情资产
│   │   ├── tts/               # TTS 音频播放器与状态追踪
│   │   └── ui/                # React 对话与心境卡片组件
│   ├── settings/              # SettingsManager 与默认模板
│   └── shared/                # 跨进程类型定义与 IPC 信道常量
└── tools/
    ├── npm/                  # 项目级 npm 11 封装器
    ├── test/                 # 按领域收敛的 32 个 canonical 回归套件
    │   ├── distribution/     # 环境与 npm 分发
    │   ├── core/             # Agent Core 与上下文运行时
    │   ├── runtime/          # 工具执行、TTS 与媒体控制
    │   ├── memory/           # 记忆生命周期
    │   ├── rag/              # 知识摄取、向量与混合检索
    │   ├── character/        # Persona、关系与具身策略
    │   ├── live2d/           # Live2D 模型资源与运行时契约
    │   └── presentation/    # 桌宠、Chat Shell 与界面集成
    ├── verify/               # 真实外部服务验证器
    └── diagnostics/          # Windows 诊断脚本
```

---

## 🚀 快速上手 (Quick Start)

### 1. 环境依赖
- **Node.js**: `>= 24.0.0` (推荐 Node.js 24 LTS)
- **npm**: `>= 11.0.0` (锁定 `npm@11.17.0`)
- **操作系统**: Windows 10 / 11

### 2. 安装与构建
```powershell
# 安装依赖
npm install

# 完整构建 (Main + Preload + Renderer)
npm run build

# 启动桌宠应用 (生产模式)
npm start

# 开发模式 (热重载)
npm run dev
```

### 3. 全局 CLI 启动
```powershell
# 运行烟雾测试
node src/cli/firefly.mjs --smoke-test

# 查看版本
node src/cli/firefly.mjs --version
```

---

## 🧪 测试与质量门禁 (Testing & Verification)

Firefly-Agent 配备严格的多层级回归测试体系（32 个按领域组织的 canonical 测试套件）：

```powershell
# 1. 全量 TypeScript 类型检查 (Main + Preload + Renderer)
npm run typecheck

# 2. 运行全部 32 个 canonical 自动化回归测试套件
npm test

# 3. 运行 npm 打包检查
npm pack --dry-run

# 4. 运行 Electron 启动与销毁烟雾测试
node src/cli/firefly.mjs --smoke-test
```

---

## 📄 开源协议 (License)

本项目代码部分基于 [MIT License](LICENSE) 开源。  
相关角色形象及衍生资源版权归原权利方所有。
