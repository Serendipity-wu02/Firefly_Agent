# Firefly-Pet V1 Frozen Baseline Specification

- **Status**: COMPLETE & FROZEN
- **Release Milestone**: V1.0.0
- **Baseline Date**: 2026-08-31

---

## 1. Baseline Deliverables & Frozen Status

| Component | Status | Implementation Details |
| :--- | :--- | :--- |
| **Agent Core** | **FROZEN** | `FireflyAgentCore` implementing `IAgentCore`. Fully decoupled loop, `AgentSession` transcript protection, `AgentEventBus` listener guards, tool dispatching. |
| **Live2D Presentation** | **FROZEN** | Live2D Cubism 3 (`Firefly.model3.json`) with complete fallback PNG animation tree (20 actions in normal mode + 8 actions in SAM mode). |
| **AI Voice Synthesis** | **FROZEN** | Local zero-shot GPT-SoVITS API (`http://127.0.0.1:9880/tts`). Fixed reference audio (`sample_1.wav`), SHA256 caching, dynamic playback, Live2D mouth sync. |
| **QQ Music Integration** | **FROZEN** | `QQMusicDesktopBridge` over Windows GSMTC (`QQMusic.exe`). Real-time media metadata, playback status, timeline query, and control. |
| **Memory System** | **FROZEN (V1)** | Rule-based regex extraction, K-V Map persistence in `config/memory.json`, prompt section injection. (Semantic/RAG memory reserved for V2.2). |
| **Audio Asset Audit** | **COMPLETE** | 367 fixed legacy WAVs permanently removed from runtime (`assets/firefly/audio/normal`). SAM specialized effects preserved. |

---

## 2. Regression Test Inventory (100% Passing)

1. **`tools/test_firefly_agent_core_freeze.mjs`**: 12/12 test cases verifying core decoupling, lifecycle, cancellation, timeout, and concurrency.
2. **`tools/test_firefly_agent_core_v1.mjs`**: 12/12 test cases verifying single-turn, multi-turn tool calling, transcript writeback, and error resilience.
3. **`tools/test_firefly_voice_v1.mjs`**: 7/7 mock contract tests verifying TTS payload schema, caching, session queue, and HTTP 500 handling.
4. **`tools/test_llm_tts_live2d_chain.mjs`**: 3/3 integration tests for Action Catalog, LLM-tool-action dispatch, and TTS fallback.
5. **`tools/test_music_system.mjs`**: 8/8 tests for search/recommend normalization, unconfigured fallback, session queue, and agent tool execution.
6. **`tools/test_qqmusic_desktop_bridge.mjs`**: 9/9 tests for GSMTC session discovery, timeline mapping, controls, and agent bridge flow.
7. **`tools/verify_live_voice.mjs`**: 12/12 real integration checks against live GPT-SoVITS inference (`http://127.0.0.1:9880`).
8. **Python Resource Validators**: 5/5 validation suites (`validate_ai_intent.py`, `validate_asset_structure.py`, `validate_character_resources.py`, `validate_firefly_assets.py`, `validate_persistence.py`).
9. **Electron Smoke Test**: Verification of window creation and clean exit.

---

## 3. Build & Packaging Status

- **TypeScript Compilation**: `npm run typecheck` $\rightarrow$ 0 errors.
- **Production Build**: `npm run build` $\rightarrow$ Main, Preload, and Renderer Vite bundle cleanly generated.
