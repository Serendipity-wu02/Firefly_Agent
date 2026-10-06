# 多角色并行与写入协调交付验收

日期：2026-10-06。交付①默认 S/M/H 已独立提交为 e2b8da0；本记录是随后完成的交付②。两者的测试基线和平台范围分别记录。

## 已实现的运行契约

- delegate_agent 使用独立有界并行池，最多 3 个且受实际 maxParallel 限制；只读工具池独立。同一角色保持 single-flight。没有 Main 工作区协调器的入口保留串行执行。
- 同一 canonical 工作区共享 Main 协调器。声明范围的写入先做完整预检和原子路径认领；冲突仅终止冲突子任务，已经发生的写入及其他角色结果保留。
- 范围不明的 Shell 独占文件操作，同时阻塞其他角色的读和写。已经获得读取许可的操作先结算，后续读操作等待写操作真正完成；模型思考不占文件锁。不提供写入中间状态的稳定快照保证。
- 后台 Shell 返回 jobId 不等于操作结束。许可保留到真实进程和日志流关闭；只有相同 Main 所有者范围内的真实 job 控制入口可以控制持锁作业。
- 首个执行故障先停止自身运行，再等待真实资源结算，随后释放锁与发布终态；外部父运行不会被内部停止信号取消。嵌套 scheduler、Main 工具入口及 child 均有回归证据。
- 工具调用在开始前持久 checkpoint；canonical 工具结果在 committed 事件前持久 checkpoint。恢复时 planned 与 started/unknown 区分，未知结果写操作不能自动重放；已有精确匹配的关闭 marker 只读核验，仍需新 ingress 和有效 owner/lifetime。
- 写入证据来自 Main 的实际路径和前后摘要，包含 applied、partially_applied、not_applied、unknown。失败与取消仍显示此前完成的写入，模型文字不会成为成功证据。任务恢复、结果卡片与文件工作区保留同一结构化证据。

## 同时运行的直接证据

使用实际父 Harness → delegate_agent → AgentExecutor → 本机合成 HTTP/SSE 模型服务 → 文件工具。未调用真实账号 API。

- 共享单调时钟事件：A start 628.045217 ms，B start 665.761516 ms，最早 end 675.735926 ms。两个模型执行区间确实重叠。
- 串行对照：A end 771.259742 ms，B start 837.637439 ms，无重叠。
- 同一集成测试验证 A 写共享文件成功；B 自有文件先成功、随后共享路径冲突；父结果保留 B 已完成写入并显示冲突失败，其他角色结果不丢失。
- 错误、回退和取消使用真实发送边界事件及不同 executionId，不通过“两个任务状态都为 running”推断并行。

## 最终云端验收

- Linux、Node v24.19.0，2026-10-06 07:56:44–08:01:54 UTC：全量 7333 passed、135 skipped、0 failed、0 unhandled errors。
- 报告 SHA256：3003652bd3c22461ecaaa11de87919e700249e0c8a70783c14d4ced13a786937。测试开始/结束 tracked diff 及全部 untracked 文件摘要一致。
- npm run build、renderer 类型、设置 strict 类型、storage boundary、tooling 47 项、skills 清单 41 vendor + 4 maintained、git diff --check 均通过。构建保留既有大于 500 kB 的 bundle 提示。
- 135 个跳过按精确文件和用例名匹配源码条件归档：132 个 Windows 专用，3 个 Windows/macOS 原生目录观察。DPAPI、native helper、8.3 路径、符号链接及存储安全独立保留，跳过不计通过。
- 全量前两轮诊断报告保留：一轮 7 个旧审批 mock 参数匹配失败，另一轮 15 个 Shell 测试夹具缺 checkpoint 及其 6 个未处理错误。分别修正无 signal 时兼容调用形状、补齐测试夹具 checkpoint；生产 checkpoint 和错误边界未弱化。本次最终全量全部通过。
- 独立基础协调器、文件/Shell 生命周期、调度集成、恢复事件、UI 结果及最终整体审查均闭合已报告缺陷。嵌套故障排空同类问题跨 child、Main 和嵌套 scheduler 扩展修复时升级至 Astra xhigh，未将其他夹具失败或权限拒绝合并计次。

## Windows 交付步骤

下一阶段将已验证源码补丁接入现有 Windows 工作区，核对本地差异并保留用户文件；运行 Windows 原生专项和构建，再生成 EXE。云端 Linux 证据不替代 Windows DPAPI、helper、路径别名、符号链接或安装器实际结果。真实模型接口联调由用户执行；此记录不宣称安装、签名、发布或账号验证已完成。

## Windows 接收前测试目录修正

五个测试的固定 C: userData fixture 改为各自独占的 os.tmpdir() 子目录并在 afterAll 清理。带固定驱动写入阻断的定向审计 187/187 通过；随后全量于 2026-10-06 08:09:04–08:14:20 UTC 再次得到 7333 passed、135 skipped、0 failed、0 unhandled，tracked diff 未变。报告 SHA256：28ee5c688d35d705b87ba18aff3704b3ba85d74bdcd64b14e2bc1efb84be3e92。新增未跟踪项仅为测试生成的 agent-permission.json，单独归档，不进入交付源码。

原生 presence contract 的历史固定 E: 目录改为显式环境变量提供的现有绝对 E: 目录，并检查 canonical 目标仍在 E:，沿用 read contract 的路径约束。此为 Windows 专项 fixture 修正，不改变产品代码及各用例被测行为；实际 Rust 编译与运行由 Windows 接收步骤执行，不能计入上述 Vitest 通过数量。
