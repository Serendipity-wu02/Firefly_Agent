# Firefly Batch 3：Work 文件读取证据、范围确认与 Markdown 导出

日期：2026-09-24。基于当前累计工作树实施；未提交、推送或发布。本批没有替换 Agent Loop、Work UI、权限系统、取消机制或历史存储。

## 复用与补齐

| 位置 | 本批作用 |
| --- | --- |
| `src/main/chats/chats-ipc.ts`、`src/main/chats/chats-store.ts`、`src/shared/chat-types.ts` | 复用 Main 持有的会话、待发队列和附件快照；仅 Work 用户勾选必读时为所选文档建立本次读取范围。Main 的原生对话框确认超出单次 2000 行的范围；取消与文件变更拒绝入队。 |
| `src/main/chats/work-read-scope.ts`、`src/main/orchestrator/tools/fs-tools.ts` | 对真实文件计算规范路径、版本哈希和行数；沿用 `read_file` 的 10 MB 与每次 2000 行限制；执行时重新校验版本并限制已确认范围。 |
| `src/main/agui-bridge.ts`、`src/main/chats/work-file-evidence.ts` | 仅由 Main 当前运行的成功工具结果计算文件／分段覆盖；历史、模型文字、失败、拒绝、取消与未执行结果不能补证。任务终态与文件完整性分开报告。 |
| `src/main/orchestrator/build-options.ts`、`src/main/orchestrator/cyrene-agent.ts`、`src/main/orchestrator/harness/adapter/tool-runtime.ts`、`src/main/orchestrator/tools/registry/tool-context.ts` | 把 Main 持有的文件范围传给原有运行与工具链；提示只包含文件元数据，文件正文仍是外部不可信内容；没有新增自动记忆写入。 |
| `src/main/orchestrator/harness/tool-round.ts`、`src/main/orchestrator/conversation-transcript-types.ts`、`src/main/orchestrator/transcript-sink.ts` | 原有规范轨迹记录真实成功读取的结构化证据，供本轮完成判定使用。 |
| `src/main/chats/work-markdown-export.ts`、`src/main/chats/chats-ipc.ts`、`src/preload/index.ts`、`src/shared/ipc-channels.ts` | 冻结已结束 Work 任务的展示快照后，由 Main 原生保存对话框选路径并写 UTF-8 Markdown。导出任务状态、步骤状态、最终回答、错误与读取结论；不另附原始文件正文、工具参数、授权、密钥或真实路径。原生对话框负责覆盖确认。 |
| `src/renderer/react/features/chat/components/ChatComposer.tsx`、`src/renderer/react/features/chat/components/ChatComposer.css`、`src/renderer/react/features/chat/pages/ChatPage.tsx`、`src/renderer/react/features/chat/pages/pending-queue-flow.ts` | 增加显式必读选择并走原队列；首个新 Work 会话的空队列检查与入队交错时补一次消费，仍由原有认领与 Main 并发守卫防重复运行。 |
| `src/renderer/react/features/chat/pages/run/AgentRunController.ts`、`src/renderer/react/features/chat/components/ChatMessageList.tsx`、`src/renderer/react/features/chat/pages/chat-page-normalizers.ts` | 将 Main 的读取结论落入本轮助手消息并独立展示；没有 Main 回执时不显示“全文已读”。 |
| `src/renderer/react/features/chat/components/ConversationSidebar.tsx`、`src/renderer/react/features/chat/components/ChatPageNavigation.tsx`、中英文文案 | 已结束 Work 任务的右键菜单增加 Markdown 导出，不提供 Renderer 任意写入路径。 |

## 验证记录

