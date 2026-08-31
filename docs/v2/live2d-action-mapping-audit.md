# Firefly-Agent Live2D Action Mapping 深度审计报告

- **日期**: 2026-08-31
- **状态**: AUDIT COMPLETE (PASS)
- **结论**: **ACTION MAPPING: PASS / PNG RUNTIME: 0 / READY FOR V2.2: YES**

---

## 1. 完整真实 Live2D 能力表 (Actual Capabilities from Disk)

依据本机 `assets/firefly/models/Firefly.model3.json` 及其引用的物理文件深度解析：

### 1.1 完整 Motion 动作清单
| 动作分组 (Group) | 索引 (Index) | 文件名 (File) | 持续时间 (Duration) | 真实能力与曲线表现 |
| :--- | :--- | :--- | :--- | :--- |
| `Idle` | `0` | `Motions_Tick2_0_File_0.json` | 10.333s | 站立待机基础微动，涵盖呼吸起伏与极轻微身体摆动 (`Loop: true`) |
| `Idle` | `1` | `Motions_Tick2_1_File_0.json` | 70.333s | 超长平缓待机微动，涵盖头部倾角、视线环顾与沉浸式思索/看书形态 |
| `Idle` | `2` | `Motions_Tick2_2_File_0.json` | 9.833s | 待机眨眼、头部微倾与发丝重力摆动 |
| `Tap` | `0` | `Motions_表情组_0_File_0.json` | 1.633s | 短促交互反应，身体与头部受力位移与恢复微动 |
| `Tap` | `1` | `Motions_表情组_1_File_0.json` | 201.967s | 丰富交互主动作，包含抬手挥手问好与多段肢体动作（绑定音效 `Motions_表情组_1_Sound_0.mp3`） |
| `Tap` | `2` | `Motions_表情组_2_File_0.json` | 2.467s | 快速肢体交互、抬手享用食物/甜点后愉快反馈（绑定音效 `Motions_表情组_2_Sound_0.mp3`） |

### 1.2 完整 Expression 表情清单
| 表情标识 (Name) | 文件名 (File) | 参数修改项 (Parameter Ids & Values) | 真实视觉表现 |
| :--- | :--- | :--- | :--- |
| `expression00` | `Expressions_0_File_0.json` | `Param: 0`, `Param40: 0`, `Param2..5: 0`, `Param8..11: 0` | 默认重置表情（全参数清零归位） |
| `expression1` | `Expressions_1_File_0.json` | `Param: 1` | 默认形态微调 1 |
| `expression2` | `Expressions_2_File_0.json` | `Param40: 1` | 默认形态微调 2 |
| `expression3` | `Expressions_3_File_0.json` | `AngleX: 30`, `AngleY: -30`, `AngleZ: 30`, `ParamEyeLOpen: -1`, `ParamEyeROpen: -1`, `ParamBrowRAngle: 1`, `ParamBrowLAngle: 1`, `ParamMouthOpenY: 0.443`, `ParamBodyAngleZ: -10` | **惊讶/意外**：睁大双眼、微张口型、身体与头部后仰受惊 |
| `expression4` | `Expressions_4_File_0.json` | `ParamEyeRSmile: 0.75`, `ParamEyeLSmile: 0.75`, `ParamBrowLAngle: 1`, `ParamBrowRAngle: 1`, `ParamMouthForm: 0.4`, `ParamMouthOpenY: 0.65` | **开心/微笑/感动**：眼角温柔微笑弯起、嘴角上扬 |
| `expression5` | `Expressions_5_File_0.json` | `AngleX: 17`, `ParamBrowLY: -1`, `ParamBrowRY: -1`, `ParamBrowLAngle: -0.25`, `ParamBrowRAngle: -0.25`, `ParamMouthForm: -0.523` | **思考/沉思**：轻微低头、双眉微聚蹙起、嘴角收紧认真思索 |
| `expression6` | `Expressions_6_File_0.json` | `Param5: 1`, `Param52: 30` | **困倦/闭目休息**：双眼闭合、安详放松休眠 |
| `expression7` | `Expressions_7_File_0.json` | `ParamMouthForm: -1`, `ParamBrowLY: -1`, `ParamBrowRY: -1`, `ParamBrowLAngle: 1`, `ParamBrowRAngle: 1`, `ParamEyeROpen: -1`, `ParamEyeLOpen: -1` | **难过/虚弱/饥饿/疲惫/不适**：八字眉下垂、嘴角向下失落 |
| `expression8` | `Expressions_8_File_0.json` | `ParamMouthForm: 1`, `ParamMouthOpenY: 1`, `ParamEyeRSmile: 1`, `ParamEyeLSmile: 1`, `ParamBrowLY: -1`, `ParamBrowRY: -1` | **灿烂大笑/极度喜悦**：双眼弯成月牙、大开笑颜 |
| `expression9` | `Expressions_9_File_0.json` | `ParamMouthForm: -1`, `ParamMouthOpenY: 1`, `ParamBrowLY: 0`, `ParamBrowRY: 0` | **说话/交流**：标准口型基底，便于配合 MouthSync 动态开合 |
| `expression10` | `Expressions_10_File_0.json` | `AngleY: 15`, `AngleZ: -15`, `ParamBodyAngleZ: -10`, `Param55: 30`, `Param11: 1` | **害羞/侧头**：头部微微侧偏、眼神躲闪红晕 |

