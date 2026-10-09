# Bash 集成测试超时（2026-09-26）

> **日期**：2026-09-26
> **状态**：历史技术记录。下文描述记录时的实现、设计与验证结论，不代表当前版本复测。
> **范围**：Bash 选择、探测时序、测试夹具与定向验证。当前维护入口见[文档导航](../../README.md)。

## 失败证据与边界

- CI [Test 36165783236](https://github.com/Serendipity-wu02/Firefly_Agent/actions/runs/36165783236) 唯一失败为 `run_shell shell selection > executes bash syntax with Bash instead of silently passing it to cmd.exe`，Vitest 在 5002 ms 报告默认 5000 ms 用例超时。
- 用例请求 `run_shell` 使用 Bash 执行 `printf 'firefly-bash-ok'`。实际执行前，`shell-runtime.ts` 顺序探测存在的 Bash，每个探测最多 3000 ms；整个解析过程没有 5000 ms 总时限契约。
- 进程证据表明：首个 Bash 探测达到 3000 ms 上限后被请求 `SIGKILL`，随后启动第二个探测；用例在 Bash 解析阶段触发 5000 ms 总预算。没有证据表明 `printf` 已开始，不能归因为命令执行超时或 worker 原生崩溃。
- 当时记录仅有 `bash.exe` 基名，不能恢复完整执行路径，不能断言是 WSL、PATH 错误或确定第一项探测变慢的系统原因。此次修正针对集成测试未限定外部 Bash 夹具，却要求探测与执行合计五秒内结束的时序依赖。
- 原完整日志与进程证据按 CI 运行号 36165783236 保存在仓库外诊断归档。该次 505 个真实 worker 均正常停止，无异常退出或 worker error；此前 Windows 文件监视短路径修复的回归通过。

## 修正

- 工作流用 GitHub Windows `shell: bash` 实际启动的 `$BASH`，经 `cygpath -w` 设置测试专用 `FIREFLY_TEST_BASH`。依据为 [GitHub 工作流 shell 说明](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。没有猜测安装目录。
- 集成测试要求该路径为实际存在的绝对 `bash.exe` 路径，仅在此用例中将其目录加入 PATH 首位，结束后恢复环境。继续走真实解析、探测和命令执行，验证所选完整路径、退出码、输出与非超时状态，并传递 Vitest 的取消信号。没有增大五秒用例时限，没有删除或跳过测试。
- 新增 `shell-runtime.test.ts`，用进程事件和虚拟时间覆盖成功 close、探测超时后回退、总探测超过五秒、失败与不存在的可执行文件，并验证计时器清理。生产解析逻辑与应用 Bash 选择行为不变。
- 子进程诊断对 Bash 记录完整 executable、probe/command 阶段及 close 事件；不输出命令正文或环境变量。既有 runner 的失败退出码和失败时上传逻辑不变。

## 定向验证

- 四个相关测试文件共 18 项通过，无跳过：真实 Bash 集成、解析探测、工具超时与取消/清理边界。
- 本地真实夹具由 Git Bash 的 `$BASH` 提供，并通过 `cygpath -w` 转为绝对路径；源码未硬编码安装位置。probe 与 command 两阶段均实际 exit/close 0、signal null；集成测试耗时 154 ms。
- `npx tsc -p tsconfig.main.json --noEmit`、诊断脚本 Node 语法检查、Git 差异空白检查通过。
- 本地记录保存在仓库外 Bash 定向诊断归档。该记录仅证明上述定向验证结果，不能替代后续完整 CI 运行。