- 自动验证：受影响的 18 个测试文件通过，383 个测试通过；补修首任务队列竞争后，`pending-queue-flow.test.ts` 26 个用例通过。Main、Preload、Renderer 类型检查通过；Main、Preload、Renderer 构建通过。仅 Renderer 补修后只重建 Renderer，并在现有实例刷新一次；未重复全量测试或重启 Main。
- 实机启动：新版本 Electron 已启动；当前 Work 进入公开临时目录 `E:\Codex\Batch3-Public-Fixtures`。未使用私人文件，未改变工具权限；运行日志显示权限级别为 `read-only`，`read_file` 依原规则获准。
- 实机完整读取：`full.txt` 由真实 `read_file` 成功读到 1–4/4 行；Main 报“完整读取已验证”，运行日志为成功终态，页面显示本轮处理完成。
- 实机部分读取：`partial.txt` 为 2001 行；原生对话框明确显示完整分页与“只读前 2000 行”两个选择及未覆盖的第 2001 行。选择缩小范围后，真实 `read_file` 成功读取 1–2000/2001 行；Main 报“部分读取，未覆盖全文”，任务成功终态没有被误当作全文完成。
- 实机不可读：选中公开 `unreadable.txt` 后暂时移走该样本，必读发送被 Main 预检拒绝；原草稿与附件保留，没有新增运行或“全文完成”结论。样本已恢复。执行中失败、拒绝、取消、未知结果由定向自动测试覆盖，未做破坏性实机注入。
- 实机导出：已结束任务右键导出成功，原生对话框写出 UTF-8 `E:\Codex\Batch3-Public-Fixtures\batch3-export.md`；内容为当前任务终态、最终回答和部分读取结论，未附真实路径、工具参数或额外文件正文。第二次导出在保存对话框取消，原任务与读取状态未变。
- 首个新 Work 任务曾短暂停在队列，切入任务后才消费；针对已确认的空队列检查／入队竞争增加补消费和回归测试。下方 2026-09-25 收口记录补充了修复后的真实自动派发验证。

## 边界与状态

- 超过现有 `read_file` 10 MB 上限或非文本文件在预检阶段拒绝，不声明部分或完整读取；普通 Work 附件没有勾选必读时不强制读取。
- 导出目标文件覆盖确认、执行中读取失败、范围变更使旧确认失效，以及切换任务时的快照隔离由定向测试覆盖；本次 GUI 验收没有执行这些破坏性分支。
- 运行日志仍有与本批无关的 `RAG not initialized` 历史索引告警；不在 Batch 3 修改 Memory/RAG。
- 发布身份、素材授权、音乐与 Jev/DecisionProvider 不在本批。保留全部累计工作树修改，不进入 Batch 4。

## 2026-09-25 收口：自动派发、桌宠帧率与 task 素材

### Work 实机结果

- 当前实例中新建 Work，选择已恢复可读的公开 `unreadable.txt`，勾选必读，仅点击发送一次；未追加消息、未切换会话触发派发。
- 本次会话 `be2964e7-da42-4cf6-adcf-d1e8490463da`，唯一运行 `run-1790265137855-7u88vy`。Main 日志记录一次新请求、一次成功 `read_file`（1–1/1 行），随后 `terminal=completed` / `terminal=success`；后续日志没有第二次启动。
- 同一会话的持久化结果为 2 条消息、`pendingMessages` 长度 0、无 `pendingDispatch`，本轮助手快照 `status=terminal`、`terminalStatus=success`。Main 独立展示“完整读取已验证（1/1 行；全文 1 行）”。仅核对该公开测试会话的标识、计数、终态和内容长度，未摘录密钥或隐藏思考。
- 实际画面最终为普通空闲提示和发送按钮，无停止按钮及待发队列。期间自动化无障碍树曾在发送按钮已经恢复后继续返回旧的“运行中”提示；后续画面和新树均为空闲。未据旧提示断言 Main 未释放，也没有用定时解锁。此次未测量精确的 UI 结算延迟。
- 本轮已有 `ChatPage.tsx` 的终态刷新版本与 `session-runtime-state.ts` 忙态派生逻辑保留；新增真实 Sender 集成测试，验证 Work 从忙到闲时不编辑输入框、不切会话即可更新提示与按钮，随后 Enter 只走一次发送回调，不走队列回调。
- 运行沿用 `read-only` 权限级别；没有修改工具开关。此前完整读取、部分范围确认、导出与取消保存的实机结果沿用。执行中读取失败、已有目标文件覆盖确认仍为**定向测试覆盖，实机未确认**。
- Batch 3 技术收口；保留已有 `RAG not initialized` 历史索引告警，不扩展到 Memory/RAG。

### 桌宠 60 FPS

- `src/renderer/live2d/manager.ts:16` 定义 `PET_TARGET_FPS = 60`，`manager.ts:120` 给现有 Pixi Application ticker 设置 `maxFPS`。只使用原有单一 ticker，未增加计时器或修改动作时间倍率；隐藏时的停止／恢复机制沿用原实现。
- `manager.test.ts` 覆盖该配置。本轮构建包含此调整。**60 FPS 是配置目标／上限，尚无实际帧率测量，不能据此声称持续达到 60 FPS 或低帧率已解决。**

### 12 项素材与职责

源目录当前实际为 `C:\Users\w1558\Desktop\tast`（用户先前称 Desktop task）；目标为 `src/renderer/tast`。12 张均为 1254×1254 PNG，复制后逐项 SHA-256 与源文件一致；桌面原文件保留，运行时只引用项目内资源。

