# dedicated worker 边界：可行性证据与待决方案

> 后续方向：用户已授权优先验证专用Session及不可变policyEpoch，默认不禁Worker。当前契约见[right-agent-workspace](right-agent-workspace.md#2026-10-04-会话授权域验证契约)，原型与剩余HOLD门槛见[会话证据](../testing/browser-session-epoch.md)。本文保留历史RED和CSP可行性调查，不作为已选择的生产禁用方案。

2026-10-04，产品基线 `ff65b1152daf44011df232527ad626b3ee2844d0`。用户要求先RED与最小方案，worker禁用及兼容取舍必须交父审阅，不能将review建议当产品决定。本阶段只保留一次性验证夹具、原始证据位置和候选方案，**没有修改任何产品源码/共享接线/GUI/R1/CI，生产gate继续HOLD**。DNS Important 已由父独立复核确认 CLOSED，范围限单一Main模块实例，报告 `E:\Codex\2026-10-03\task-10\dns-worker-review-20261004\dns-worker-review.md`；worker仍OPEN。

## 更精确的原生 RED

Electron43.1.0 / Chromium150.0.7871.47 / embedded Node24.18。新专用非persist Session、隐藏sandbox/contextIsolation/noNode/noPreload窗口。严格产品request policy与代理在首个合成文档加载前安装，然后才创建blob classic worker。只有固定不可变的 `ff-network-fixture://fixture/` 文档加载是夹具例外；其他blob/data/HTTPS URL均经过未改的产品请求策略。代理pin仍由受控依赖映射到本机自签名TLS服务，证书拒绝，HTTP0；不声明真实公网或worker身份已获授权。

| 请求 | 真实属性 | 本地pin拨号 |
|---|---|---|
| 页面fetch GET | xhr / owner ID1 / frame(process4,routing1,tree1,top=true) / 同文档url与origin / referrer空；Sec-Fetch-Dest=empty，Mode=no-cors | 0→1 |
| 该文档随后创建的worker fetch GET | 上述属性完全相同，策略allowed=true | 1→2 |
| 同worker importScripts GET | script / 同owner与frame / Sec-Fetch-Dest=script，Mode=no-cors，策略allowed=true | 2→3 |

`red-r1` PID32616 exit1，旧“只有策略安装前预建worker才会漏过”假设被排除；`red-r2` PID25864 exit1，补importScripts真实入口，失败断言明确要求worker GET在拨号前拒绝。它们是有效RED，非两次失败修复。HTTP0仅因为TLS负例，不倒推请求策略安全。没有证明认证/IP绕过、出站写入或TLS成功。

因此仅加framePresent、top-frame比较、原生frame ID、referrer或Sec-Fetch-Dest不能区分此反例；禁止xhr同时破坏页面fetch，且遗漏已实测的worker script入口。页面上报worker ID、patch Worker构造器也不是可信Main边界。协议/类别检查仍必要，但不能充当worker身份。

## 候选A：新文档执行前由浏览器禁止创建worker（建议父评估）

最小安全方向是对新的专用Session在任何不可信脚本执行前安装唯一Main请求/响应处理器，保持原GET/HEAD、认证、IP固定与撤销检查；在响应中**另追加强制 CSP `worker-src 'none'`，完整保留站点所有既有CSP与Report-Only头**。不重写站点政策、不追加worker白名单、不靠resourceType猜测worker。主/子文档均须覆盖；新窗口/外部scheme继续沿既定Main导航拒绝契约，不能因这项方案额外放行。

该方案的前提是全新非persist Session及新binding、无旧worker/SW/未受保护文档、处理器先于首次导航、缓存/重定向/全部frame政策不遗漏、处理器不能被其他listener替换。CSP不终止已存在worker，不能对现有Session安装后宣称安全；违规/准备或清理失败仍拒绝load，不恢复DIRECT或复用旧上下文。纯header helper也不能代表这些Main保证已成立。

一次性 `csp-r2` PID34440 exit0，10条观察/errors=[]。真实onHeadersReceived保留原 `worker-src 'self' blob: data:`，另追加none，Chromium实际enforce：

- blob classic/module、data Worker和blob SharedWorker均未ready，产生异步error和真实 `effectiveDirective=worker-src / disposition=enforce`；并非必须同步抛SecurityError。SW register拒绝，SecurityError明确写CSP。
- srcdoc/about:blank子框架继承限制，放宽meta CSP也不能解除响应强制政策。
- 没有worker GET请求，页面GET产生的dial1后仍为1；运行SW0/shared0。页面JS设置标题成功，页面XHR仍由原策略接受并拨号，随后因自签TLS失败；不能称页面HTTPS fetch成功。

这是安全创建边界的**原生可行性证明**，不是产品修复GREEN或总网络gate验收。未测真实可信HTTPS主/跨源子文档、redirect/304缓存、data/blob子文档、旧generation及再次打开等全部路径；这些必须在实施后补验，不能用此fixture替代。最终夹具snapshot复验 `csp-r3` PID13748 exit0，10条观察/errors=[]，dial仍1→1，运行SW0/shared0；原始launcher/JSON已归档。

## 兼容性取舍必须明确接受

禁用范围涵盖Web Worker、SharedWorker、ServiceWorker，也阻止worker内的importScripts/nested worker通过“已有worker”继续运行，因为起始worker不应存在。页面常规JS/DOM不因此被关闭，页面GET/HEAD fetch/XHR保持既有策略；POST等原有拒绝不变。

依赖worker的网页功能将报error/registration rejection。网站有自己的回退代码时才可能继续；没有回退则功能失效。后台计算、某些PDF/编解码/大型搜索、共享后台状态等可能失效或退到主线程而卡顿；这些是按依赖的影响推断，并非已测过具体网站。SW离线缓存、push/后台同步能力不能使用。不能承诺“只禁worker、不影响网页”。本轮未在真实网站作兼容测量，公开HTTPS仍受198.18 DNS环境限制。

父需决定是否接受这一“保留页面JS、禁止所有worker创建”的浏览模式。未接受前不添加产品helper、不改变既定浏览能力，也不批准真实入口。

## 候选B及拒绝边界

如产品必须支持worker，需另冻结可信Main target生命周期与能力契约：首次脚本前控制worker target、私有绑定owner/generation，在其请求发出前按真实target校验，unknown/detach/旧generation等撤销。Electron43 debugger有target sessionId传输，但现有webRequest ID/frame不能可靠join到worker；普通Network通知或收到请求后再封堵不提供零迟到证明。CDP自动附加/暂停及Fetch拦截是可研究路线，**未在本机验证完整递归worker生命周期或无race保证**，属于更大设计，不在本阶段实施。DevTools打开会detach，必须考虑拒绝与生命周期冲突，不能向renderer公开调试能力。

若候选A任一文档路径不能证实，仍HOLD；可另提交关闭页面JS的静态阅读模式，但其交互/兼容代价更大，也需父决策。无论哪一路都不替代QUIC/WebRTC出口证据。没有绕198.18 DNS、安装抓包驱动、修改系统网络/证书或尝试mTLS真实证书。

## 恢复与可审查材料

一次性夹具快照：[worker-boundary.cjs](../testing/fixtures/browser-worker-boundary/worker-boundary.cjs)及launcher；[manifest](../testing/fixtures/browser-worker-boundary/manifest.json)记录证据SHA256及实际退出码，五次JSON和launcher也已归档。sha256绑定外部原始字节，archivedSha256绑定Git内LF行尾副本，JSON内容未改；fixture目录属性保持归档字节不受checkout转换。外部完整证据保留于 `E:\Codex\2026-10-04\task-4\network-modules-native`，含对应stdout/stderr，原始失败未覆盖。最终脚本快照对应red-r2/csp-r3；其他历史运行的脚本版本未保存，不能以最终脚本哈希冒充其运行输入。复跑需要工作树现有dist、Electron及外部本机测试TLS材料；这不是独立可搬运的测试包。测试私钥不入Git，代理凭据未记录。

`csp-r1` 首次探针断言误假设constructor同步throw，实际是异步error；纠正一次，随后csp-r2通过，强制要求每种创建失败都有真实CSP violation，而非把任何error算作保护。产品修复尝试0，测试断言纠正1次，同问题连续两次技术修复失败0，无权限拒绝或模型补救。此处“GREEN”只限候选原型可行性。历史131/6190测试与build不是本阶段重跑结果；产品源未变，本阶段验证为原生探针、脚本语法与Git检查。

来源：[Electron43 webRequest](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-request.md)（响应头可修改、最后listener独占）、[W3C worker-src](https://w3c.github.io/webappsec-csp/#directive-worker-src)及[多政策](https://w3c.github.io/webappsec-csp/#multiple-policies)（Worker/SharedWorker/SW加载限制、强制策略共同约束）、[Electron43 Debugger](https://github.com/electron/electron/blob/v43.1.0/docs/api/debugger.md)（sessionId接口、detach）。当次读取的CDP tot页面只显示重定向，未获取其方法正文，不将该页面称为已核验的Chromium150实现依据。按using-superpowers/brainstorming可行性路径、context-engineering、source-driven及verification记录，未把Spike当已批准产品设计。
