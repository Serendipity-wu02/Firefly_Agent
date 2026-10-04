# 网络模块第二阶段原生验证

2026-10-04，基线 `3b28f54eeb358de75563b6ec3ea4a9f01e72bec0`。用户授权在原隔离树补 TLS 拒绝、Session 清理、关闭撤销及 worker/iframe 验证。没有修改产品源码、共享接线、CI、系统网络、系统证书或真实用户数据。**生产 gate 继续关闭，发现尚未解决的 worker 归属缺口。**

## 已执行及明确发现

实际 Electron43.1.0 / Chromium150.0.7871.47 / Node24.18.0，专用非 persist Session、隐藏 sandbox/contextIsolation/noNode/noPreload 窗口。userData/sessionData/logs/crashDumps/TEMP 全在 `E:\Codex\2026-10-04\task-4\network-modules-native`。独立 Main 测试适配器消费已编译模块，不启动产品 Main/bridge。外部网页请求只尝试公开 `https://example.com/`，无用户数据或出站 POST。生成的自签名测试私钥仅保留隔离目录，不入 Git；未安装 CA、未调用证书放行。

| 执行 | 实际结果 | 判定 |
|---|---|---|
| `local-r1` PID24220 | exit1，worker GET fail-closed 断言失败；`xhr` / webContentsId1 / framePresent=true / allowed=true，进入一次代理拨号；TLS拒绝、HTTP0 | 有效失败证据，揭示假设错误，不是重复修复失败 |
| `local-r2` PID3876 | exit0，8条观察、errors=[]、safetyFindings=1；改探针继续收集矩阵，产品策略未变 | 完成观察，不表示安全门槛通过 |
| `public-r1` PID6592 | exit0，明确 unavailable；Chromium `ERR_TUNNEL_CONNECTION_FAILED`，代理认证有效，无证书事件 | 不能证明默认公网拨号或可信 HTTPS 页面；未重试/未放宽规则 |

本地 resolver/dialer 映射公开 pin `93.184.216.34:443` 至本机合成 HTTPS 服务，remoteAddress 测试映射仍存在，不能冒充默认 OS 数值拨号。OpenSSL3.5.7 生成 SAN example.com 自签名证书：worker GET、iframe GET 和主框架 GET 都报 `ERR_CERT_AUTHORITY_INVALID`，TLS服务端 HTTP 请求为0。证书 handler 只记录错误并 callback(false)，无 preventDefault/true/verify override；不证明过期、撤销、域名不符等每种证书错误，也未证明 mTLS。

worker POST：xhr/owner1，allowed=false，拨号计数1→1。iframe XHR POST、表单 POST、beacon POST 分别为 xhr/subFrame/ping，均拒绝，拨号1→1；数据仅为 `synthetic` 且没有出站。iframe GET 为 subFrame/owner1，被策略接受，随后由默认TLS拒绝。

**重要未解决发现：已启动 dedicated worker 的 GET 并非 unknown ownership。** Electron 给它主页面相同 ID 和 frame，现有 `BrowserRequestDetails` 无法区分页面 XHR 与该 worker fetch；策略只拒绝传入的未知/异属 ID，不能据此宣称所有 worker 默认拒绝。预启动 worker 是受控夹具步骤，现证据没有证明 production install-before-page 顺序能阻止网页创建/使用 worker。需可信 Main/Chromium worker 生命周期或保守 capability 策略及真实回归后才可解此门槛，不在此验证任务里盲改共享 owner 接线。

销毁宿主时测试适配器在 destroyed 事件同步 revoke policy / abort owner 并 await proxy.revoke，再 closeAllConnections。代理TCP端口不可连接，TLS socket为0，晚到 Session.fetch 是 unknown ID / other，被拒绝，拨号3→3。合成 cookie1→0、HTTP cache0，未启动的SW计数0。此步证明测试适配器销毁路径；不是产品 shutdown 实现证明，也不把空缓存/未启动SW当成实际清理过这些状态。

公开探测失败后的只读 OS DNS 诊断：`example.com` 返回 `198.18.1.171`/IPv4。模块明确拒绝整个198.18/15基准测试网段，故当前环境的 DNS 答案与默认公网目标策略不兼容。没有推断此IP的实际组织/出口，也没有关闭系统 DNS/代理或强行连接该地址。

## 夹具及重现

可审查快照在 [fixtures/browser-network-phase2](fixtures/browser-network-phase2/phase2.cjs)，包含脚本与完整 JSON，未包含私钥/代理凭据。脚本保留本机固定隔离路径，不是自动 CI 工具。实际执行目录为外部隔离 `network-modules-native`，必须已完成模块 build；审查快照不是 public-r1 失败原因的替代证明。

```powershell
# 仅在专用隔离目录生成测试证书，不安装信任。
& E:\Git\usr\bin\openssl.exe req -x509 -newkey rsa:2048 -nodes -keyout tls-key.pem -out tls-cert.pem -days 1 -subj /CN=example.com -addext subjectAltName=DNS:example.com
node --check phase2.cjs
& .\run-phase2.ps1 -Run local-r2
& .\run-phase2.ps1 -Run public-r1
# 已执行一次的只读诊断（非公网重试）
node -e "require('node:dns').lookup('example.com',{all:true,verbatim:true},(error,answers)=>console.log(JSON.stringify({error:error?{code:error.code}:null,answers})))"
```

本阶段没有产品修复，因此不伪造 RED→GREEN：local-r1 是 gate 假设的反例，local-r2 保留同一 finding。技术修复尝试0，同问题连续两次修复失败0，权限拒绝0。所有自有进程已确认退出；未操作真实用户进程。前阶段126单测/全量6185通过是历史基线，不称为这次原生门槛全通过。

## 剩余条件及权限

- 可信 HTTPS + 默认 OS numeric dial 在当前 DNS 环境未证实；不要允许198.18/15来冒充公网验证。需要符合策略的公开 DNS/网络环境，可交集成者在获准环境执行同一只读探针。
- localStorage/IndexedDB/CacheStorage、已启动 service/shared worker 清理尚待专用内存协议夹具验证；这种夹具不能证明真实 TLS/公网/SW启动策略。
- QUIC/WebRTC没有抓包或全进程出口证据。本任务不安装驱动、不启用管理员 pktmon、不改系统网络/安全设置；目的端本地sink计数也不能证明不存在其他出口。需已有获准捕获环境或外部受控出口观察能力。
- mTLS未尝试：需可信服务端TLS且可控客户端证书夹具；不读取/选择OS真实客户端证书，不安装CA。不能以自签名服务端先被拒绝替代mTLS不选证书验收。
- 产品 Main shutdown顺序、cleanup失败处理、未知worker拒绝与全部入口仍需集成后验收，gate继续关闭。

API依据为实际安装类型及固定版本官方 [webRequest](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-request.md)、[Session](https://github.com/electron/electron/blob/v43.1.0/docs/api/session.md)、[App](https://github.com/electron/electron/blob/v43.1.0/docs/api/app.md)。官方说明webRequest仅最后一个监听器有效，清理各API不能替代产品单一处理器及生命周期接线。using-superpowers/context-engineering/systematic-debugging/verification技能已读；当前工作树与原repo所指vendor技能目录均缺失，未宣称本阶段使用该不可用副本。
