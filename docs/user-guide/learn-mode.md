# Learn 模式使用说明

Learn 模式是 Firefly 的**学习陪伴**功能：她在聊天框里陪你讨论、记笔记、还能按现有流程维护学习进度。工作文件保存在本地 **Obsidian Vault**；用于模型理解的对话与所选材料上下文会发送至你配置的模型服务，不能理解为“内容绝不出本机”。

---

## 一、它能做什么

简单讲，Learn 模式做了三件事：

1. **陪你读材料** — 把学习资料（论文、笔记、代码片段）放进 Vault，Firefly 可以边读边和你聊。
2. **帮你整理笔记** — Firefly 提供新建、追加、整文件替换和按章节编辑工具；实际修改范围取决于本次工具操作，请核对结果。
3. **后台追踪进度** — Learn 回复结束且 Vault 可用时尝试抽取进度；少于 50 字符的回复会跳过，无有效变化时不保存。成功保存的结果写入 Vault 的 `learn/progress.md`，不保证每轮都有更新。

> 进度追踪是**完全静默**的：不会弹窗、不会打断你、失败了也不会影响正常聊天。

---

## 二、目录长什么样

Learn 模式用到一份"学习工作区"，所有 Learn 相关的数据都放在这里。Firefly 会自动帮你建立这套结构，你也可以手动整理。

首次绑定空目录时，Firefly 会创建下面这些文件夹和文件：

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
    └── progress.md            ← 你的学习进度（Firefly 自动维护，**别手改**）
```

### 每个文件夹是干啥的

| 路径                         | 谁会写             | 用来干嘛                                  |
| ---------------------------- | ------------------ | ----------------------------------------- |
| `materials/`                 | 你（手动）          | 放原始资料，是 Firefly 的"教材库"          |
| `notes/`                     | 你 + Firefly        | 主题笔记，用 Obsidian 双向链接串起来      |
| `exercises/`                 | 你 + Firefly        | 练习题、错题本、复习日记                  |
| `templates/`                 | 你（手动）          | 通用模板，按主题复制后改一下就能用         |
| `learn/progress.md`          | Firefly（自动）      | 各主题掌握度 + 待解决问题 + 下一步建议    |

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

超简单，三步搞定：

1. **新建一个空文件夹**（比如 `D:\我的学习\` 或者随便哪儿都行）。
2. 在聊天框右上角**选 Learn 模式** → **绑定这个目录**。
3. 开始和 Firefly 聊就好。

> 如果目录是空的，Firefly 会问你要不要**自动建一套默认结构**（点确定就行）。

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
- `obsidian_edit` 修改已有文件要求 `expectedContentHash`；缺失或与读取后变化的文件不一致时拒绝写入，`create` 拒绝覆盖已有文件。该机制不保证模型选择的内容或章节正确。

---

## 六、常见问题

**Q：进度追踪会拖慢聊天吗？**
A：抽取在回复结束后异步调度，使用本轮模型配置；不是独立的小模型配置，也没有性能保证。失败记录警告，不向主回复流程抛出。

**Q：我能不能手动改 `progress.md`？**
A：可以，但请先备份并保持 YAML 结构。加载失败会回退默认进度，不能保证恢复手工损坏的数据；删除文件会丢失原进度，不作为普通排障步骤。

**Q：可以多个 Vault 吗？**
A：可以。Learn 模式**按会话**绑定 Vault，切换会话就会换一份。

**Q：怎么停止进度追踪？**
A：后续使用 Chat / Work / Code 不触发 Learn 进度钩子；Obsidian 工具在 Learn 运行结束时注销。已调度的后台更新没有因切换模式自动取消的保证。

实现依据：`src/main/agui-bridge.ts`、`src/main/learn/progress/learn-post-turn.ts`、`learn-progress-service.ts`、`src/main/learn/obsidian/vault-init.ts`、`obsidian-workspace-service.ts` 与 `obsidian-tools.ts`。2026-09-26 仅静态核对，未运行测试、模型请求或 Vault 写入验收。
