# Windows N3 / N10 有限原生验收

基线 `c98cceb54402481f70840371a8cc8d2ca141b460`；独立分支
`audit/browser-native-gaps-20261005`。仅自有 E smoke profile、非持久 Session、
隐藏且不可聚焦宿主和自有 loopback fixture。生产 gate 关闭；没有改原工作区、
shared/renderer/CI/R1、系统网络、证书信任或真实 userData，也没有外部服务调用。
本文是新矩阵，不能重复计入旧 r8 的 17 项。

原生版本为 Electron 43.1.0 / Chromium 150.0.7871.47 / Node 24.18.0。
E1 表示依赖注入、屏障或合成挑战；E2 表示真实 native/socket/自有 fixture；
E3 才表示正常可信 TLS 加受控目标日志。本次没有 E3 新证据。

## N3：真实鉴权、会话归属和站点挑战

最终 `n3-r4`：PID 3456，native exit0，12 个记录项，errors 空，最终清理成功。
两条 CONNECT binding 的真实 TCP sink 总命中为 8；负例逐次比较同一 counter
的增量，不能把正对照命中也称为零。

| 实际记录 | 证据 / 结果 |
|---|---|
| 两个已注册 native binding | E2，正确凭据经真实代理到达自有 TCP sink |
| 相同 foreign loadURL 探针合法 A token 正对照 | E2，sink 增量2、A resolve/connect 各增量2；fixture Main 显式注入凭据 |
| 未注册 Session 无凭据 | E2，真实 proxy challenge，产品不授予；resolve/connect/sink 增量0 |
| foreign native Session 错误 token | E2，fixture 回调注入错值，真实代理拒绝；三个 counter 增量0 |
| A token 用于 B endpoint | E2，三个 counter 增量0；A token 当时仍有效，是跨 endpoint 隔离，不是活跃 endpoint token 轮换 |
| 已注册 B Session 指向 A proxy | E2，真实 challenge 为 registered/proxy/granted=false，三个 counter 增量0 |
| 相同 B native loadURL 经自己的 proxy 正对照 | E2，相同 sink 增量2 |
| 相同站点 login 探针合法合成身份正对照 | E2，真实401/200、两次请求、authorized counter为1 |
| 已注册 B native 站点 login | E2，真实 app login：proxy=false、registered=true、granted=false；请求增量1、authorized增量0；最终401响应可加载，不把 fulfilled 当认证成功 |
| site / realm / scheme / host 不匹配 | E1，真实 native identity 上4个合成字段挑战均拒绝 |
| A退役 endpoint 配旧 A token | E2，ERR_PROXY_CONNECTION_FAILED；三个 counter增量0，没有新挑战 |
| A退役 native identity | 已销毁，产品 credentialsFor 返回null |

替身必须与结果一起阅读：CONNECT fixture 只在该 QA 进程替换公网分类函数，使
自己的127.0.0.1可用，并将目标443路由到自有临时 TCP sink端口。数值 socket
和实际 remote peer 保留；sink主动结束连接，Chromium TLS不能成功。
站点401 fixture额外只允许精确 native ID/URL/GET，通过固定 fixture HTTP代理；
没有DIRECT回退。替身不在产品源码或IPC中，不认证公网分类、TLS或全协议出口。
所有随机代理凭据只在Main内存；原始JSON只保存布尔授予判定，不保存值。

N3可关闭的有限条款：native 未注册/跨Session/跨endpoint/错误凭据/退役endpoint
的拒绝，以及本机native站点挑战不获代理凭据。仍缺E3可信HTTPS站点挑战、
worker认证缓存/挑战归属的完整组合；不宣称整个N3或生产gate闭合。

## N10：实际清理、拒绝、超时与quit重入

五组新进程，每组两个实际非持久 Session、各种入一个合成cookie；请求仅到
`.invalid`，代理resolver空答案，实际上游dial不发生。五步清理均沿实际
createElectronBrowserSessionPort；故障仅在夹具适配器返回Promise.reject或
永不完成Promise，不覆盖原生Session方法。

| 最终run / PID | 浏览器清理与cookie读回 | coordinator与native结果 |
|---|---|---|
| n10-control-r2 / 31452 | 成功；A0/B0 | 无故障日志，7阶段完成，exit0 |
| n10-browser-reject-r1 / 5004 | cleanup_failed；A1/B0 | 首域异步拒绝，仍调用全部10项并完成后续阶段；故障日志1，exit0 |
| n10-browser-timeout-r1 / 30916 | cleanup_failed；A1/B0 | 浏览器350ms预算，挂起操作不被伪报成功；其余操作及后阶段继续，故障日志1，exit0 |
| n10-phase-reject-r1 / 28332 | 成功；A0/B0 | 7阶段各注入一次拒绝，7条精确日志；阶段继续、最终动作执行，exit0 |
| n10-phase-timeout-r1 / 29160 | 成功；A0/B0 | browser完成后stopExternalProviders挂起；700ms总超时、abort、pending ID留证，后两阶段不执行，exit0 |