---

## 2. 19 个 Action 映射逐项审计 (Item-by-Item Audit)

| 序号 | 动作 ID | 映射目标 (Target) | 物理来源文件 | 实际表现与参数依据 | 审计结论 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `idle` | `motion: Idle:0` | `Motions_Tick2_0_File_0.json` | 默认站立待机微动，平稳呼吸起伏 | **PASS** |
| 2 | `happy` | `expression: expression4` | `Expressions_4_File_0.json` | `ParamEyeRSmile: 0.75`, `ParamMouthForm: 0.4` 微笑开心 | **PASS** |
| 3 | `thinking` | `expression: expression5` | `Expressions_5_File_0.json` | `ParamBrowLY: -1`, `ParamMouthForm: -0.523` 认真蹙眉思索 | **PASS** |
| 4 | `sleepy` | `expression: expression6` | `Expressions_6_File_0.json` | `Param5: 1`, `Param52: 30` 闭眼困倦休眠 | **PASS** |
| 5 | `surprised` | `expression: expression3` | `Expressions_3_File_0.json` | `ParamEyeLOpen: -1`, `ParamMouthOpenY: 0.443`, `AngleX: 30` 意外后仰张口 | **PASS** |
| 6 | `dragged` | `motion: Tap:0` | `Motions_表情组_0_File_0.json` | 桌面拖动时短促位移与恢复微动 | **PASS** |
| 7 | `touched` | `expression: expression4` | `Expressions_4_File_0.json` | 被摸头温柔感动微笑表情 | **PASS** |
| 8 | `shy` | `expression: expression10` | `Expressions_10_File_0.json` | `AngleY: 15`, `ParamBodyAngleZ: -10` 害羞侧头 | **PASS** |
| 9 | `waving` | `motion: Tap:1` | `Motions_表情组_1_File_0.json` | 热情抬手挥手互动问好动作 | **PASS** |
| 10 | `reading` | `motion: Idle:1` | `Motions_Tick2_1_File_0.json` | 70s 超长沉浸式低头看书静止微动 | **PASS** |
| 11 | `talking` | `expression: expression9` | `Expressions_9_File_0.json` | `ParamMouthOpenY: 1` 说话口型基底 | **PASS** |
| 12 | `eating` | `motion: Tap:2` | `Motions_表情组_2_File_0.json` | 抬手享用甜点/蛋糕卷愉快互动动作 | **PASS** |
| 13 | `resting` | `expression: expression6` | `Expressions_6_File_0.json` | 闭目养神休息状态 | **PASS** |
| 14 | `treatment` | `motion: Tap:0` | `Motions_表情组_0_File_0.json` | 调理修复状态动作 | **PASS** |
| 15 | `hungry` | `expression: expression7` | `Expressions_7_File_0.json` | `ParamMouthForm: -1`, `ParamBrowLY: -1` 饥饿失落低落表情 | **PASS** |
| 16 | `tired` | `expression: expression7` | `Expressions_7_File_0.json` | 精力不足虚弱失落表情 | **PASS** |
| 17 | `sick` | `expression: expression7` | `Expressions_7_File_0.json` | 失熵症发作虚弱不适表情 | **PASS** |
| 18 | `attention` | `motion: Tap:0` | `Motions_表情组_0_File_0.json` | 呼唤开拓者注意交互微动 | **PASS** |
| 19 | `ignored` | `expression: expression7` | `Expressions_7_File_0.json` | 长时间未互动抱怨失落表情 | **PASS** |

---

## 3. 共用 Target 合理性深度分析 (Shared Target Analysis)

