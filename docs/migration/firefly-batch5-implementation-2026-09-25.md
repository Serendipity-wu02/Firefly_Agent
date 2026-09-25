# Firefly Batch 5 实施记录（2026-09-25）

## 知识来源与取舍

- 旧 Firefly 生效知识来源为 `src/main/character/resources/knowledge/facts.yaml`、`knowledge/curated_cards/*.md` 和 `character/experience/firefly_lore.md`，经旧项目知识摄入与关系加载链使用。旧文件中的第一人称叙述有将原作「开拓者」直接等同当前用户的句子，本批未原样复制。
- Cyrene 已有 `src/main/rag/worldbook.ts` 的 Markdown 条目、DMAE 触发与阈值、One-Shot 连带触发及最多 8 条活跃注入；`src/main/orchestrator/index.ts` 负责最终上下文装配。既有 `prompts/worldbook/Firefly.md`、`characters.md`、`story.md`、`world.md`、`_glossary.md` 已覆盖流萤身份、格拉默、萨姆、失熵症与星核猎手概要，未重复搬运原文。
- 以旧 `facts.yaml` 的人物关系为依据，新增 `prompts/worldbook/firefly-relations.md` 中卡芙卡、银狼、刃、艾利欧、知更鸟五条按需触发知识；旧精选卡《星核猎手同伴》称艾利欧在格拉默废墟遇到流萤，和事实表、旧经历档案中卡芙卡找到流萤的记载冲突，因此未迁入该冲突叙述。
- 从旧经历档案与事实表提炼匹诺康尼的流萤背景、星穹列车与帕姆，补入已有 `world.md`；没有复制旧项目的大规模世界资料、用户聊天、私人记忆、数据库、凭据或缓存。没有改动 12 项任务角色池、子任务职责和权限，也没有启用朋友圈。
- `characters.md` 的「你」「用户」触发词会把原作开拓者条目注入普通任务，已收窄为「开拓者」。新增条目均非常驻；已激活条目不再由 One-Shot 连带触发重复注入。注入前导明确原作角色经历与当前用户的共同经历边界；真实用户共同经历只来自当前对话或有效用户记忆。
- 用户确认任务素材中的「卡夫卡」为误写，角色应称「卡芙卡」；共享任务角色配置已修正显示名，仍引用现有素材文件 `卡夫卡.png`，不改动原图。其他 12 位任务角色不是知识条目的强制名单，不为补知识而虚构与流萤的直接关系。

## 知识验证

`src/main/rag/worldbook-firefly.test.ts` 直接加载仓库实际 `prompts/worldbook` 目录，验证卡芙卡与匹诺康尼条目能触发，银狼与帕姆等无关条目不随之注入，普通 TypeScript 任务不注入世界观条目，且原作与当前用户经历边界保留。另以实际 DMAE 更新验证已激活条目不重复进入连带触发。现有 `build-memory-injection.test.ts` 保留了最终上下文装配的文档触发边界。以上为确定性加载和装配测试，没有逐条请求真实模型。

## 拖动链与修复

实际调用链是 `src/renderer/main.ts` 的 pointermove → `requestAnimationFrame(flushMove)` → preload `moveTo` → `WINDOW_MOVE_TO` → `PetWindowMoveController.queueAbsolute` → Electron `setPosition`。Main 原本在 Renderer 已按帧合并之后再次 `setTimeout(16)`，形成额外整帧等待与相位抖动；这是代码确认的跟随延迟来源，不是已实测的帧率结论。本批仅去掉桌宠绝对位置更新的第二层等待，保留 Renderer 单一帧调度、坐标核验、松手时最终位置落盘、点击/拖动阈值、Live2D 动作、暂存帧覆盖层与隐藏时资源管理；其他窗口未改节流策略。

用户提及的 `Desktop 2026.09.25 - 00.51.06.01.mp4` 在指定桌面位置未找到，本批未观看录像。定向单测证明 Main 收到位置后无需再等 16 毫秒，并保留松手落盘与无效坐标保护；不把这当作窗口跟随流畅度或 60 FPS 的实测。

用户通过托盘正常退出旧构建后，本轮仅启动一次新构建。窗口实际加载本项目 `dist/renderer/index.html`；实机桌宠拖动一次，窗口位置按手势移动 75×10 像素，松手后保持在目标位置。用户确认「拖动滑动都正常」，随后按请求单击模型并确认「点击正常」。自动化尝试点击时检测到用户正在操作窗口，未继续输入；点击表情的具体播放与复位时序没有独立事件日志，不把用户反馈扩写为逐帧测量。没有录制逐帧数据，60 FPS 与持续拖动帧时间均未实测。

## 验证与边界

- 受影响 4 个测试文件、19 个用例通过；用户确认名称后，角色映射相关 3 个测试文件、12 个用例再次通过，并新增专门的卡芙卡显示名及原素材路径断言（该文件 3 个用例通过）。`npm run check:renderer` 通过；完整构建一次、仅受名称影响的 Main/Renderer 补建一次通过。Vite 仅有既有大包提示。未跑全量测试或逐条模型请求。
- Firefly 内 QQ Music 工具审批链、真实语音合成/播放/停止、所有页面视觉态及 12 位任务角色逐一展示继续标为未覆盖。模型授权沿用已确认取得原作者授权的记录，具体再分发范围留待发布前检查。
- 保留全部累计工作树修改；未修改旧 Firefly 仓库，未提交、推送或发布，未进入 Batch 6，也未更换 Harness 或加入 Jev。
