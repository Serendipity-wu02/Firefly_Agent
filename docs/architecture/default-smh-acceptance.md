# 默认 S/M/H 交付验收记录

本轮是在独立云端源码副本完成的普通启动集成。未调用真实模型账号、用户渠道账号或用户电脑。交付②角色并行尚未开始。

## 功能与证据范围

- 普通桌面 Chat / Work / Code、可信渠道、scheduler / proactive / child 共用 Main 所有者、单写 backend、来源路由和运行许可。来源身份不能由模型文本或 Renderer 字符串授予。
- 真实离线 SDK 请求经过完整模型/工具循环、原始厂商 wire body 计数与单次发送许可。保存模型配置的 provider/model/transport 不被诊断固定模型替代；估算不会标成精确计数。
- S 保留 canonical 来源、工具调用配对与受控摘要；M 只接符合策略的直接用户原文或设置操作；系统、模型、引用、ASR和附件正文不会自动提升为直接用户事实。
- H 保持不可变 snapshot / native helper 读取边界。缺少 snapshot、helper 或有界查询覆盖时显示覆盖不足，不补写源历史，不回退旧个人 RAG。
- 授权附件进入 S，私有选择证明绑定完整引用、读取范围与 revision。取消、编辑、删除、关闭、重启缺证明均不能借旧收据读文件；历史附件缺当前权限时有明确不可用说明。
- 图片能力明确拒绝时，合法 caption 回退撤旧投影，重新计数并取得新许可。未知发送结果、有效流输出、权限、取消和超时不触发该回退。
- 旧个人记忆工具/IPC/检索链在普通模式退出，世界书、人设、导入文档、Work知识资料、ASR、提示音、普通音频及表情功能保留。
- 设置面板操作走 Main 验证及版本检查。生产改动与全部跳过测试按名称、原因、源码条件、环境和原始报告归档。

## 审查修复

最终网络发送前来源重验；持有 transcript 队列内的合法来源读取与错误阻断；附件选择证明及 regenerate；Work 读取前授权；准备阶段关闭阻止迟写；proactive 关闭后不继续发分段；子任务保留旧审计历史而不将旧内容当作新授权 S。

## 平台与交付边界

云端证据为实际 TypeScript / SQLite / 合成文件 / 离线 SDK 请求及构建，不能替代 Windows 安装器、DPAPI、原生 helper、8.3 路径和符号链接的实际 Windows 测试。Windows 后续接收只做固定步骤的代码合入、平台验收和 EXE 打包，保护本地已有修改。真实 API 联调按用户选择由用户执行。

## 固定源码验收（2026-10-06 06:45 UTC）

- Linux / Node v24.19.0：全量 7186 passed、133 skipped、0 failed、0 unhandled errors；684 测试文件通过，12 文件平台跳过。
- 全量开始和结束的 tracked diff SHA256 完全一致；全部 untracked 源文件 SHA256 也未改变。原始报告 SHA256：67a5c882ff26f8cafb15e31add42f3afd1e6b201e28c861ddee6351ab1277ec6。
- npm run build、check:renderer、设置入口 strict tsc、存储边界、git diff --check 均 exit 0。工具/打包/reporter 脚本 47/47，skills 清单 41 vendor + 4 maintained。
- 133 项跳过逐个按 file/name 唯一匹配源码条件并保留原始 runner 说明；130 为 Windows 专用，3 为 Windows/macOS 原生目录观察。DPAPI/protected-key、native helper、8.3 路径及符号链接/存储安全分别保留分类，绝不记为通过。伴随交付包的 full/report.json 和 skip-reasons.json 保存完整名单及证据位置。
- 独立整体集成审查通过。具体问题的原始复现、修复回归和 scoped review 已保留；预冻结 7152/133/1 的诊断报告也保留，其唯一旧 regenerate 问题已在本次最终全量中通过。
- 构建仅有既有大于 500 kB 的 bundle 提示；没有提高阈值隐藏提示。Windows 工件及账号级验证保持上文独立阶段。

## 手动模型接口联调

1. 在模型设置中选择已有档案，核对 provider、地址、model 和所需凭据；档案由 Main 读取，聊天传入的字符串不授予读取权限。OpenRouter 的模型名以服务端实际可用列表和调用结果为准，未自动替换用户保存值。
2. 用独立测试会话发送普通问题，确认收到答案；在 Work/Code 选择已授权工作区，执行一次只读文件工具，确认 call/result 和最终答案正常显示。
3. 使用合成偏好“我偏好简洁回复”，在记忆面板检查来源和状态，再开新会话验证；从面板更正或删除后，旧状态不可继续使用。
4. 测试一份合成图片和文档；撤销/取消或修改来源后，旧读取与迟到提交应明确拒绝。缺失历史 snapshot 应看到覆盖不足，不能当成没有历史。
5. 记录档案名称、操作、稳定错误码与发生时间即可，不在日志或报告中保存凭据。鉴权失败、429、超时、预算超限分别处理；估算模式不代表生成前的精确 token 计数。测试不会由本次云端构建自动发起。

## 计划实施说明

验收分布在 main-default-memory、default-model-loop、main-memory-runtime、default-run-capture、default-entry-adapters、AGUI、来源/策略及工具 suites，保留真实组合测试，未新增一个重复调用上述 suites 的聚合 .test 文件。第一交付按本次云端逻辑及构建验收独立记录；第二交付在此之后另行实现和验收。
