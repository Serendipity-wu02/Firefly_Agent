# 首域清理失败：网络独立负例

2026-10-04，基线`787265c895b1d09bd20b79530c1c8391b25906f8`。用户仅授权继续最小独立项：首域清理失败不跳过后域、不得伪报成功；暂停可信TLS/DNS依赖验证，不创建外部服务或配置证书。本步只提交文档与一次性夹具，不修改产品源码、shared bootstrap/IPC、R1、renderer、CI或真实userData。生产gate仍HOLD。

[原始证据、launcher、输入快照及SHA256](fixtures/browser-session-epoch/continuation/cleanup-fault-manifest.json)保留两次运行。独立非persist A/B Session、sandbox/contextIsolation/noNode/noPreload，仅固定内存scheme供应合成文档/shared/SW脚本。两域事先各有cookie和实际running SW。沿既有受审查的清理循环，首await前所有域同步deny/abort/revoke并destroy视图。代理仅创建自有loopback监听，resolve/connect依赖一旦被调用即记录并throw；没有HTTPS请求、TLSsink、证书读取或系统信任/网络配置改动。计数0限探针与受控依赖，不宣称OS/全协议抓包0。

## 注入及实测结果

| run | PID / native退出 | 证据边界 |
|---|---|---|
| fault-cleanup-r1 | 34036 / 1 | 4记录，观察到A失败、B后续清理。但注入是同步throw，launcher未排除额外清理错误；独立review提出两项Required，不能作为异步拒绝回归验收。原样保留。 |
| fault-cleanup-r2 | 3436 / 1 | 最终4记录。A调用适配器返回一次固定marker的Promise.reject，由现有await消费。launcher严格核验预期负例通过；native exit1、cleanup_failed及全部错误保留。 |

r2的A `clearStorageData`仅在夹具调用适配器拒绝一次，未覆盖或替换原生Session方法；B五步实际调用原生API。两域proxy revoke均fulfilled，10项清理中只有注入步骤失败，其余9项均ok。B实际cookie0/running SW为空；A cookie1、SW仍running，在每域3秒有界观察后记录失败，未称清理成功。即使A观察超时，B的原生清理已完成，且B最终状态继续复验。

所有域依然revoked/aborted、view destroyed，纯策略检查拒绝；Main合成的精确proxy challenge返回null，只证明模块capability失效，不冒充真实login归属验证。resolver、dialer、HTTP、鉴权挑战、certificate-error事件均0。

聚合`cleanupResult`从实际errors计算为`{ok:false,code:'cleanup_failed'}`。正常quitAllowed从未放行，willQuit=0；异常fallback调用app.exit1，quit事件记录exit1，不能算正常退出GREEN。原始4项错误为注入、A worker停止观察超时、禁止正常退出及fallback正常生命周期不匹配；没有删除错误转绿。

判定器要求注入一次、A唯一指定步骤失败、其它原生步骤和两域代理均成功、B确实清空、全域继续拒绝、预期非零退出与未放行正常退出。源代码和launcher严格限定允许的注入后果/异常终止错误；额外cleanup/proxy/query异常、deadline或FAULT_NEGATIVE_ASSERTION_FAILED一律不能当预期负例通过。wrapper退出0只表示负例断言通过，不改变native exit1和清理失败语义。

独立session_epoch_security_review最终只读复审：两项Required关闭，无新增Critical/Required；current/r2输入SHA256 `e593ec778206b9d465790a5d9a0e592fc0e409f0a968a30c1e1ea5a7ce3b02d9`。审查者未运行native或改文件。归档哈希、脚本/launcher语法、两个自有PID退出及Git范围随提交核验。本阶段不重跑整仓测试/type/build，不把之前131或全量结果写成本次执行。此次没有失败的产品修复，也没有同问题连续两次修复失败。

## 受控HTTPS目标的必要条件

不再重试相同DNS/TLS探针，不自动创建目标或配置证书。后续相关正例需集成者提供已存在且有权控制的目标：

