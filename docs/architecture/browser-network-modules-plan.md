# 独立匿名浏览器网络模块实施计划

> 当前用户已直接授权本主线测试驱动实现独立安全模块，优先鉴权/IP固定/请求覆盖/撤销；无需空等父。按 executing-plans/TDD 顺序本人实施，末尾独立审查。共享 bootstrap/IPC/bridge、真实 BrowserService 及生产 gate 放行仍不在此授权内。仅本地提交。

基线 `ed144ee99cff80dfadb1bc2b591aa690440160b9`，既有隔离树/分支复用。规格：[网络门槛 N1–N10](../security/browser-public-page-gate.md)。Node实际24.19.0、Electron43.1.0，无新增依赖/门禁。

信任边界：远端网页/本机代理请求不可信；唯一可创建模块及提供 resolver/dialer 的是未来 Main 私有适配器。模块不认证真实宿主/frame/owner，不能被 renderer 或模型参数直接创建。随机临时代理凭据仅 Main 内存持有，不记录或持久化。socket 必须数值IP固定；所有DNS答案保守拒绝非全球单播，混合/未知/失败拒绝。异步撤销不得建立或发布隧道，已建立隧道立即 destroy。代理不解密TLS，不能单独证明GET/HEAD；HTTP方法/资源归属由独立Chromium策略消费未来可信Main事件。

## 文件与可验证任务

1. 新建 `src/main/browser/public-network-target.ts/.test.ts`：`isPublicNetworkAddress(address)` 与 `parseConnectAuthority(authority)`；Node BlockList保守特殊网段规则，IPv4/IPv6/映射/zone/非法authority/443限制的RED→GREEN。拒绝范围有意覆盖部分全球可达特殊用途地址，不能保证所有网站可用。
2. 新建 `src/main/browser/browser-request-policy.ts/.test.ts`：`createBrowserRequestPolicy(webContentsId, signal)` 返回 `allows(details)/revoke()`；严格HTTPS GET/HEAD、资源白名单、精确已注册WebContentsId、未知worker/资源/关闭后拒绝。测试证明传入策略分支，不能冒充Chromium所有入口覆盖。
3. 新建 `src/main/browser/authenticated-connect-proxy.ts/.test.ts`：`startAuthenticatedConnectProxy({webContentsId,signal}, dependencies?)`；仅127.0.0.1随机端口，随机Basic凭据、精确proxy挑战筛选，CONNECT-only、头/连接/准备时间上限；全部DNS答案校验，一次解析数值IP连接并复核remoteAddress，无DIRECT。延迟resolver/dialer证明撤销边界、迟到socket销毁、活动隧道销毁、错/过期token无DNS/dial。真实本机raw TCP夹具证明协议状态与字节转发；测试注入dialer将已审公网数值参数映射到本机合成sink，不在产品加入localhost允许项。默认resolver/dialer使用Node实际API，仅数值IP作为host。
4. 新文档 `docs/testing/browser-network-modules.md`：RED/GREEN、原生实验/单元边界、失败次数、源码来源、独立安全审查、定向/全量/类型/build。网络门槛文档只追加本阶段已授权模块与证明范围，历史probe10项不提升为生产验收。

## 顺序与验收

- [x] 三任务取得加载及实际执行RED后GREEN；现126/126。真实本机TCP证明拒绝无dial、数值参数/字节转发/撤销；readonly binding补测也发现并修复可变输入身份。详见[证据](../testing/browser-network-modules.md)。
- [x] 官方Node24.19 net/http/crypto、IANA特殊网段资料与实际类型核验；Electron43真实proxy login/rendererPOST/revoke探针r2退出0。旧fetch_url/目录边界未改。
- [x] 独立审查六文件：1 important半开拒绝连接占槽，真实回归RED→GREEN一次修复；无未处理important。测试/环境证据边界已归档。
- [x] 原runner完整全量6185 pass /0 fail /2 skip（真实Bashfixture）；Main/preload/renderer/测试严格类型与完整build均exit0，所有RED/native首次超时保留，无门禁改动。
- 独立可回退本地提交交唯一集成者，完整SHA以最终Git结果交付；生产gate持续关闭，不推送/PR/合并/部署。

当前不具备的证明：真实TLS/mTLS与证书拒绝、全部renderer/frame/worker/serviceworker请求、代理登录挑战与Chromium真实鉴权、QUIC/WebRTC UDP/TCP旁路抓包、真实session全部存储清理及shutdown接线。可在专用Electron/local fixture补充，不操作真实userData、凭据、PID10072；新增native权限仅走正式审批，拒绝不绕过。同问题两次技术修复失败即报告并按用户要求切Astra-medium。

来源：[Node24.19 net](https://nodejs.org/download/release/v24.19.0/docs/api/net.html)、[Node HTTP CONNECT](https://nodejs.org/docs/latest-v24.x/api/http.html#event-connect)、[Node24.19 crypto](https://nodejs.org/download/release/v24.19.0/docs/api/crypto.html)、[IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry)、[IANA IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry)。HTTP入口官方资料为最新24.x，其具体CONNECT/close语义还需当前本机实际测试与类型对照，未称为版本固定HTTP源码。
