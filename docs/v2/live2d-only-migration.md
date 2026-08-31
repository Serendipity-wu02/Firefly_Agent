# Firefly-Agent「Live2D-only Character Architecture」迁移完成报告

- **日期**: 2026-08-31
- **状态**: MIGRATION COMPLETE & VERIFIED
- **结论**: **LIVE2D-ONLY MIGRATION COMPLETE**

---

## A. 本机完整 Live2D 资源核验结果 (Local Live2D Asset Audit)

- **正式模型根目录**: `assets/firefly/models/`（全部文件 100% 完整保留，0 文件被删除/移动/修改）
- **核心模型配置文件**: `Firefly.model3.json` (Version: 3)
- **Live2D 模型二进制**: `Moc_0.moc3` (355 KB)
- **贴图纹理图集**: `Textures_0_0.png` (5.08 MB)
- **物理运算配置文件**: `Physics_0.json` (31 KB)
- **碰撞点击区域 (HitAreas)**:
  - `Body`: `ArtMesh154`
  - `Head`: `ArtMesh23`

---

## B. 实际 Motion 清单 (Actual Motions)

| 分组 (Group) | 索引 (Index) | 文件名 (File) | 语义与表现 |
| :--- | :--- | :--- | :--- |
| `Idle` | `0` | `Motions_Tick2_0_File_0.json` | 默认站立待机微动 (呼吸/轻微起伏) |
| `Idle` | `1` | `Motions_Tick2_1_File_0.json` | 待机环顾与身体轻微侧动 (看书/静止思索) |
| `Idle` | `2` | `Motions_Tick2_2_File_0.json` | 待机眨眼与头部微倾 |
| `Tap` | `0` | `Motions_表情组_0_File_0.json` | 交互反应 / 动作恢复 / 治疗调理 |
| `Tap` | `1` | `Motions_表情组_1_File_0.json` | 热情互动挥手问好 (`Motions_表情组_1_Sound_0.mp3`) |
| `Tap` | `2` | `Motions_表情组_2_File_0.json` | 进食/享用甜点开心动作 (`Motions_表情组_2_Sound_0.mp3`) |

---

## C. 实际 Expression 清单 (Actual Expressions)

| 表情标识 (Name) | 文件名 (File) | 参数与表情形态 |
| :--- | :--- | :--- |
| `expression00` | `Expressions_0_File_0.json` | 默认重置表情 (所有 Param 归零) |
| `expression1` | `Expressions_1_File_0.json` | 默认形态微调 (Param: 1) |
| `expression2` | `Expressions_2_File_0.json` | 默认形态微调 (Param40: 1) |
| `expression3` | `Expressions_3_File_0.json` | 惊讶 / 意外 / 微微张口 (`ParamEyeLOpen: -1`, `ParamMouthOpenY: 0.443`, `AngleX: 30`, `AngleY: -30`) |
| `expression4` | `Expressions_4_File_0.json` | 开心 / 微笑 / 感动 (`ParamEyeRSmile: 0.75`, `ParamEyeLSmile: 0.75`, `ParamMouthForm: 0.4`) |
| `expression5` | `Expressions_5_File_0.json` | 思考 / 认真思索 (`ParamBrowLY: -1`, `ParamBrowRY: -1`, `ParamMouthForm: -0.523`, `AngleX: 17`) |
| `expression6` | `Expressions_6_File_0.json` | 困倦 / 闭目休息 (`Param5: 1`, `Param52: 30`) |
| `expression7` | `Expressions_7_File_0.json` | 难过 / 虚弱 / 饥饿 / 疲惫 / 不适 (`ParamMouthForm: -1`, `ParamBrowRAngle: 1`, `ParamEyeROpen: -1`) |
| `expression8` | `Expressions_8_File_0.json` | 灿烂笑容 / 喜悦 (`ParamEyeRSmile: 1`, `ParamEyeLSmile: 1`, `ParamMouthForm: 1`, `ParamMouthOpenY: 1`) |
| `expression9` | `Expressions_9_File_0.json` | 说话 / 交流口型基底 (`ParamMouthForm: -1`, `ParamMouthOpenY: 1`) |
| `expression10` | `Expressions_10_File_0.json` | 害羞 / 不好意思侧头 (`ParamAngleY: 15`, `ParamAngleZ: -15`, `ParamBodyAngleZ: -10`, `Param55: 30`) |

