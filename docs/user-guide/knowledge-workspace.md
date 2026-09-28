# Work 知识工作区使用说明

当前会话模式只有 Chat、Work、Code。Learn 模式已退役，但**学习陪伴**能力保留在 Work 的显式知识工作区中：讨论材料、记笔记、测验与按权限维护学习进度。工作文件保存在本地 **Obsidian Vault**；用于模型理解的对话与所选材料上下文会发送至你配置的模型服务，不能理解为“内容绝不出本机”。

---

## 一、它能做什么

Work 绑定并启用知识工作区后，可以：

1. **陪你读材料** — 把学习资料（论文、笔记、代码片段）放进 Vault，Firefly 可以边读边和你聊。
2. **帮你整理笔记** — Firefly 提供新建、追加、整文件替换和按章节编辑工具；实际修改范围取决于本次工具操作，请核对结果。
3. **后台追踪进度** — 仅绑定且已初始化的 Work Vault 可进入进度钩子，并要求本轮文件写权限策略为允许；只读或逐次审批档位不会静默写进度。少于 50 字符且没有测验作答证据的回复会跳过，无有效变化时不保存。成功保存的结果写入 Vault 的 `learn/progress.md`，不保证每轮都有更新。

> 后台进度更新不阻塞主回复，失败不等于保存成功。需要逐次审批的文件修改仍走工具审批链，不能以“静默进度”绕过批准。

---

## 二、目录长什么样

知识工作区绑定在 Work 会话上。普通 Work 会话、选择目录或切换模式都不会自动创建学习结构。

点击“添加学习结构”并确认后，Firefly 只创建缺失的下列文件，不覆盖已有文件；目录不必为空：

```
你的学习目录/
├── README.md                  ← 工作区总说明
│
├── materials/                 ← 放原始学习资料
│   └── README.md
│       论文、PDF、文章、代码片段、课程笔记……
│       建议保存原始资料；目录名称本身不构成写保护。
│
├── notes/                     ← 你和 Firefly 一起写的笔记
│   └── README.md
│       建议每个大主题一个文件，例如：
│       notes/Transformer/...
│       notes/English/...
│
├── exercises/                 ← 练习、测验、易错题、复习记录
│   └── README.md
│       例如 exercises/TypeScript/2026-08-04-generics.md
│
├── templates/                 ← 现成的笔记模板
│   ├── topic-template.md      ← 主题笔记模板（新建主题用这个）
│   ├── review-template.md     ← 复习模板（复习日用这个）
│   └── outline-template.md    ← 学习大纲模板
│
└── learn/
    └── progress.md            ← 你的学习进度（Firefly 按权限维护；手工编辑前备份）
```

### 每个文件夹是干啥的

| 路径                         | 谁会写             | 用来干嘛                                  |
| ---------------------------- | ------------------ | ----------------------------------------- |
| `materials/`                 | 你（手动）          | 放原始资料，是 Firefly 的"教材库"          |
| `notes/`                     | 你 + Firefly        | 主题笔记，用 Obsidian 双向链接串起来      |
| `exercises/`                 | 你 + Firefly        | 练习题、错题本、复习日记                  |
| `templates/`                 | 你（手动）          | 通用模板，按主题复制后改一下就能用         |
| `learn/progress.md`          | Firefly（按权限更新）      | 各主题掌握度 + 待解决问题 + 下一步建议    |

> 提示：除了 `learn/progress.md` 是 Firefly 自己维护的之外，其他文件夹你都可以在 Obsidian 里自由编辑或增删。

---

## 三、里面的 `progress.md` 长啥样

这是 Firefly 帮你维护的"学习账本"。打开 Vault 里的 `learn/progress.md`，你大概会看到这样的东西（YAML 部分是给程序读的，正文是给你看的）：

```markdown
---
schemaVersion: 1
currentTopic: Transformer 架构
currentSection: Self-Attention
topics:
  Transformer 架构:
    status: learning
    mastery: 35
    unresolvedQuestions: []
    lastStudiedAt: 2026-08-06T12:34:56.000Z
updatedAt: 2026-08-06T12:34:56.000Z
---

# 学习进度

**当前主题**：Transformer 架构 > Self-Attention

## 主题掌握度

- 📖 **Transformer 架构** — 35% (学习中)

## 下一步

继续讲解 Multi-Head Attention 的计算过程。
```

### 几个关键概念

- **status**（主题状态）
  - `learning`（学习中，📖）
  - `reviewing`（复习中，🔄）— 更新未指定状态、原状态为 `learning` 且掌握度 ≥ 50 时推断
  - `mastered`（已掌握，✅）— 更新未指定状态且掌握度 ≥ 90 时推断
