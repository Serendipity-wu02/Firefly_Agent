# Firefly Batch 2 桌宠交互实施与验收记录（2026-09-24）

## 范围与源码

- 沿用 Cyrene 唯一运行核心、现有 `play_live2d_action` 工具注册和权限链；不新增 Agent Loop，不进入音乐、Work 文件能力、知识语料、Jev/DecisionProvider 或 Batch 3。
- `src/renderer/public/models/firefly/Firefly.model3.json` 实有 `Idle` 0–2、`Tap` 0–2、`expression00` 与 `expression1`–`expression10`，以及 `Head`、`Body` 命中区。`src/renderer/main.ts` 加载此模型，`src/renderer/live2d/model-manifest.ts` 从 `FileReferences` 索引动作与表情。
- `src/shared/live2d-actions.ts` 用上述真实资源提供「待机、开心、思考、困了、惊讶、被拖拽、感动、害羞、打招呼、看书、说话、不适」12 个别名。不把缺少的资源映射成其他动作。
- `src/renderer/live2d/interaction.ts` 和 `src/renderer/main.ts` 区分点击与拖动；`src/renderer/live2d/action-controller.ts` 串行处理动作，并在有模型加载、开始、完成或失败事实时分别回执；动作结束恢复 `Idle/0`，复位失败回报 `reset_failed`，不报完成。
- `src/renderer/live2d/expression-state.ts` 让临时表情结束后恢复最新心情，避免重复、过期心情覆盖手动动作。`src/renderer/live2d/mood-expression.ts` 只对有资源依据的心情映射表情，其余保留中性状态。
- Main 通过现有工具注册、IPC 与桌宠窗口回执串接 `play_live2d_action`；Chat 仍受 `chatToolsEnabled` 总开关和 `toolModeOverrides.play_live2d_action.chat` 单项开关约束。请求已发送不等于动作已开始。

## 实机结果

- 当前实例显示的桌宠与 `Firefly.model3.json` 的纹理一致；新代码仅刷新 Renderer，没有重建或重启。
- 头部点击后桌宠画面出现动作变化；拖动窗口实际移动。连续点击没有取得独立实机证据。
- 当前「Chat 模式工具增强」总开关与 Chat 页「做动作」单项开关均由用户开启；本轮没有代用户修改其他工具权限，也未核对其他单项的开关值。
- 在当前实例新建 Chat，只请求一次「打招呼」；实际映射为 `Tap/1`，结束后回到 `Idle/0`。Chat 过程卡显示「完成 1 项操作」，明细仅有一次「做动作」；工具结果是 `ok: true, stage: started`，回复明确没有把这个结果说成播放结束。
- Main 对同一请求 `7d8c9dc9-e921-4bc9-8810-fe7c024c1d47` 依次记录 `requested → model_loaded → started → completed`；运行登记记录 `run-1790259127000-h1wbv8` 终态 `completed`，Harness 记录 `terminal=success`。`completed` 由 Renderer 在 `Idle/0` 播放开始且表情恢复成功后发出，不存在独立的复位阶段回执；复位失败则发 `failed/reset_failed`。桌宠实机画面回到正常待机状态。
- Chat 显示本轮处理完成，输入区回到普通占位和发送按钮，可编辑；验收用未发送草稿已清除。没有追加模型请求，也未重建或重启当前实例。
- 本轮没有新的真实心情事件；心情联动实机未确认。

## 自动验证与边界

- 已有 Batch 2 受影响测试：14 个文件、76 项通过；后续定向回归 11 个文件、64 项通过。最新复位失败修复的定向测试 `src/renderer/live2d/action-controller.test.ts`：4 项通过。
- Main、preload、Renderer 必要类型检查通过；已完成一次完整构建。最新仅 Renderer 复位回执修复后，`npm run check:renderer` 与 `npm run build:renderer` 通过。未重复无关全量测试。
- 自动测试覆盖资源映射、点击与拖动区分、重复请求、模型重载/缺失、动作失败和表情恢复。它们不替代真实 Chat 回执或真实心情事件。
- 发布前仍需确认 appId/包名与 Live2D、头像等素材再分发授权；旧角色构建资源须核实引用后再清理。未提交、推送或发布。