---

## D. 19 个历史 Action 映射结果 (Action-to-Live2D Mapping)

| 动作 ID | 中文别名 | 映射类型 | 目标配置 (Target) | 映射说明 |
| :--- | :--- | :--- | :--- | :--- |
| `idle` | 待机 | Motion | `{ kind: "motion", group: "Idle", motionName: "0" }` | 默认站立待机 |
| `happy` | 开心 | Expression | `{ kind: "expression", name: "expression4" }` | 温柔微笑与开心眼神 |
| `thinking` | 思考 | Expression | `{ kind: "expression", name: "expression5" }` | 蹙眉托腮思考表情 |
| `sleepy` | 困了 | Expression | `{ kind: "expression", name: "expression6" }` | 闭目眯眼困倦 |
| `surprised` | 惊讶 | Expression | `{ kind: "expression", name: "expression3" }` | 睁大双眼意外张口 |
| `dragged` | 被拖拽 | Motion | `{ kind: "motion", group: "Tap", motionName: "0" }` | 桌面拖拽受力位移 |
| `touched` | 感动 | Expression | `{ kind: "expression", name: "expression4" }` | 被摸头温柔感动微笑 |
| `shy` | 害羞 | Expression | `{ kind: "expression", name: "expression10" }` | 不好意思侧头红晕 |
| `waving` | 打招呼 | Motion | `{ kind: "motion", group: "Tap", motionName: "1" }` | 挥手互动问好动作 |
| `reading` | 看书 | Motion | `{ kind: "motion", group: "Idle", motionName: "1" }` | 安静低头思索微动 |
| `talking` | 说话 | Expression | `{ kind: "expression", name: "expression9" }` | 口型开合联动 `MouthSyncController` |
| `eating` | 进食 | Motion | `{ kind: "motion", group: "Tap", motionName: "2" }` | 享用蛋糕卷互动动作 |
| `resting` | 休息 | Expression | `{ kind: "expression", name: "expression6" }` | 闭目养神休息状态 |
| `treatment` | 治疗 | Motion | `{ kind: "motion", group: "Tap", motionName: "0" }` | 调理修复状态 |
| `hungry` | 饥饿 | Expression | `{ kind: "expression", name: "expression7" }` | 饥饿失落表情 |
| `tired` | 疲惫 | Expression | `{ kind: "expression", name: "expression7" }` | 精力不足虚弱表情 |
| `sick` | 不适 | Expression | `{ kind: "expression", name: "expression7" }` | 失熵症发作不适表情 |
| `attention` | 呼唤 | Motion | `{ kind: "motion", group: "Tap", motionName: "0" }` | 呼唤开拓者注意动作 |
| `ignored` | 被冷落 | Expression | `{ kind: "expression", name: "expression7" }` | 长时间未互动抱怨表情 |

---

## E & F. 未映射动作与最终保留动作 (Unmapped & Retained Actions)

- **Unmapped Actions**: `0`（19 个动作全部 100% 映射到真实 Live2D 动作或表情）
- **AI 可直接调用动作白名单 (`AI_ALLOWED_ACTIONS`)**:
  - `idle`, `happy`, `thinking`, `sleepy`, `surprised`, `touched`, `shy`, `waving`, `reading`, `talking`（共 10 项）

---

## G & H. PNG 资源与运行时删除清单 (Deleted PNG Assets & Code)

1. **已物理删除的 PNG 序列帧资产目录**:
   - `assets/firefly/normal/`（包含 20 个子目录及其全部 80 张历史 PNG 帧图片）
2. **已彻底删除的 PNG 运行时源码**:
   - `src/renderer/live2d/fallback-png.ts` (409 行代码物理删除)
3. **已清理的 DOM 与样式**:
   - `src/renderer/index.html` 中移除 `#png-frame-container`、`#fallback-frame` 及对应 CSS
