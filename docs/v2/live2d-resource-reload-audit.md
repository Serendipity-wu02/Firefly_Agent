# Live2D Resource Reload Audit

## 1. 审计概述

根据工作区角色资产的最新重构，对角色模型唯一正式来源：
`E:\Google-Antigravity\working\Firefly-Pet\assets\firefly\models`
进行了完整的递归重扫描与端到端运行时链路审计。

本次重构确立了清晰的二级子目录结构：
- 表情资源：`assets/firefly/models/Expressions/`
- 动作资源：`assets/firefly/models/Motions/`
- 主配置与骨骼/纹理/物理：`assets/firefly/models/` 根目录

---

## 2. 核心模型文件与路径一致性审计

主配置文件 `Firefly.model3.json`（Version 3）中所有 `FileReferences` 声明已 100% 正确映射至实际文件：

| 引用类型 | 声明路径 | 实际文件位置 | 解析状态 | 文件大小 |
| :--- | :--- | :--- | :--- | :--- |
| **Moc** | `Moc_0.moc3` | `models/Moc_0.moc3` | 100% RESOLVED | 363,712 B |
| **Textures** | `Textures_0_0.png` | `models/Textures_0_0.png` | 100% RESOLVED | 5,201,550 B |
| **Physics** | `Physics_0.json` | `models/Physics_0.json` | 100% RESOLVED | 31,749 B |
| **HitAreas** | `Body` (ArtMesh154), `Head` (ArtMesh23) | 运行时网格绑定 | 100% RESOLVED | - |

---

## 3. Motion 动作资源完整性审计

`models/Motions/` 目录下全部 6 项 Motion JSON 均已完成结构校验（包含 Curves 与 Meta），分组如下：

### 3.1 Idle 动作组（待机循环与微动作）
- `[Idle][0]`: `Motions/Motions_Tick2_0_File_0.json` (10,878 B) - 待机主循环
- `[Idle][1]`: `Motions/Motions_Tick2_1_File_0.json` (6,826 B) - 静止微动 / 看书 / 饮用
- `[Idle][2]`: `Motions/Motions_Tick2_2_File_0.json` (10,675 B) - 进食与细节动作

### 3.2 Tap 动作组（交互触发）
- `[Tap][0]`: `Motions/Motions_表情组_0_File_0.json` (4,649 B) - 被拖拽 / 呼唤动作
- `[Tap][1]`: `Motions/Motions_表情组_1_File_0.json` (55,831 B) - 招手打招呼
- `[Tap][2]`: `Motions/Motions_表情组_2_File_0.json` (3,467 B) - 互动伸展

---

## 4. Expression 表情资源完整性审计

`models/Expressions/` 目录下全部 11 项表情 JSON 均通过校验，结构类型为 `Live2D Expression`：

| 表情名称 | 对应文件路径 | 关键调制参数 (Parameter IDs) | 解析状态 |
| :--- | :--- | :--- | :--- |
| `expression00` | `Expressions/Expressions_0_File_0.json` | ParamEyeLOpen, ParamEyeROpen, ParamMouthForm | 100% RESOLVED |
| `expression1` | `Expressions/Expressions_1_File_0.json` | ParamBrowLY, ParamBrowRY, ParamCheek | 100% RESOLVED |
| `expression2` | `Expressions/Expressions_2_File_0.json` | ParamEyeBallX, ParamEyeBallY | 100% RESOLVED |
| `expression3` | `Expressions/Expressions_3_File_0.json` | ParamEyeLOpen, ParamEyeROpen, ParamBrowLY | 100% RESOLVED |
| `expression4` | `Expressions/Expressions_4_File_0.json` | ParamEyeLSmile, ParamEyeRSmile, ParamCheek | 100% RESOLVED |
| `expression5` | `Expressions/Expressions_5_File_0.json` | ParamBrowLAngle, ParamBrowRAngle, ParamMouthForm | 100% RESOLVED |
| `expression6` | `Expressions/Expressions_6_File_0.json` | ParamEyeLOpen, ParamEyeROpen (困倦微合) | 100% RESOLVED |
| `expression7` | `Expressions/Expressions_7_File_0.json` | ParamBrowLY, ParamBrowRY (低落) | 100% RESOLVED |
| `expression8` | `Expressions/Expressions_8_File_0.json` | ParamMouthForm, ParamEyeBallY | 100% RESOLVED |
| `expression9` | `Expressions/Expressions_9_File_0.json` | ParamMouthForm, ParamMouthOpenY (日常对话) | 100% RESOLVED |
| `expression10` | `Expressions/Expressions_10_File_0.json` | ParamCheek (脸红害羞) | 100% RESOLVED |