- **mastery**：0-100 的掌握度参考值，由有效进度增量调整，不是客观成绩或每轮必变的数值。
- **unresolvedQuestions**：这一主题里你还没解决的小问题（直接在 notes 里继续追问就行）。
- **nextStep**：Firefly 给你建议的"下次从哪儿接着学"。

> 进度抽取与保存均会失败；请以 `learn/progress.md` 的实际内容为准，不把正常聊天结束等同于进度已保存。

---

## 四、怎么开始用

1. 准备一个学习目录或已有 Obsidian Vault。
2. 选择 **Work**，在当前会话绑定该目录。
3. 若要建立默认结构，点击 **添加学习结构**，阅读确认框后确认；取消则不初始化。
4. 明确提出学习、笔记或测验请求。

> 已绑定目录含 `.obsidian` 或 `learn/progress.md` 时，可直接使用六个 Obsidian 工具，工具开关及审批仍然生效。只有已有可读 `learn/progress.md` 才注入教学工作流并允许按权限更新进度；普通 `.obsidian` Vault 不会自动转为学习任务。需要学习结构时请显式确认初始化，旧学习进度可继续使用。

之后想写笔记就直接说，比如：

- "帮我读 `materials/某篇论文.md`，给我讲讲摘要。"
- "在 `notes/Transformer/01-简介.md` 下新建一节 **Self-Attention**，内容是你刚才那段讲解。"
- "把我刚才的回答整理成复习卡片，写到 `exercises/今天的复习.md`。"
- "打开 `notes/Transformer` 让我自己看一下。"

需要限定章节时，请明确文件和章节；工具同时支持整文件替换，不能仅凭回复文字认定修改范围正确。

---

## 五、安全 & 隐私说明

- Vault 文件保存在本机；本文的路径限制针对 Obsidian 专用工具，不代表应用其他工具都被限制在该目录，模型请求仍会发送相关上下文。
- Obsidian 专用工具校验 Vault 相对路径、已有目标的真实路径并拒绝 `.obsidian/` 等内部目录；这不是本轮完成的全面安全验证。
- 六个工具为 `obsidian_list_files`、`obsidian_search`、`obsidian_read_file`、`obsidian_read_section`、`obsidian_edit`、`obsidian_open_note`；每次操作独立校验当前运行绑定的 Vault。写入使用 `fs-write` 审批策略，打开笔记保留 `network` 风险分类。
- `obsidian_edit` 修改已有文件要求 `expectedContentHash`；缺失或与读取后变化的文件不一致时拒绝写入，`create` 拒绝覆盖已有文件。该机制不保证模型选择的内容或章节正确。

---

## 六、常见问题

**Q：进度追踪会拖慢聊天吗？**
A：抽取在回复结束后异步调度，使用本轮模型配置；不是独立的小模型配置，也没有性能保证。失败记录警告，不向主回复流程抛出。

**Q：我能不能手动改 `progress.md`？**
A：可以，但请先备份并保持 YAML 结构。加载失败会回退默认进度，不能保证恢复手工损坏的数据；删除文件会丢失原进度，不作为普通排障步骤。

**Q：可以多个 Vault 吗？**
A：可以。Work **按会话**绑定 Vault；每个运行和延迟进度操作捕获自己的工作区，不使用全局可变 Vault 指针。

**Q：怎么停止进度追踪？**
A：后续 Chat、Code 或未绑定已初始化 Vault 的 Work 运行不进入该进度钩子。只读或逐次审批权限不会触发静默进度写入。已调度的更新仍指向原工作区，不保证切换模式自动取消；工具注册不会随单次运行注销。

## 实现与验证边界

当前入口为 [knowledge-workspace.ts](../../src/main/knowledge/knowledge-workspace.ts)、[初始化 IPC](../../src/main/chats/chats-ipc.ts)、[提示词装配](../../src/main/orchestrator/build-options.ts)、[Obsidian 工具](../../src/main/knowledge/obsidian/obsidian-tools.ts) 与 [进度钩子](../../src/main/knowledge/progress/learn-post-turn.ts)。教学规则位于 [knowledge_workflow.md](../../prompts/knowledge_workflow.md)。用户数据仍保留 `learn/progress.md` 与 `learn/outline.md` 路径，不随模块更名搬迁。

历史核对记录：2026-09-26 仅静态核对，未运行测试、模型请求或 Vault 写入验收。该日期记录对应退役前实现，不表示当前版本已完成真实模型、GUI 或 Vault 写入验收。
