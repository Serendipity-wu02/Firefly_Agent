# Firefly 契约与数据格式统一报告（2026-09-25）

> **日期**：2026-09-25
> **状态**：历史实施报告；定向验证已执行，真实用户数据迁移与界面重开尚未验收
> **范围**：事件、数据存储、插件、SDK、Skills 与旧格式适配
> **适用边界**：本文记录当日实现与验证；旧公开桥、协议及环境变量兼容已有后续收敛，不构成现行兼容承诺。现行入口见[文档导航](../../README.md)。

## 1. 实施范围与证据边界

- 改动限于迁移工程，原项目源码保持不变。验证未覆盖安装、真实模型请求、应用启动、播放器操作或真实用户资料迁移。
- 迁移机制设计为在正常启动时、相应存储加载前执行；仅有临时目录测试，尚无真实历史数据的界面验收证据。
- 首次历史列表为空的原始原因仍未确定。

## 2. 历史契约与实现
| 范围 | 记录时契约与实现 | 旧格式处理 |
|---|---|---|
| 内部 CUSTOM 事件 | Main 生产与 Renderer 消费均使用 `firefly.*`；AGUI/preload/AgentRunController 原链路 | `src/shared/legacy-firefly-contracts.ts` 将历史事件规范化一次；不同时发送两套事件 |
| 朋友圈身份 | author / actor / mentions 使用 `firefly`；Main 创建用户动态仍固定为 user | moments-store 与 reaction-queue 读取旧记录后备份、规范化；正文不做名字替换 |
| 开关 | `fireflyMomentsPostingEnabled`、`fireflyMomentsReactionsEnabled` | 已保存新字段优先，包括 false；去掉旧字段，保持原默认和用户开关 |
| 关系日志 | `fireflyFeeling` | 原条目字段读取时规范化并备份；不改聊天内容 |
| Chat、运行、子任务 | `firefly-chats`、`firefly-runs`、`firefly-tasks` | `src/main/migration/firefly-data.ts` 验证复制、暂存目录后 rename；保留旧目录 |
| 工具结果与 reviews | 同一 `firefly-runs` 根下，原会话/运行/工具引用不变 | 工具结果 opaque resultRef 的迁移读取有实际存储测试，reviews 同目录复制 |
| 导出清单 | `.firefly-export-manifest.json` | 保留旧清单；坏 JSON 报错，不再静默覆盖 |
| Skills | 八个既有 Firefly Skill，原扫描/注册/授权机制不变 | 历史 ID/slash 映射集中在 skill-id-aliases；启用状态和模式覆盖新值优先，新写入删除旧键 |
| 浏览器偏好/环境变量 | 当前键、命令、环境变量使用 Firefly | 精确旧键集中读取；浏览器旧值保留作来源，新值优先；环境只读取、不写旧变量 |
| Window API | Firefly 独立类型与实现 | 旧 Window 名称只由集中表暴露同一实现，旧类型引用新类型；不复制执行链 |
| 插件 | FireflyPlugin、firefly-plugin、firefly-panel/1、FireflyPanel、/.firefly/ | 旧协议/资源名仅在集中适配表和入口解析；旧资源加载现桥并提供旧全局别名 |
| SDK | 本地 `@firefly/plugin-sdk@0.2.0`，private=true | 保留类型别名于 SDK legacy.ts；不假称 npm 已发布，不使用不存在的在线安装源 |
| 市场 | 默认 registry 和下载白名单均为空；UI 明示未配置，保留本地 ZIP | 现有第三方安装来源不改写；移除上游默认市场与投稿指令 |
| 渠道凭据 | 新 fallback 写入 obf2，OS safeStorage 路径保留 | obf 读取使用原派生后缀；解密不可用/文件损坏报错并阻止覆盖，不降为空凭据 |

### 数据保护的精确行为
- 当前目录不存在才从旧目录复制；当前目录已存在时使用当前目录，**不自动合并两个目录、不覆盖现有新数据**，旧源仍保留。此策略不宣称两个并存目录已自动合并全部历史。
- 复制包含工具结果与 reviews；JSON/JSONL 先校验，文件复制后比较 SHA-256，失败清理迁移暂存副本，保留源。
- 同文件字段规范化前创建一次 `.pre-firefly.bak`，通过临时文件替换；重复运行不重写已规范化内容，不覆盖既有备份。
- run/task 索引和已有会话损坏不再按空数据处理。General settings 首次操作即保存时，也在加载后再次检查错误状态，防止失败后写空数据。
- 真实用户迁移与重开显示在记录时尚未验收；定向测试数量不能替代界面证据。

## 3. 插件安全边界
- 当前面板 iframe 仅生成 Firefly scheme。旧外部 scheme 经过同一启用状态、host、路径段、realpath、扩展名检查，不建立另一条宽松服务。
- 宿主仍以登记的 contentWindow 与精确 origin 识别插件，不接受消息内伪造身份。
- 只接受当前版本和明确的旧版本；未知协议拒绝。返回协议按已校验消息协商，不双发。
- 桥接结果还要求 event.source 为 parent；异步结果不回给已换掉的面板窗口。
- 旧保留资源路径不能由插件包冒充；关闭插件时该路径也拒绝。
- 本地 SDK 包含完整 LICENSE，CJS/ESM 与四个插件示例通过本地 tarball 验证。