---

## 5. 动作系统 (Action Resolution) 映射表

全部 10 项 LLM / UI 允许动作（`AI_ALLOWED_ACTIONS`）及扩展动作均 100% 成功解析至真实 Live2D 目标：

| Action ID | 中文别名 | 目标类型 | 目标分组 / 名称 | 映射文件 | 实测状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `idle` | 待机 | motion | Idle:0 | `Motions/Motions_Tick2_0_File_0.json` | 100% RESOLVED |
| `happy` | 开心 | expression | expression4 | `Expressions/Expressions_4_File_0.json` | 100% RESOLVED |
| `thinking` | 思考 | expression | expression5 | `Expressions/Expressions_5_File_0.json` | 100% RESOLVED |
| `sleepy` | 困了 | expression | expression6 | `Expressions/Expressions_6_File_0.json` | 100% RESOLVED |
| `surprised` | 惊讶 | expression | expression3 | `Expressions/Expressions_3_File_0.json` | 100% RESOLVED |
| `dragged` | 被拖拽 | motion | Tap:0 | `Motions/Motions_表情组_0_File_0.json` | 100% RESOLVED |
| `touched` | 感动 | expression | expression4 | `Expressions/Expressions_4_File_0.json` | 100% RESOLVED |
| `shy` | 害羞 | expression | expression10 | `Expressions/Expressions_10_File_0.json` | 100% RESOLVED |
| `waving` | 打招呼 | motion | Tap:1 | `Motions/Motions_表情组_1_File_0.json` | 100% RESOLVED |
| `reading` | 看书 | motion | Idle:1 | `Motions/Motions_Tick2_1_File_0.json` | 100% RESOLVED |
| `talking` | 说话 | expression | expression9 | `Expressions/Expressions_9_File_0.json` | 100% RESOLVED |

---

## 6. Speaking & MouthSync 语音口型链路审计

1. **Speaking 状态流转**：
   - 触发 `PET_SPEAKING_CHANGED(true)` $\rightarrow$ `SpeakingMotionController` 执行 `manager.playActionId("talking")`（切换为 `expression9`）并启动 `MouthSyncController`。
   - 播放完毕触发 `PET_SPEAKING_CHANGED(false)` $\rightarrow$ 停止 `MouthSyncController`，口型归零，动作自动恢复 `idle`（`Idle:0`）。
2. **MouthSync 实时参数调制**：
   - 每 80ms 在 `[0.15, 0.85]` 区间随机平滑调制 Live2D 核心参数 `ParamMouthOpenY`。
   - 真实 GPT-SoVITS 12/12 项端到端测试 100% 通过。

---

## 7. PNG Fallback 彻底清除审计

- **源码引用审计**：`src/renderer/live2d/` 零引用 `png_sequence`、`fallback-png`、`fallback-frame`。
- **磁盘目录审计**：`assets/firefly/normal/` 彻底移除（不存在）。
- **降级语义**：若模型缺失或加载失败，系统直接标记 `Live2D Unavailable` / 抛出异常，绝不回退至 PNG 序列帧。

---

## 8. 测试与回归结论

| 测试套件 | 覆盖项 | 结果 |
| :--- | :--- | :--- |
| `tools/test_live2d_resource_reload.mjs` | Model3, Moc, Textures, Physics, Motions, Expressions, Idle, Tap, Actions, Speaking, MouthSync, Zero PNG | **12/12 PASS** |
| `tools/test_live2d_only.mjs` | Live2D 纯粹性契约验证 | **12/12 PASS** |
| `npm test` | 全工程 23 个测试套件（299 项测试） | **299/299 PASS** |
| 5 项 Python 资产与完整性校验 | intent, structure, resources, firefly assets, persistence | **5/5 PASS** |
| `tools/verify_live_voice.mjs` | GPT-SoVITS 真实语音 + 状态机口型联动 | **12/12 PASS** |
| Electron Smoke Test | 窗口初始化与运行时健康度 | **PASS** |