1. 正常系统resolver给出全部公网A/AAAA，现有分类全部通过，无198.18/私网/混合答案；默认数值dial可达443。不能硬编码公网IP、改DNS/代理或绕过环境过滤。
2. Chromium默认验证可接受的现有证书链，SAN匹配域名、日期有效；不需新增测试根、ignore-certificate-errors或verify override。不需客户端证书、站点登录或持久凭据。
3. 同源匿名GET/HEAD可获取固定测试文档、SW主脚本及import脚本；操作者可控制v1/v2/v3的明确脚本字节变化、scope与缓存响应，并提供目标命中日志。
4. 可用自有无业务副作用的合成路径验证已有TLS隧道GET/HEAD允许、POST拒绝及旧epoch撤销；不扩展产品POST权限、不写真实站点或用户数据。跨协议测试另需授权抓包及相应受控端点，不能由HTTPS结果外推。

当前已实证的外部环境阻塞是两个独立条件：本机测试leaf不被默认Chromium信任、正常DNS给出非公网198.18答案。**尚不能确认它们是唯一外部阻塞**：跨协议抓包、多平台和特殊目标的验证环境未完成评估。内部Main owner注册、生命周期接线与完整拒绝路径也未完成，不能全部归因于外部环境。

## 可继续开发的产品模块：精确边界

以下可另行分配为关闭状态下的实现/单元测试，不需要上面的可信HTTPS目标；本次没有开始这些实现。新模块文件名尚未冻结，不能把提案接口或原型当已存在产品API。

| 模块与实际落点/契约 | 不依赖公网目标的工作 | 集成限制 |
|---|---|---|
| Session/epoch私有注册与权限谓词；现有目录`src/main/browser`，旧`browser-request-policy.ts::createBrowserRequestPolicy`及测试是回归基线 | 对象身份、冻结policy内容、撤销、Session不匹配、缺ID/frame、GET/HEAD/资源/URL拒绝的纯测试；新域策略与旧策略分别评估 | 新文件/接口由集成者冻结；保留既有ID策略及R2基线，不从renderer DTO授予权限，不开启真实网络 |
| `BrowserNetworkPort.prepare`与`BrowserNetworkBinding.dispose`；精确提案在[right-agent-workspace](../architecture/right-agent-workspace.md#待冻结的可调用接口与错误契约) | 准备默认deny、每个await/副作用前复验、延迟取消、只初始化一次、逐项清理/失败聚合、clear后有界观测；可注入Session端口做单元验证 | 产品实现尚不存在；签名/owner来源仍需父冻结，不能绕过未完成的网络gate |
| 代理capability生命周期；现有`src/main/browser/authenticated-connect-proxy.ts::{startAuthenticatedConnectProxy,ConnectProxy,ProxyChallenge}`及对应测试 | 新授权域适配器消费Main注册对象，精确challenge/撤销/迟到准备交叉回归；resolver/dialer注入做拒绝测试 | 现有proxy/DNS预算无需重做；无归属challenge不发凭据，不把模块ID检查当完整Session证明 |
| 浏览器清理参与者；现有`src/main/application/shutdown.ts::{ShutdownCoordinator,createShutdownCoordinator}`及测试 | 以实际register/dispose接口测试浏览器撤销、重入、失败记录和超时；浏览器自己的close/dispose结果保留cleanup_failed | 通用coordinator按设计记录单项失败后继续阶段/finalAction，其Promise resolve不等于浏览器清理成功；只准备参与者，生产注册由集成者接线 |
| 注册内容的导航适配器；现有`src/main/windows/external-link.ts::installGlobalNavigationGuard`，提案`BrowserService.isRegisteredBrowser/handleNavigation` | 已注册内容的精确路由合同、redirect/popup拒绝及撤销回归，可用注入注册表测试 | 实际全局listener修改和Main host/profile/conversation注册归集成者；不新增URL前缀例外，不将拒绝退到openExternal |

当前不能独立宣布可用的部分：真实BrowserService owner/宿主创建与IPC/bridge、生产ShutdownCoordinator注册、HTTPS浏览放行、全协议出口证明。它们有内部注册/接口与集成审查依赖；TLS目标到位也不会自动完成。renderer/R1/持久登录/代理操作工具、目录迁移、记忆、CI均不在本任务开发清单。