## 4. Skills 快照更新
除普通目录外，检查了 `vendor/firefly-skills/skills-snapshot.zip` 的条目与文本内容。保留第三方名称与许可，仅修改项目定制的品牌/安装路径：
- office-design/scripts/validate_theme.py
- pdf/README.md
- pdf/scripts/make.py
- pdf/scripts/pdf_cover.py
- pdf/tests/test_make.py
- skill-creator/SKILL.md
- xlsx/SKILL.md
- xlsx/scripts/xlsx_workspace.py

PDF 元数据作者、封面文字、内部字体别名和临时目录，以及 Skill 安装说明，均使用当前名称。快照哈希：
`98005bbb2126c231679d60373f1b50f9219b562c5f33fa98de0a130477c32b27`，813602 字节。

已安装默认快照的更新由 `src/main/migration/skill-snapshot.ts` 处理：只替换 SHA-256 与已核实原始文件完全相符的 8 项，保留原文件备份；用户改过的文件不覆盖、不猜测内容。测试、旧快照和临时备份均未加入打包资源。

## 5. 历史验证结果与覆盖范围

以下为 2026-09-25 记录的分域验证结论；不同测试组存在覆盖重叠，不能相加作为全仓通过数。

| 验证范围 | 结果与限制 |
|---|---|
| 受影响测试集 | 涉及 132 个文件。128 个文件通过，剩余 4 个文件在修正后完成 89 项定向回归并全部通过；未重新执行完整的 132 文件集合或全仓测试。原始集合有 1 项跳过，不计为通过。 |
| 存储、朋友圈、设置、凭据与导出 | 定向回归覆盖备份、字段规范化、坏数据拒绝覆盖、工具结果引用与偏好保护；最终 `firefly-data.test.ts` 13 项通过，含引用保持、失败恢复和偏好用例。定向组的跳过项不计为通过。 |
| Skills 派发与迁移集成 | 插件、Skills 派发、历史规范化，以及迁移集成、快照、凭据的定向验证通过；结果不扩展为真实用户资料迁移已经验收。 |
| 插件协议与沙箱 | `panel-bridge-protocol.test.ts` 8 项通过；`plugin-panel-protocol.test.ts` 17 项通过、1 项跳过；沙箱失败关闭回归 2 文件、39 项通过。 |
| Main / Preload / Renderer | 类型检查与构建通过；清理 `dist` 后重新构建，契约修正后的受影响产物已刷新。Vite 大 chunk 警告仍存在，未验证性能优化效果。 |
| SDK | 本地 `npm pack` 校验含 LICENSE；四个示例编译及契约 smoke 通过。未发布 SDK。 |
| Skills 快照升级 | 公开旧快照的临时目录中完成 8 项更新并生成 8 份备份；重复迁移通过，manifest 大小与哈希匹配。 |
| 快照 Python 脚本 | 四个改动脚本 `py_compile` 通过；`test_make.py` 4 项通过。系统 Python 缺少 `pypdf`，测试使用已提供的隔离运行时，未安装依赖或修改全局 Python。 |
| 文本差异检查 | `git diff --check` 通过。 |

回归修正涉及朋友圈测试字段、音频夹具 base64、测试市场 hostname，以及 Bash 可执行文件查找。Bash 测试仅在测试进程的 PATH 中补充已有 Git 安装的 bin 目录，不修改系统环境。

验证不包含真实模型请求、播放器操作、实机启动验收或真实历史数据的界面验收。

## 6. 源码与构建残留
精确文件/行号见 [旧名称逐项清单](firefly-contract-residuals-2026-09-25.md)。
- 当前产品说明、prompts、Skills 源文件、示例与项目 SDK 主契约无旧品牌匹配。
- 运行源码中的必要旧值集中于 legacy-firefly-contracts、firefly-data、skill-id-aliases、旧类型别名；另保留防止私有旧状态进入 Git 的排除规则。
- 真实历史报告、上游贡献和素材许可保留事实；不加载为人设，不纳入运行打包入口。
- 清洁构建后，dist 中没有旧品牌命名文件。内容匹配仅见以下迁移代码或其打包结果：
  - dist/main/shared/legacy-firefly-contracts.js
  - dist/preload/shared/legacy-firefly-contracts.js
  - dist/main/main/migration/firefly-data.js
  - dist/main/main/skills/skill-id-aliases.js
  - dist/cli/index.js（旧环境/CLI 状态读取）
  - dist/renderer/assets/feedback-types-BeUBLuYI.js（共享旧格式解析）
- sourcemap 对应源码与许可/迁移字符串，不把映射文件误当旧实现。SDK 的 dist/legacy.d.ts 是旧类型读取别名。
- 旧本地安装包 `release` 未重新生成，不能代表该阶段实现；验证对应迁移工程的 `dist` 开发产物。

## 7. 未验证项与保护约束
- 真实用户数据的启动迁移、界面显示和重开保持未执行验收，需要在正常启动后单独确认；已有实机记录的覆盖范围不变。
- 用户修改过的安装 Skill 保留原状；只对可验证原始哈希的默认内容做自动更新。
- 真实 TTS、QQ Music 应用内审批、持续帧率、安装器及公开发布许可范围继续沿用此前未覆盖记录。
- 不重构 Agent Loop，不扩权，不引入第二套设置/记忆服务，不接入 Jev。

## 8. 交付内容约束

源码交付不包含生成目录、用户配置、日志、原图备份或临时验证输出。截图助手与快照更名等既有改动不计为该阶段新增功能。