4. **已清理的 Manager 运行时**:
   - `src/renderer/live2d/manager.ts` 中移除 `PngFallbackController` 实例化、`pngContainer`、`pngImage` 参数与全部 PNG 回退分支；模型加载失败仅设置不可用状态，不再激活 PNG。
5. **已清理的 Renderer 主流程**:
   - `src/renderer/main.ts` 中彻底移除 PNG 元素获取与配置传递。

---

## I. Action Contract 修改 (Contract Updates)

- **`FireflyTarget` 类型变更**:
  ```typescript
  // 彻底废除 png_sequence 联合类型分支
  export type FireflyTarget =
    | { kind: "motion"; group: string; motionName: string }
    | { kind: "expression"; name: string };
  ```
- **未知动作默认解析**:
  `resolveFireflyTarget("unknown")` 默认返回 `{ kind: "motion", group: "Idle", motionName: "0" }`。

---

## J & K. Validation 与 Tests 修改

1. **`tools/validate_asset_structure.py`**:
   - 校验目录数量由 34 个精简为 15 个（移除 `normal/*`，保留 `models`, `effects`, `audio`, `ui`）。
2. **`tools/validate_firefly_assets.py`**:
   - 改造为对 Live2D 模型文件的完整性断言（校验 `Firefly.model3.json`、1 张 Texture、6 个 Motion JSON、11 个 Expression JSON、1 个 Physics JSON、1 个 Moc3 二进制全部在盘存在）。
3. **`tools/test_live2d_only.mjs` (全新专项测试套件 - 12/12 PASS)**:
   - 1. Live2D Model Path
   - 2. Model3.json Integrity
   - 3. Motion References
   - 4. Expression References
   - 5. FireflyTarget Contract (0 `png_sequence`)
   - 6. FireflyAction Catalog
   - 7. AI_ALLOWED_ACTIONS Contract
   - 8. Renderer Source Audit (0 `fallback-png`, 0 `#png-frame-container`)
   - 9. Normal Asset Audit (`normal/` 100% removed)
   - 10. Live2DManager Pure Contract
   - 11. Missing Model Semantics
   - 12. Speaking Motion & MouthSync Chain
4. **`tools/test_firefly_agent_core_v1.mjs` & `tools/test_llm_tts_live2d_chain.mjs`**:
   - 更新 target 捕获断言为 `{ kind: "expression", name: "expression4" }` 等。

---

## L & M. 文档与 Python 修改

- **`README.md` & `assets/firefly/models/README.md`**:
  - 明确“Character Renderer: Live2D only”，删除所有关于 PNG 动画回退的陈述。

---

## N. 最终 Live2D-only 架构全景

```text
                 Firefly Agent Core
                         │
                         ↓
                play_live2d_action
                         │
                         ↓
               Firefly Action Resolver
                         │
                  ┌──────┴──────┐
                  ↓             ↓
               Motion       Expression
                  │             │
                  └──────┬──────┘
                         ↓
                   Live2D Model (Cubism 3)

TTS 链路:
GPT-SoVITS -> TtsSessionService -> SpeakingMotionController -> MouthSyncController -> Live2D (ParamMouthOpenY)
```

---

## O. 全量验证测试结果 (100% Full Pass)

| 序号 | 验证套件 | 验证内容 | 结果 |
| :--- | :--- | :--- | :--- |
| 1 | TypeScript 静态类型检查 | `npm run typecheck` | **PASS (0 Errors)** |
| 2 | 生产环境完整编译打包 | `npm run build` | **PASS (Clean Build)** |
| 3 | 全量 14 个 Node.js 测试套件 | `npm test` (144 项单元/集成测试) | **PASS (144/144)** |
| 4 | Python 5 套自动化校验 | Intent, Assets (15 dirs), Character, Live2D Assets, Persistence | **PASS (5/5)** |
| 5 | Live2D Only 专项测试 | `node tools/test_live2d_only.mjs` | **PASS (12/12)** |
| 6 | GPT-SoVITS 实机联调 | `node tools/verify_live_voice.mjs` | **PASS (12/12)** |
| 7 | Electron 启动烟雾测试 | `$env:ELECTRON_SMOKE_TEST="1"; npx electron .` | **PASS (Exit Code 0)** |