| 展示名称 | 项目资源文件 |
| --- | --- |
| 艾利欧 | `src/renderer/tast/艾利欧.png` |
| 大黑塔 | `src/renderer/tast/大黑塔.png` |
| 丹恒 | `src/renderer/tast/丹恒.png` |
| 姬子 | `src/renderer/tast/姬子.png` |
| 卡夫卡 | `src/renderer/tast/卡夫卡.png` |
| 帕姆 | `src/renderer/tast/帕姆.png` |
| 刃 | `src/renderer/tast/刃.png` |
| 三月七 | `src/renderer/tast/三月七.png` |
| 瓦尔特 | `src/renderer/tast/瓦尔特.png` |
| 星期日 | `src/renderer/tast/星期日.png` |
| 银狼 | `src/renderer/tast/银狼.png` |
| 知更鸟 | `src/renderer/tast/知更鸟.png` |

原底座 `tast` 目录是展示资源，不独立定义执行职责。本轮按文件姓名绑定展示；`general` / `document` / `search` 仍决定执行职责及工具范围，没有为 12 位编造职责、人设或权限。未启用朋友圈。

| 修改位置 | 原因与实际引用 |
| --- | --- |
| `src/shared/task-characters.ts` | 单一的精确姓名／文件名表，Main 与 Renderer 共用。 |
| `src/main/tasks/task-character-pool.ts` | 使用新名单，沿用会话内角色占用与释放机制；替换黄金裔说明为中性的可选展示说明。 |
| `src/main/orchestrator/mode-prompt-profile.ts` | Work／Code 注入可选展示名单，不给 Chat／Learn 新增角色。 |
| `src/main/orchestrator/harness/builtin-tools.ts` | `companion_id` 为可选的精确名单选择；未知值拒绝，`subagent_type` 的职责和权限保持原链路。 |
| `src/main/orchestrator/task-runtime.ts` | 在创建任务会话前领取角色，创建／恢复失败时释放；避免未知或占用角色留下空任务会话。 |
| `src/renderer/react/character-portraits.ts` | 静态导入 12 张项目内 PNG，移除该 task 映射的旧黄金裔图片；未知资源不回退到错误角色。 |
| `src/renderer/react/features/chat/components/task-delegations.ts` | 实时事件只接受共享表中精确匹配的姓名与文件组合。 |
| `src/renderer/react/features/chat/components/TaskDelegationRow.tsx` | 既有任务行直接使用映射头像及姓名，覆盖运行、完成、失败、取消状态。 |
| `ChatMessageList.tsx` 的既有任务行引用 | 实时执行时间线和持久化历史沿用同一组件；相关测试数据改为新名单，没有另建执行链。 |
| 上述相邻测试及 `manager.test.ts`、`session-runtime-state.test.ts`、`ChatComposer.sender-integration.test.ts` | 覆盖资源存在、精确映射、角色占用／失败释放、四种展示状态、帧率配置和忙闲切换。 |

新 task 映射没有黄金裔／昔涟回退。旧历史记录没有重写，也没有擅自把历史人物映射成新人物；旧文件名无新头像映射时不显示错误头像。旧 `tast` 源图片尚未批量删除；构建中仍有来自 `src/renderer/react/avatars`、被 Moments 组件引用的旧角色图片。**不能宣称旧角色打包资源已清理**，该清理继续列入后续核实引用后的资源待办。

12 项的资源及组件状态由自动测试验证，尚未逐一通过真实模型子任务触发展示。若后续需要专属职责或表达，需要用户提供每位的明确设定；本轮展示接入不依赖这些设定。素材再分发授权仍为发布前待办。

### 验证与 Git

- 本轮已有定向测试记录：9 文件 107 用例通过；随后终态相关 4 文件 91 用例通过；补充 PNG 完整性／12 人四状态检查的 2 文件 10 用例通过。以上有交叉，不相加作独立用例总数。
- 最后新增真实 Sender 忙闲切换验证：`ChatComposer.sender-integration.test.ts` 15 用例通过。
- 已有 Main／Renderer 类型检查、完整构建及后续 Renderer 构建通过；当前实例已加载构建。最后仅改测试与本记录，没有再次构建或重启。
- `git diff --check` 通过（Git 提示行尾转换，不是空白错误）。分支 `main`，HEAD `46610b9df82eecbfea03dffe7de1f340bf42080c`。
- 当前累计工作树：237 个已跟踪修改、1 个已跟踪删除、30 个未跟踪条目；未跟踪目录条目可能包含多个文件，不能把 268 条状态记录等同于文件总数。没有暂存改动；全部累计修改保留，未提交、推送或发布。
