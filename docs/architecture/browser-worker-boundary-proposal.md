# Worker 请求身份与创建边界可行性分析

- **证据日期**：2026-10-04
- **状态**：历史安全反例与 CSP 可行性研究；未选为生产禁用方案
- **后续方向**：独立 Session 与不可变 policyEpoch，默认不禁用 worker，见[会话授权域契约](right-agent-workspace.md#2026-10-04-会话授权域验证契约)
- **范围**：区分请求字段的证明能力、候选创建边界及兼容代价

## 1. 背景与历史结论

Electron webRequest 暴露的 WebContentsId、frame 和 resourceType 不能可靠区分所有页面请求与 worker 请求。本阶段通过隔离原生实验验证了这一局限，并调查 CSP 禁止 worker 创建的可行性，没有修改产品源码、共享接线、GUI、目录边界或 CI。

同期 DNS 并发预算审查的 Important 项已关闭，证明范围仅限单一 Main 模块实例；worker 边界不能据此关闭。该阶段生产网络 gate 保持 HOLD。后续 Session/epoch 与网络验收见[会话证据](../testing/browser-session-epoch.md)，本文不描述当前全部产品授权状态。

## 2. 原生请求身份反例

实验环境为 Electron 43.1.0、Chromium 150.0.7871.47、embedded Node 24.18。全新非 persist Session 和隐藏窗口固定 sandbox/contextIsolation、无 Node/preload，产品 request policy 与代理先于首个合成文档安装。

只有固定不可变的 `ff-network-fixture://fixture/` 文档是 fixture 例外，其他 blob/data/HTTPS 请求继续经过原策略。受控 dialer 将数值参数映射到本机自签 TLS 服务，Chromium 拒绝证书，目标 HTTP 命中为 0；这不是公网或 worker TLS 正向授权证据。

| 请求 | 实际可观察属性 | 数值 pin 拨号 |
| --- | --- | --- |
| 页面 fetch GET | xhr；页面 owner ID 与 top frame；同文档 URL/origin；referrer 空；`Sec-Fetch-Dest=empty`、`Mode=no-cors` | 0 → 1 |
| 随后创建的 worker fetch GET | 与页面 fetch 的上述身份字段相同，策略 allowed=true | 1 → 2 |
| 同 worker importScripts GET | script；同 owner/frame；`Sec-Fetch-Dest=script`、`Mode=no-cors`，策略 allowed=true | 2 → 3 |

反例发生在策略安装后创建的 worker，排除了“只有预建 worker 才遗漏”的解释。其失败断言要求 worker GET 在拨号前被拒绝，未证明认证绕过、IP 绕过、TLS 成功或出站写入。目标 HTTP 为 0 仅来自 TLS 负例，不能倒推请求策略安全。

仅增加 framePresent、top-frame 比较、原生 frame ID、referrer 或 Sec-Fetch-Dest 不能区分该反例。禁止 xhr 会同时破坏页面 fetch，并遗漏 script 类型的 importScripts。页面上报 worker ID 或改写 Worker 构造器也不能成为 Main 可信身份来源。

## 3. 候选 A 的创建边界与可行性

候选 A 在任何不可信脚本执行前，为全新专用 Session 的主/子文档响应另追加强制 CSP `worker-src 'none'`，完整保留站点既有 CSP 和 Report-Only 头。GET/HEAD、认证、IP 固定和撤销策略不变，不靠 resourceType 猜测 worker。

前置条件是新 Session、新 binding、无旧 worker/SW/未受保护文档，唯一 handler 先于首次导航，并覆盖缓存、重定向及全部 frame。CSP 不终止已存在 worker；不能在旧 Session 上后补 header 就声称安全。处理器不能被其他 listener 替换，准备或清理失败不得恢复 DIRECT 或复用旧上下文。

最终原型复验共 10 条观察，`errors=[]`、exit 0：

- 保留原 `worker-src 'self' blob: data:` 并追加 `none` 后，blob classic/module、data Worker、blob SharedWorker 均未 ready，产生异步 error 与真实 `effectiveDirective=worker-src / disposition=enforce`。
- SW register 以明确 CSP SecurityError 拒绝；srcdoc/about:blank 子框架继承限制，放宽 meta CSP 不能解除响应强制政策。
- worker GET 未出现，页面 GET 引起的 dial 计数保持 1；running SW/shared 均为 0。
- 页面 JS 可设置标题，页面 XHR 被原策略接受并拨号，随后因自签 TLS 失败；不宣称页面 HTTPS fetch 成功。

原型曾将 constructor 同步 throw 作为错误断言，后改为要求真实 CSP violation 与异步失败。保留这一语义限制即可理解验证结果；普通 error 不能算作保护成立。

该结果仅证明原生创建边界的可行性，不是产品修复 GREEN 或 N1–N10 总验收。未覆盖可信 HTTPS 主/跨源子文档、redirect/304 缓存、data/blob 子文档、旧 generation 和重开等完整路径。

## 4. 兼容性与未选择原因

禁止 worker 会同时限制 Web Worker、SharedWorker、ServiceWorker 及其后续 importScripts/nested worker。页面普通 JS/DOM 不因此关闭，GET/HEAD fetch/XHR 沿原策略，POST 拒绝不变。

依赖 worker 的页面功能可能失败或回退主线程；后台计算、部分 PDF/编解码/搜索、共享后台状态、SW 离线缓存、push 和后台同步都可能受影响。这些是依赖关系推断，没有真实站点兼容测量，不能承诺“只禁 worker 而不影响网页”。后续选择 Session/epoch 继承路线，未将候选 A 作为默认产品行为。

## 5. 候选 B 与后续变更门槛

若使用更细的 target 控制，需要在首次脚本前建立 Main target 生命周期与私有 owner/generation，确保请求前校验，并在 unknown/detach/旧 generation 时撤销。Electron 43 debugger 有 target sessionId 传输，但 webRequest ID/frame 无法可靠关联全部 worker；普通 Network 通知或请求后封堵没有零迟到保证。

CDP 自动附加/暂停及 Fetch 拦截属于待研究方向，未验证完整递归 worker 生命周期或无 race；DevTools detach 冲突也必须处理，不能向 renderer 公开调试能力。静态无 JS 阅读模式另有兼容代价，不能作为未经决策的自动回退。任何候选均不能替代 QUIC/WebRTC 出口证据。

## 6. 证据与复现边界

[worker-boundary.cjs](../testing/fixtures/browser-worker-boundary/worker-boundary.cjs)及 launcher 为最终一次性 fixture 快照；[manifest](../testing/fixtures/browser-worker-boundary/manifest.json)保留证据 SHA256 和实际退出码。`sha256` 绑定外部原始字节，`archivedSha256` 绑定仓库内 LF 行尾副本，JSON 内容未改。

最终脚本不能代表未保存的早期运行输入。复现依赖现有 dist、Electron 和本机测试 TLS 材料，不是独立可搬运包；测试私钥与代理凭据不入文档或 Git。历史 131/6190 测试与 build 不属于该原型阶段重跑结果。

参考：[Electron 43 webRequest](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-request.md)、[W3C worker-src](https://w3c.github.io/webappsec-csp/#directive-worker-src)、[多 CSP 策略](https://w3c.github.io/webappsec-csp/#multiple-policies)、[Electron 43 Debugger](https://github.com/electron/electron/blob/v43.1.0/docs/api/debugger.md)。当时读取的 CDP tot 页面仅返回重定向，不能作为已核验 Chromium 150 实现依据。
