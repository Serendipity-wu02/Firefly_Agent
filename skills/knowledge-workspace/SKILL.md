---
name: knowledge-workspace

description: Firefly 在 Work 的知识学习任务中操作 Obsidian Vault 的规范：目录约定、文件读取、按标题定位、创建与修改 Markdown 的安全原则。
version: 1.0.0
effectKind: mutation
modes:
  - work
tools:
  - obsidian_list_files
  - obsidian_search
  - obsidian_read_file
  - obsidian_read_section
  - obsidian_edit
  - obsidian_open_note
---

# Firefly Obsidian Workspace

本 Skill 描述 Firefly 在 Work 的知识学习任务中如何操作绑定的 Obsidian Vault。本 Skill 保留可执行的文件操作规范；宿主运行时的路径、审批与工具授权边界始终优先。

## Vault 目录约定

当前会话绑定的 Vault 根目录为 `workspaceRoot`。所有相对路径均基于该根目录。

| 目录 | 用途 | 默认权限 |
| --- | --- | --- |
| `materials/` | 用户放置原始学习资料 | 只读 |
| `notes/` | 学习笔记 | 读写 |
| `exercises/` | 练习、测验、复盘 | 读写 |
| `exams/` | 正式试卷、答案解析、考试复盘 | 读写 |
| `templates/` | 通用模板 | 读取 |
| `learn/progress.md` | 学习进度总览 | 读写（静默维护） |

用户可以在 `materials/`、`notes/`、`exercises/` 下自行创建子目录（如 `notes/英语/`、`notes/论文精读/`）。子目录名称可以使用中文。

## 读取文件

### 列出文件

- 使用 `obsidian_list_files` 获取 Vault 整体结构。
- 不确定文件位置时，先用 `obsidian_search` 搜索关键词。

### 读取全文

- 使用 `obsidian_read_file` 读取 `notes/`、`exercises/`、`materials/` 下的文件。
- 读取前确认路径在 Vault 内，不接受绝对路径。

### 按标题读取章节

- 使用 `obsidian_read_section` 按 `# / ## / ###` 标题定位。
- **直属章节**：包含指定标题，遇到下一个任意级别标题即停止，不包含子章节。
- **完整章节**：指定标题及其所有子标题的完整内容。

例如文件结构：

```markdown
# 主题

## 概念 A
概念 A 正文。

### 细节 1
细节 1 正文。

## 概念 B
概念 B 正文。
```

- `obsidian_read_section` 传入 `headingPath: ["主题", "概念 A"]`、`includeChildren: false` → 返回 "## 概念 A" 和 "概念 A 正文。"。
- 同一 `headingPath` 配合 `includeChildren: true` → 还包含 "### 细节 1" 和 "细节 1 正文。"，到 "## 概念 B" 前停止。

## 写入文件

### 创建新文件

- 使用 `obsidian_edit` 的 `create` 操作。
- 创建前确认父目录存在（工具通常会自动创建）。
- 如果文件已存在，不得覆盖，改为追加或提示用户。

### 修改已有文件

- 必须先 `obsidian_read_file` 读取文件，获取 `contentHash`。
- 使用 `obsidian_edit` 的 `replace_section`、`replace_file`、`append` 或 `append_to_section` 操作时，必须传入 `expectedContentHash`。
- 如果 `contentHash` 不匹配，说明文件已被修改，必须重新读取后再操作。

### 追加内容

- 优先使用 `append` 或 `append_to_section`。
- 适合在笔记末尾添加新的理解、链接或总结。

## 安全规则

- 不操作 `.obsidian/` 目录。
- 不跳出绑定的 Vault 根目录。
- 不覆盖已有文件。
- `materials/` 默认只读；用户明确要求标注原始资料时例外。
- 不创建无意义的空占位文件。

## 常用路径模板

- 新主题笔记：`notes/<subject>/<topic>.md`
- 新练习/复盘：`exercises/<subject>/<yyyy-mm-dd>-<topic>.md`
- 正式试卷：`exams/<subject>/<yyyy-mm-dd>-<topic>-试卷.md`（答案解析、考试复盘同目录同前缀）
- 进度总览：`learn/progress.md`
- 主题模板：`templates/topic-template.md`
- 复盘模板：`templates/review-template.md`

## 宿主前提

仅在用户选择并启用本能力、当前 Work 会话已绑定知识工作区且宿主提供以下工具时执行持久化流程：`obsidian_list_files`、`obsidian_search`、`obsidian_read_file`、`obsidian_read_section`、`obsidian_edit`、`obsidian_open_note`。缺少前提时说明限制，不改用 shell 绕过。此正文保留旧工厂的启用、Vault 可用性与完整工具依赖条件；它不是运行时门禁，也不自动注入，运行时授权仍由宿主负责。