1. **`happy` 与 `touched` (共用 `expression4`)**:
   - **语义评估**: **合理 (PASS)**。`expression4` 是流萤最标志性的温柔微笑（眼睛弯起 `ParamEyeRSmile: 0.75`，嘴角微扬 `ParamMouthForm: 0.4`）。在流萤的人设中，“开心”与“被摸头感动”在视觉上均呈现为这种内敛温暖的微笑。
2. **`sleepy` 与 `resting` (共用 `expression6`)**:
   - **语义评估**: **合理 (PASS)**。`expression6` 激活 `Param5: 1` 闭目模式。流萤无论是“困倦”还是“闭目休息”，其视觉表现均为安静闭合双眼的休眠态。
3. **`hungry`、`tired`、`sick`、`ignored` (共用 `expression7`)**:
   - **语义评估**: **合理 (PASS)**。`expression7` 调整嘴角向下弯曲 (`ParamMouthForm: -1`) 与双眉微蹙 (`ParamBrowLY: -1`)。在流萤的桌宠状态机中，这四种状态均属于“负面低能量”状态（饥饿、疲惫、不适、被冷落），均自然对应流萤轻微委屈/失落的表情。
4. **`dragged`、`treatment`、`attention` (共用 `motion: Tap:0`)**:
   - **语义评估**: **合理 (PASS)**。`Tap:0` 是 1.633 秒短促反应动作。在拖拽松开、医疗修复、被呼唤时均作为通用交互微动响应。

---

## 4. 20 个旧 PNG 目录与 19 个 Action 数量差异审计

- **差异查明**:
  - 旧 Python 原型资产目录 `assets/firefly/normal/` 下存在 **20 个子目录**；
  - 其中多出的第 20 个目录为 **`assets/firefly/normal/angry/`**；
  - `angry` 包含 4 张历史 PNG 帧图片（`angry_001.png` ~ `angry_004.png`）；
  - **使用情况**: 现代 TypeScript / Electron 运行时（`src/`）从未使用过 `angry` 动作（`FIREFLY_ACTIONS` 自设计之初即为 19 项）；
  - **清理状态**: `assets/firefly/normal/angry/` 已随整个 `normal/` 目录被 **100% 物理删除**。

---

## 5. Talking 动作与 MouthSync 链路审计

- **基础 Expression**: `talking` 映射到 `expression: expression9`（`ParamMouthForm: -1`，`ParamMouthOpenY: 1`）；
- **动态口型开合链路**:
  1. TTS 语音开始播放 $\rightarrow$ `PET_SPEAKING_CHANGED(true)`；
  2. `SpeakingMotionController` 调用 `manager.playActionId("talking")` 切换基础口型；
  3. `MouthSyncController` 启动 80ms 定时器，通过 `Live2DModel.internalModel.coreModel.setParameterValueById("ParamMouthOpenY", value)` 在 `0.15 ~ 0.85` 之间动态摆动；
  4. 语音播放结束 $\rightarrow$ `MouthSyncController.stop()` 将 `ParamMouthOpenY` 置 0，并恢复 `idle`；
  5. **冲突检查**: 基础 expression 与 coreModel 底层参数直接调制完全隔离，**无任何参数冲突**。

---

## 6. PNG 遗留引用审计 (Zero PNG References)

经全工程静态代码扫描确认：
- `PngFallbackController`: **0 处运行时引用**
- `png_sequence`: **0 处运行时引用**
- `fallback-png`: **0 处运行时引用**
- `assets/firefly/normal`: **0 处运行时引用**
- `png-frame-container` / `fallback-frame`: **0 处运行时引用**

---

## 7. 全量测试回归结果 (100% Full Pass)

| 序号 | 验证套件 | 验证内容 | 结果 |
| :--- | :--- | :--- | :--- |
| 1 | TypeScript 静态类型检查 | `npm run typecheck` | **PASS (0 Errors)** |
| 2 | 生产环境完整编译打包 | `npm run build` | **PASS (Clean Build)** |
| 3 | 全量 14 个 Node.js 测试套件 | `npm test` (144 项测试) | **PASS (144/144)** |
| 4 | Live2D Only 专项测试 | `node tools/test_live2d_only.mjs` | **PASS (12/12)** |
| 5 | Python 5 套自动化校验 | Intent, Assets, Character, Live2D Assets, Persistence | **PASS (5/5)** |
| 6 | GPT-SoVITS 实机联调 | `node tools/verify_live_voice.mjs` | **PASS (12/12)** |
| 7 | Electron 启动烟雾测试 | `$env:ELECTRON_SMOKE_TEST="1"; npx electron .` | **PASS (Exit Code 0)** |
