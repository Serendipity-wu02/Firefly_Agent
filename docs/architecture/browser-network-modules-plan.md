# 独立匿名浏览器网络模块实施计划

> 当前用户已直接授权本主线测试驱动实现独立安全模块，优先鉴权/IP固定/请求覆盖/撤销；无需空等父。按 executing-plans/TDD 顺序本人实施，末尾独立审查。共享 bootstrap/IPC/bridge、真实 BrowserService 及生产 gate 放行仍不在此授权内。仅本地提交。

基线 `ed144ee99cff80dfadb1bc2b591aa690440160b9`，既有隔离树/分支复用。规格：[网络门槛 N1–N10](../security/browser-public-page-gate.md)。Node实际24.19.0、Electron43.1.0，无新增依赖/门禁。

信任边界：远端网页/本机代理请求不可信；唯一可创建模块及提供 resolver/dialer 的是未来 Main 私有适配器。模块不认证真实宿主/frame/owner，不能被 renderer 或模型参数直接创建。随机临时代理凭据仅 Main 内存持有，不记录或持久化。socket 必须数值IP固定；所有DNS答案保守拒绝非全球单播，混合/未知/失败拒绝。异步撤销不得建立或发布隧道，已建立隧道立即 destroy。代理不解密TLS，不能单独证明GET/HEAD；HTTP方法/资源归属由独立Chromium策略消费未来可信Main事件。

## 会话授权域：已授权的隔离原型续接计划

基线`2f7fc34f43e03e017d99d440f66533afb0d91447`，契约以[right-agent-workspace会话授权域段](right-agent-workspace.md#2026-10-04-会话授权域验证契约)为准。以下只验证候选，不修改现有产品policy/proxy或共享接线；旧模块精确ID策略仍保持。不用禁Worker方案，不安装依赖、改CI/系统证书/网络或绕198.18环境限制。

1. 先更新既有设计并独立安全review，解决契约/凭据发放阻塞项。每域对象身份、冻结policyEpoch、方法/资源拒绝、capability保密、旧域撤销必须明确。
2. 在仓库外`E:/Codex/2026-10-04/task-4/network-modules-native`新增一次性`session-epoch.cjs`及隐藏launcher，使用既有产品编译proxy与public-target模块。固定内存secure scheme只返回合成HTML/worker脚本，不增加产品scheme权限。域适配器仅在夹具内实现。使用当前受控resolver/dialer把已审公网数值IP映射到本机TLS负例，保留默认Chromium证书拒绝。
3. RED先用旧policy证明shared/SW GET因缺ID/frame受阻，Node严格验证本机测试证书后通过CONNECT的TLS POST可抵达合成sink，证明代理单独不能限制方法。RED是新继承契约/方法边界反例，不将合法dedicated GET重新标签为IP绕过。
4. GREEN调查同源双Session实际worker实例标记、SW注册/状态、cookie/localStorage隔离；既有GET/HEAD/资源/目标政策保持，页面认证后worker GET/importScripts是否使用所属Session的代理cache；POST和私网拒绝。未认证及清auth cache后的缺归属challenge必须取消，禁止为了让GREEN通过猜Session或发送凭据。
5. 新Session误配旧代理端点、旧epoch继续存在的SW/shared、跨权限导航、新域状态及capability隔离；延迟DNS/现存隧道撤销、proxy失效不DIRECT、旧policy不修改与旧请求不获新权限。已TLS隧道POST用Node夹具说明代理责任，Chromium已有可信TLS隧道的完整方法正负例缺环境时明确未验证，不用自签放行替代。
6. 原始每次JSON/退出码/失败记录保留；最终快照+manifest哈希、review、语法/定向模块检查、产品源码无diff与本地可回退提交交父。仅文档/夹具改动不伪称本轮整仓test/build通过。若需要产品改变再交审；两次同问题技术修复失败立即报告并升级Astra-medium。

续接结果：正式契约已更新，原型最终19记录/errors=[]，独立review两项Required关闭，无新增Critical/Required；定向3文件/131通过。完整RED、失败保留、输入版本/哈希及未验证门槛见[Session/epoch证据](../testing/browser-session-epoch.md)。只提交文档与一次性夹具，生产接线未开始，gate保持HOLD。

后续受控验证：[SW/退出证据](../testing/browser-sw-lifecycle.md)补内存主脚本v1/v2真实激活、安装/更新HTTPS import hook观测与失败v3保留v2，正常原生退出最终7记录/errors=[]。保留首轮失败，清理后即时running快照不保证为空；候选保持deny并有界观察后复验，不把clearStorageData resolve当成同步worker停止。独立复审无新增Critical/Required，仍缺可信Chromium TLS、HTTPS主SW脚本成功及生产ShutdownCoordinator，继续HOLD。

最小独立项续接：[首域清理失败负例](../testing/browser-cleanup-failure.md)证明A的Promise拒绝不跳过B原生清理，保留cleanup_failed/native exit1且不放行正常退出；只做无DNS/TLS夹具。该文列出现有源码落点、尚待父冻结的候选接口、可离线推进模块和受控HTTPS目标条件，不自动开启生产实现或创建外部服务。

## 历史模块文件与可验证任务

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