各组4个汇总记录，errors空。事件序号证明browser先revoke并请求destroy，再
调用全部10项原生清理；最终guest确实destroyed。重复app.quit产生3个
before-quit、一次相同shutdown Promise重入、一次final-action、一次will-quit和
一次quit。日志和cleanupResult独立保存：coordinator完成或native exit0不等于
浏览器清理成功。第一域失败时第二域cookie真实为0。

准确限制：native close异步，开始清理API时isDestroyed可能仍为false；
最终destroyed确认不能认证N9 late-writer先后关系。仅一个native清理操作的
reject/noncompletion、七阶段普通拒绝、一个后段总deadline窗口；并未穷尽
每个原生清理API/每阶段timeout。未做Windows关机/注销/重启或其他平台。
历史汇总标题first-final-action-only只验证动作调用一次，两次请求传同一个函数；
未认证“首个与第二个不同动作时选择首个”的原生身份判定（独立审查Minor）。

## 发现与最小产品修复

首个N10正对照同时暴露native宿主销毁后的真实失效监听异常：
browser-host-owner的通知读取options.host.webContents.id，而Electron销毁后该
属性可抛Object has been destroyed，导致该通知未中止owner signal。
修复只保存注册时的精确WebContents ID供affected ID匹配，其余owner/权限检查保持。
直接回归先RED（owner.signal实际false，1failed/2passed），修复后GREEN3/3。
修复后的native矩阵没有再出现该失效监听异常。

没有据fixture的同步destroy断言失败擅改产品清理时序；异步close事实保留为N9限制。
没有证明权限可被利用，也不把未验证的安全不变量写成已发现漏洞。

## 保留失败与审查

- n3-r1：defaultSession的fixture过滤误拦host data:页面，exit1，保留JSON和stderr。
- n3-r2：较小矩阵exit0/9记录，缺真实site-login；旧record持有可变对象引用，
  不作为最终计数；最终版本改为记录时快照。
- n3-r3：执行至最终退役endpoint，但fixture自身关闭挂起，launcher超时；
  无最终JSON，native exit未知。先核验命令行/run/PID，仅回收自有PID29584。
  最终fixture先落盘、清理有预算，并回收自己的HTTP/TCP残留socket；不将
  fixture自关当作产品tunnel撤销证明。
- n10-control-r1：将destroy request误断言为同步destroyed，exit1；另有上述
  宿主销毁异常。保留原始失败，不用后续结果覆盖。
- fresh-context只读Astra审查：无Critical/Important；一个N10标题Minor，
  上文收窄解释。审查者未独立重跑native，不作为外部Codex内置审查。

## 本次验证与复现

Browser直接回归14文件/288 passed/exit0；宿主销毁RED/GREEN见归档。
Main noEmit、全部browser测试严格类型、Main隔离emit均exit0。
本次全量646文件：645通过/1失败；6513 passed /14 failed /2 skipped，exit1。
14个失败都在既有`src/main/memory-sources/native-history-presence-process.test.ts`，
beforeEach要求TEMP精确等于另一任务的H夹具目录，而本次TEMP为自有task-4/tmp；
afterEach随后因root未初始化而报错。没有修改该测试、借用未授权目录或豁免门禁。
集成基线的6526/2skip是集成者使用H精确环境的旧验证，不能写成本次全量GREEN。
本次完整`npm run build` exit0，包括存储边界检查、Main/preload/CLI/renderer；
保留既有大chunk提示，没有调整阈值。只清理/构建已验证非reparse的自有worktree/dist，
没有清理或构建生产dist。
本机vendor技能目录在原工作区及worktree都不存在；使用实际可读的cloud
systematic-debugging/TDD/review/verification技能及本机security-and-hardening，
不宣称使用缺失的vendor技能。

在该隔离工作树先执行 `node node_modules/typescript/bin/tsc -p tsconfig.main.json`。
以下已存在launcher拒绝复用profile；更换run标识创建全新自有路径：

```powershell
& .\docs\testing\fixtures\browser-native-gaps\run.ps1 -Matrix n3 -Run n3-new
& .\docs\testing\fixtures\browser-native-gaps\run.ps1 -Matrix n10 -Run n10-new -Mode none
# Mode也可为browser-reject / browser-timeout / phase-reject / phase-timeout。
```

默认QaRoot/QaBuilt为本任务E路径；换工作树时只传自己的QaBuilt/QaRoot。
不要对生产dist/userData运行。原始失败/最终JSON、launcher和脚本/日志的哈希见
[fixtures/browser-native-gaps/manifest.json](fixtures/browser-native-gaps/manifest.json)。
N7/N9待新测试能力和用户取舍，本次没有改变门槛、禁用SW或扩大验收矩阵。
