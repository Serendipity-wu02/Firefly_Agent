# DNS 实际解析预算修复

2026-10-04，独立隔离树 `E:\Codex\2026-10-04\task-4\audit-r3-r4`。源审查范围 `ed144ee..3b28f54`，报告 `E:\Codex\2026-10-03\task-10\network-h-review-20261004\network-review.md` 指出 Important：取消等待、10秒超时或 revoke 后，OS lookup未结束而32个准备槽已经释放，重复认证CONNECT可能无界累积解析。用户直接授权优先TDD修复及独立复核；只修改既有代理模块和相关测试/证据，生产gate仍HOLD。

## 生命周期与责任

- 原有32个每 binding 准备槽保持；新增该 Main 模块实例的32个真实未完成DNS预算，所有 factory/binding 共用，不创建等待队列。认证与authority检查仍先于解析。
- 在调用 resolver 前同步占用一个额度。同步 throw、解析 Promise 实际 fulfilled/rejected才释放一次；等待者 abort、TCP关闭、10秒deadline、revoke、factory重开都不释放它。达到32时认证CONNECT返回503，不调用resolver或dialer。数值literal无DNS，不占DNS额度，仍受原有准备/连接上限、IP检查和取消条件约束。
- `revoke()` 同步失效 credentials、停止新能力、abort等待者并拆除socket，Promise只保证listener/socket撤销完成。**成功不等于OS DNS停止或DNS预算归零。** Node lookup没有此实现可用的AbortSignal；没有用Resolver.cancel冒充lookup取消。
- 被撤销解析继续由模块级预算记账；真实完成后只归还额度，原请求active/signal/client检查保持无迟到dial。进程终止由OS回收实际资源。永不settle最多占32个额度，后续DNS请求保持503直到解析结束或进程退出；不会为了恢复可用性丢弃计数。此可用性代价是保守限制，不证明DNS工作可真正取消。多个进程/模块副本各有自己的预算，未来Main adapter须保证单一Main实例，不能将工厂开放给renderer。

## 实际 TCP RED / GREEN

日志全在 `E:\Codex\2026-10-04\task-4`，非公网测试。已有真实127.0.0.1代理/echo夹具，resolver是受控未settle Promise；记录的是实际未结束调用数，不mock代理server/请求事件。

| 执行 | 结果 |
|---|---|
| `browser-dns-budget-red.log` | 37测试，2 fail /35 pass；跨binding及真实10秒deadline未回503。100次普通destroy用例意外通过：HTTP CONNECT peer FIN未必触发服务端close，不能冒充取消复现。 |
| `browser-dns-budget-red-rst.log` | 调整测试网络终止为真实resetAndDestroy后，3 fail /34 pass；100次取消actual unresolved=100，重建/超时均漏过真实预算。产品尚未修改。 |
| `browser-dns-budget-green.log` | 修复一次后全部三个模块131/131，exit0，20.92s。 |
| `browser-dns-budget-test-types.log` | 六源码/测试文件严格types，exit0。 |
| `browser-dns-budget-build.log` | 完整npm run build，exit0；保留既有chunk>500kB提示。 |

回归结果：100个认证CONNECT真实RST取消，32个未完成解析、68个503、峰值32、origin0/dial0；revoke后仍pending32直到手动settle，之后pending0且late dial0。旧binding占满后revoke/重建，下一请求503；其中一个旧解析reject后，新请求能200并到达一次真实echo，其余旧解析settle没有旧dial。31个RST取消加1个实际10秒超时仍占32，下一请求503。同步throw和Promise reject各40次403，之后正常binding200，证明失败没有泄漏额度。

技术修复失败0（一次实现GREEN），测试夹具普通FIN→RST纠正1次并得到预期RED；同问题连续两次修复失败0。未发生权限拒绝或模型补救。回归可控resolver证明记账边界；不证明真实OS DNS可取消、真实公网numeric dial、worker隔离或生产shutdown。不得据此打开gate。

## 审查与最终验证

独立 fresh reviewer 只读复核 `85ff37f5207156f5b638dc4e8e2057460450b5fa` 上两文件工作diff（100+/1-），未发现Critical/Important；独立重跑三文件131/131，20.99s，diff-check exit0。逐条检查同步admission、settlement finally、取消后拒绝消费、满额503、跨binding计数和无晚到dial。唯一Minor：接口注释process-wide比实际模块实例级范围更宽，已统一为this Main module's budget；行为未变。reviewer未独立跑全量/types/build，不能混算其验证。

`browser-dns-budget-renderer-types.log` 与 `browser-dns-budget-schema.log` 均exit0。完整原runner `& .\scripts\ci\run-vitest.ps1`（无TestFiles筛选/排除；E盘TEMP/TMP/RUNNER_TEMP、实际 `FIREFLY_TEST_BASH=E:\Git\bin\bash.exe`、正式native权限）exit0：618 files、6190 pass /0 fail /2 skip，共6192，383.38s，见 `browser-dns-budget-full-tests.log`；两个既有skip仍为真实Windows8.3别名不可用与file-symlink权限1314，未代替native行为/修改门禁。types/build/renderer/schema均为本次结果。runner使snapshot只有LF/CRLF表示变化，git内容diff/numstat为空；确认后只恢复该一个生成snapshot文件。

DNS修复build后原生 `local-r3` PID6600 exit0，8条观察、errors=[]，保留dedicated worker GET门槛finding1；证书拒绝、POST拒绝和关闭撤销行为不回归。Session内存协议 `memory-r1` PID33532 exit0，12条观察、errors=[]；详见[第二阶段补证](browser-network-phase2.md)。所有自有native进程已确认退出；未推送/合并/PR/部署、未操作GUI候选/R1或真实用户数据。

官方来源：[Node24.19 DNS lookup](https://nodejs.org/download/release/v24.19.0/docs/api/dns.html#dnspromiseslookuphostname-options)，lookup使用OS解析；Resolver.cancel针对另一Resolver API。Electron本机嵌入Node24.18，当前实际TCP/timeout在外部Node24.19 runner测得，不冒称已跑相同原生Electron DNS时间界限。
