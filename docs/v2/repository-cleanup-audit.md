# Repository Cleanup & Legacy Pruning Audit

## 1. 清扫概述

在 Firefly-Agent 顺利完成 V2.2 Memory v2 全阶段演进、V2.3 RAG 检索增强架构上线、Live2D-only 表现层重构以及 v2.3.0 正式基线发布之后，对全代码库进行了全面的历史遗留扫描、废弃原型清理与工程整洁度审计。

---

## 2. 清理与保留清单

### 2.1 DELETED (已确认废弃并删除的文件)
以下 9 个文件属于 V1 早期已被 TypeScript/Electron 与 Live2D 架构完全替代的 PySide6 桌面窗口原型及旧序列帧提取工具，当前工程 0 处引用：
1. `main.py` (早期 PySide6 入口)
2. `pet_window.py` (早期桌宠主窗口原型)
3. `run.bat` (早期 Python 桌宠启动脚本)
4. `settings.py` (早期 Python 配置读写原型)
5. `settings_panel.py` (早期 PySide6 设置面板)
6. `startup.py` (早期 Python 自启动逻辑)
7. `status_panel.py` (早期 PySide6 状态面板)
8. `voice.py` (早期 Python 固定音频播放原型)
9. `tools/extract_firefly_frames.py` (早期 PNG 序列帧图片提取脚本)

### 2.2 KEPT (正式保留的核心源码与必要验证模块)
- **正式 TypeScript 源码**：
  - `src/main/agent/` (AgentCore, Context, Compaction, Execution, Recovery, Planning)
  - `src/main/memory/` (Memory v2 全套 Store, Retrieval, Write Policy, Evolution, Coordinator)
  - `src/main/rag/` (Ingestion, Vector Store, Hybrid Retrieval, Reranker, RagSlot)
  - `src/main/tts/` (TtsSessionService, GPT-SoVITS Engine, Dispatcher)
  - `src/main/music/` (GSMTC Bridge, MusicService, QQMusic Provider)
  - `src/renderer/` (PixiJS Live2D Manager, SpeakingMotion, MouthSync, React UI)
  - `src/preload/` & `src/shared/`
- **正式资产与规范知识源**：
  - `assets/firefly/models/` (Live2D Cubism 3 模型配置、骨骼、纹理、物理、11 表情、6 动作)
  - `resources/` (806 个官方只读知识库源文件，`git diff` 严格为 0)
- **Python 资产与规则校验套件**（保留 5 项持续回归测试）：
  - `tools/validate_ai_intent.py`
  - `tools/validate_asset_structure.py`
  - `tools/validate_character_resources.py`
  - `tools/validate_firefly_assets.py`
  - `tools/validate_persistence.py`
  - 依赖的核心规则定义：`actions.py`, `ai_manager.py`, `character_resources.py`, `chat_history.py`, `dialogue.py`, `intent.py`, `memory.py`, `resources.py`, `state.py`。
- **正式文档与历史审计产物**：
  - `docs/architecture/`
  - `docs/v1/`
  - `docs/v2/`

### 2.3 GENERATED BUT IGNORED (由构建/索引生成并受 `.gitignore` 保护的目录)
- `data/` (`data/knowledge/` 由 Ingestion & IndexService 从 `resources/` 自动生成)
- `dist/`, `dist-electron/`, `build/`
- `node_modules/`
- `config/settings.json`, `config/memory.json`, `config/chat_history.json`
- `logs/`, `*.log`, `*.tmp`

### 2.4 UNKNOWN / NOT DELETED
- **0 处**。所有仓库文件均已明确归类与用途证明，无任何未经确认的文件。

---

## 3. 核心子系统完整性确认

| 子系统 | 状态 | 验证细节 |
| :--- | :--- | :--- |
| **Canonical Knowledge** | **100% INTACT** | `resources/` 806 文件 0 处改动 |
| **Live2D Models** | **100% INTACT** | `assets/firefly/models/` 结构与 100% 路径解析 |
| **Memory v2** | **100% INTACT** | V2.2 全模块与 5 阶段单元测试全通 |
| **RAG Pipeline** | **100% INTACT** | V2.3 5,665 切片向量索引与 RagSlot 全通 |
| **Agent Core** | **100% INTACT** | 0 直接 RAG / Memory 导入，上下文解耦 |
| **TTS / MouthSync** | **100% INTACT** | 真实 GPT-SoVITS 12/12 联调通过 |

---

## 4. 全量回归测试结果

```
- TypeScript Typecheck: PASS
- Full Build: PASS
- Full Unit & Integration Test Suite (npm test): 23 suites / 299 tests PASS (100%)
- Python Validation Suites (5/5): PASS
- Live2D Only & Resource Reload: 12/12 PASS
- GPT-SoVITS Live Voice & MouthSync: 12/12 PASS
- Electron Smoke Test: PASS
```

---

## 5. Git 状态与同步

- **工作区**：Clean (`working tree clean`)
- **提交信息**：`chore: clean legacy files and repository artifacts`
- **远程分支**：`origin/main` (Synchronized)
- **历史标签**：`v1.0.0`, `v2.1.0`, `v2.1.1`, `v2.1.2`, `v2.3.0` 全部完好保留。
