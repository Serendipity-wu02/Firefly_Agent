# Windows Vitest worker 退出：证据与修正

## 已确认原因

基线 `d1eb82236df0d65c051e3ecec0e1ba7441f1fc51` 的失败日志并非只有汇总错误。
运行 36163264503 完整日志第 8547 行包含：

```text
Assertion failed: !_wcsnicmp(filename, dir, dirlen), file src\win\fs-event.c, line 72
```

首次运行 36154013900 和 main 运行 36159008085 也包含相同断言。
此前未从完整 stderr 提取该行，因此“仅有 worker 异常、原因未确定”的诊断现已被直接证据补充。

`GitWorkspaceWatcher` 把调用方目录直接传入 Windows 原生递归 `fs.watch`。
当目录含 8.3 短路径时，libuv 将收到的文件名展开为长路径，再与仍含短路径的监视根目录比较，触发原生断言并退出进程。
对应算法见 [Node v24.20.0 中的 libuv fs-event.c](https://github.com/nodejs/node/blob/v24.20.0/deps/uv/src/win/fs-event.c)：`GetLongPathNameW` 后调用 `uv__relative_path`。

这不是从最后打印的测试名推断：本地在 Windows 实际创建长名称临时目录，使用系统返回的 ShortPath 作为 TEMP/TMP，仅运行 `git-workspace-watcher.test.ts`，重现同一断言。

## 直接退出记录

本地复现环境 Node v24.19.0、libuv 1.52.1、Vitest 4.1.11：

- Vitest runner PID 25624，真正 fork worker PID 29516。
- worker 已收到该测试文件的 run 请求，收集 8 个用例，前 5 个完成。
- 第一个原生监视用例状态为 `run`，后两个为 `queued`。
- worker stderr 包含上述 libuv 断言。
- `disconnect` 后 `exit`：code `3221226505`（`0xC0000409`），signal `null`，未请求正常 stop。
- worker 内没有 JS `process.exit` / `abort` / `kill` 请求记录；Node fatal-report 已启用，但此次原生断言没有生成 Node JSON 报告，不能承诺所有原生终止都有报告。
- 测试 runner 返回 1，诊断脚本仍返回 1。

本地完整记录位于仓库外 `E:\Codex\Firefly-vitest-investigation-20260926\short-path-before\firefly-vitest-diagnostics`。
其中 `workers.jsonl` 关联 PID、请求、用例和退出；`worker-29516.stderr.log` 保存该 worker 的断言。

## 成功与失败运行对照

| 项目 | main 36163264503 失败 | dev 36161059602 成功 |
| --- | --- | --- |
| 提交 | d1eb822 | d1eb822 |
| runner 镜像 | windows-2025-vs2026 / 20260907.229.1 | windows-2025-vs2026 / 20260922.246.2 |
| Node | 24.20.0 | 24.21.0 |
| npm | 11.19.0 | 11.19.0 |
| 安装 | npm ci --foreground-scripts | 相同 |
| 测试 | run-vitest.ps1；vitest run --reporter=verbose --logHeapUsage | 相同 |
| 工作目录 | D:/a/Firefly_Agent/Firefly_Agent | 相同 |
| Vitest | 4.1.11 | 4.1.11 |

两次锁文件相同，解析为 Vitest/@vitest/runner 4.1.11、Vite 7.3.6、chokidar 4.0.3。
workflow 没有针对 main 的测试差异，也未配置依赖缓存恢复；setup-node 日志中的 cache 是预装 Node 工具缓存。
Vitest watch/cache 均关闭，pool forks、max/minWorkers 1、fileParallelism false。
环境存在小版本和镜像差异，但本修正不依赖将原因归为分支或升级 Node。

## 修改

1. Windows `fs.watch` 入口使用 `fs.realpathSync.native` 获取真实长路径；回调仍使用原始工作区路径拼接相对文件名，以保持现有忽略谓词和工作区身份。
2. 新增真实 8.3 路径回归，覆盖工作区、外部 Git 元数据目录、忽略项和关闭后的无通知状态。仅非 Windows 或卷不提供短路径时说明原因跳过；本机该项实际执行通过。
3. 用 Vitest 实际导出的 `ForksPoolWorker` 观察 start/send/stop，并监听其 ChildProcess 的 exit/close/disconnect/error。精确匹配 4.1.11 的已读取契约，版本变化须复核，未替换 pool。
4. 按 worker 独立保存 stderr；记录 run 文件、收集的用例及最后收到的状态。IPC 更新有批次发送，记录代表最后收到的状态，不承诺覆盖崩溃前尚未发送的每条更新。
5. worker preload 记录 PID/父 PID、JS 退出/终止请求，以及该进程创建和终止的子进程。它不轮询猜测 worker，不将普通子进程归类为 worker；不承诺覆盖未加载 preload 的任意外部孙进程。
6. 启用 Node fatal report 并排除环境变量及网络接口；不记录完整 IPC 配置、模型内容或凭据。CI `always()` 上传整个取证目录，测试退出码保持原值。

原先每秒枚举直接子进程的 WMI 轮询会漏掉短命 worker，并将正常停止的 code 1 与异常混在一起。本次以真正的 worker 对象替代该轮询，正常 stop 与意外退出分别记录。

## 本地验证

- 修改前：定向原生短路径复现，5/8 完成，worker 原生断言退出，runner code 1。
- 修改后：同一短路径环境，9/9 通过，无跳过；记录在仓库外 `short-path-after`。
- 最终诊断脚本：监视器和真实 shell 超时测试共 2 文件、16 项通过；记录在仓库外 `final-targeted`。后者同时确认子进程终止仍正常、未被诊断抑制。
- Main TypeScript `--noEmit` 通过；两个诊断脚本 Node 语法检查通过。

后续 CI 依据自动运行结果记录。诊断自身不是修复；实际修正是 Windows 原生监视根路径规范化，已有修改前失败和修改后通过的定向证据。
