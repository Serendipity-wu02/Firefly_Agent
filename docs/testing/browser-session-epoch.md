# Session / policyEpoch 隔离原型证据

2026-10-04，基线`2f7fc34f43e03e017d99d440f66533afb0d91447`。用户批准综合会话授权域调查、正式设计更新、安全review与隔离原型；不默认禁Worker、不放行生产。契约及计划在[right-agent-workspace](../architecture/right-agent-workspace.md#2026-10-04-会话授权域验证契约)、[模块计划](../architecture/browser-network-modules-plan.md#会话授权域已授权的隔离原型续接计划)。本次产品源码无修改，原精确WebContentsId策略、proxy、DNS预算和R2/R3/R4均保持。

## 原型边界与鉴权

原型独立隐藏Electron43.1.0/Chromium150.0.7871.47/Node24.18.0；userData/sessionData/logs/crashDumps及TEMP/TMP/RUNNER_TEMP只在task-4专用路径。每域唯一新非persist Session，Main私有Map按原生Session对象登记，epoch及hosts/methods数组冻结；ready前统一handler持续deny，准备await后和首文档前复验注册/abort/owner。owner在本夹具是自有窗口，不宣称父实际profile/conversation/run注册已接线。

无Node/preload、sandbox/contextIsolation；权限、设备、新窗口、下载拒绝。只为固定内存`ff-epoch-fixture://fixture/`、`/shared.js`、`/sw.js`返回合成内容，例外仍检查活动域/GET/资源类型；不路由文件/目录，不新增产品scheme权限。workers在策略安装后创建，未用CSP禁Worker。网页所有HTTPS网络请求保留GET/HEAD、原资源白名单、443/userinfo检查以及原公网地址函数。

鉴权只向活动域精确注册的原生页面对象、其`contents.session`和精确proxy端点/realm/scheme发凭据，调用未改的`credentialsFor`。无contents/可信Session的app.login回调取消，不从PID、URL、realm或端点猜owner。credentials仅Main内存，不记录/入Git。页面先认证该Session代理后，原生Chromium auth cache可供该域workers使用；它们缺ID/frame不因此得到新凭据。清cache后缺归属挑战继续取消，功能受阻是真实边界，不静默重认证或共享缓存。

受控resolver/dialer沿用公网数值pin93.184.216.34→本机TLS服务的测试替换，不增加产品私网允许项。Chromium自签证书始终默认拒绝，正常GET/HEAD结果TypeError或证书错误且HTTP0；因此**不是可信公网HTTPS成功证据**。Node局部`tls.connect({ca:测试证书,rejectUnauthorized:true,servername:'example.com'})`严格验证证书，仅向自有sink发送一次合成POST，未安装系统CA/统一放行Chromium。

## RED及失败记录

| run | PID / native退出 | 实际结果 |
|---|---|---|
| red-worker-r1 | 34316 / 1 | 旧策略拒绝已注册Session的SharedWorker GET，ID/frame缺失，dial0；新继承契约断言true实际false。 |
| red-tls-r1 | 5628 / 1 | Node已验证TLS隧道中的POST抵达自有sink一次，GET/HEAD断言0实际1；证明CONNECT不解密/不能独立限制方法。 |
| green-r1 | 10160 / 1 | 到第11记录已覆盖继承/隔离/POST，随后TLS关闭观察超时。客户端未消费响应，唯一加`resume()`后r2成功；不是降低撤销断言。 |
| green-r2 | 29356 / 0 | 14记录/errors=[]。独立review要求增强缓存负例顺序及旧worker请求非空/实例断言，r2不能独立宣称完整隔离验收。 |
| green-r3 | 22476 / 1 | 新增已安装SW动态新import误假定会联网。此前dedicated/shared import均实际dial，SW无hook/resolver/dial；不是认证/IP绕过。 |
| green-r4 | 31692 / 0 | 最终19记录/errors=[]，required证据增强已覆盖；剩余自有peer0，所有六个记录PID已退出。 |

SW安装完成后的importScripts只能读取已存在script resource map；未安装URL返回network error，见[W3C6.3.2](https://w3c.github.io/ServiceWorker/#importscripts)。r4断言本例实际NetworkError、hook0/dial0，标注为平台负例；不把它算SW安装/更新网络请求策略通过。r3之前未记录该命令result，只保留原始失败/无网络观测，不倒填历史数据。两次测试假设错误各纠正一次后成功；产品修复尝试0、同问题连续两次技术修复失败0，无权限拒绝/绕过。

## 最终可证的有限性质

- 同源两个Session各有不同SharedWorker及SW实例UUID、SW注册各1，B的localStorage起始null、两域各自owner值，cookie相互隔离；未测跨域IndexedDB/CacheStorage全部形态。
- 未预认证B的真实无contents挑战取消，dial0。其no-cors fetch有时返回`fulfilled`，不能当访问成功；本文按代理拨号及目标计数判断。
- A页面原生可信Session完成proxy挑战后，dedicated/shared/SW GET各新增1个真实认证proxy数值拨号；shared/SW请求缺ID/frame，未有新的凭据授予挑战。dedicated/shared importScripts同样拨号；HEAD保留。所有三类worker POST及SW私网目标在Session gate拒绝，新增dial0。
- **不先清B的auth cache**，让B指向A endpoint：实际无contents worker挑战取消，原生可信B页面挑战也因端点不符不发凭据，总拨号无新增。随后A shared仍用缓存新增dial1且无新挑战，排除清B可能抹掉A缓存掩盖问题的测试假设。
- `A.clearAuthCache()+closeAllConnections()`后SW的新无contents挑战取消，dial无新增；再由可信A页面认证。旧epoch先revoke+关闭Session连接，Node已验证存量TLS客户端实际destroyed。
- 新Session C只冻结新目标example.org；旧A的hosts仍冻结为example.com。旧shared/SW仍存活，分别给新目标发不同URL：每种有新非空记录、全部deny、返回实例等于原种子，旧域拨号无新增。C实际Main-frame导航尝试经过新域policy，随后正常`ERR_CERT_AUTHORITY_INVALID`，不是导航成功。
- C唯一代理关闭后，实际Main-frame导航`ERR_PROXY_CONNECTION_FAILED`，resolveProxy仍PROXY，受控拨号/sink无新增。此计数不证明全协议无DIRECT/其他出口。
- D在DNS等待时撤销，再释放resolver：无迟到dial。此为受控promise与真实本机CONNECT，不声称OS DNS可取消。

## 审查、复现与剩余门槛

独立`session_epoch_security_review`先审三文档和既有模块，无Critical，允许受限原型，要求默认deny/准备复验、缓存负例及未知挑战拒绝、存量隧道销毁、固定夹具例外和TLS证据区分。r2复审提出两项Required：不先清B缓存、旧worker请求逐种非空且匹配旧实例；r4实现并实测这些断言。最终只读复审核对r4原始记录与脚本（SHA256 `f740b686fe9abff327f6579fc20678eb0485abc39cfc06c140df081a60a62b06`）：两项Required关闭，无新增Critical/Required，可交集成者评估，生产gate仍HOLD。审查者未另跑native或改文件。

[脚本及manifest](fixtures/browser-session-epoch/manifest.json)保留每次原始JSON/launcher、输入脚本版本映射及SHA256；外部完整stdout/stderr仍在`E:/Codex/2026-10-04/task-4/network-modules-native`。外部sha256绑定原始字节，archivedSha256绑定Git内LF副本，内容不改；夹具目录属性保持字节。脚本为固定路径实验快照，需要现有dist/Electron及外部测试key/cert，私钥不归档。唯一原工作区/真实userData/旧进程不改，不推送/PR/合并/部署。

`node --check`原型脚本退出0，PowerShell launcher解析错误0；六个自有记录PID均已退出。定向命令`node node_modules/vitest/vitest.mjs run src/main/browser --configLoader runner`于2026-10-04 19:49:12执行，3文件/131通过/exit0，20.80秒（TEMP/TMP/RUNNER_TEMP为task-4专用tmp）。归档哈希、脚本语法与Git diff检查再次核验。仅文档/一次性夹具变更，本阶段不重跑整仓test/build/typecheck，不能引用前阶段6190/build通过作为本阶段结果。

**生产gate仍HOLD。** 可信Chromium已有TLS隧道上的POST正负例、公网默认numeric dial（198.18 DNS环境限制仍在）、SW安装/更新/导航预加载、完整frame/redirect/多平台特殊目标、QUIC/WebRTC/WebTransport、证书/mTLS全部路径、生产Main owner/准备取消/清理失败/ShutdownCoordinator接线均未完整验证。缓存继承只证明本机43.1.0特定有限顺序，不能保证换版本、cache失效或所有worker路径；无法可信归属的新挑战必须拒绝。NodeTLS反例不能补齐Chromium方法覆盖，不能未经这些验收开启真实浏览。

DeepSeek Main lease仅设计参考，未移植代码或runtime，其workspace partition复用/存储保留政策没有采用；MIT来源声明见正式设计。官方源码/文档为语义依据，本文逐项原生记录才是实测证据。

## 续接：TLS与DNS限制分离（2026-10-04）

本小步基于`9e7c6a3cc51d598c7ab8ae8f986405cb9e5d661c`，[诊断脚本/原始记录及哈希](fixtures/browser-session-epoch/continuation/diagnosis-manifest.json)于12:01:29 UTC执行：系统`dns.lookup(example.com,{all:true})`返回198.18.1.171，未改产品`isPublicNetworkAddress`判false，TCP尝试0；未硬编码公网地址进行实际联网。现有测试leaf当前日期有效、自签名验证true，issuer=subject=CN=example.com；前步原生Chromium仍报ERR_CERT_AUTHORITY_INVALID。这是信任缺口，与公网DNS限制独立，不是证书过期，不用Node局部CA补称Chromium允许路径。无根证书安装、系统网络改动、验证override或权限绕过。

用户已授权继续当前环境可做的SW安装/更新与退出生命周期隔离验证。下一步固定内存scheme供应SW主脚本，观察安装/更新期间的HTTPS import和fetch是否进入Session handler、proxy及TLS拒绝路径；脚本加载与安装事件fetch分别记录。实际app.quit/before-quit/will-quit验证同步域撤销、忽略不可信beforeunload等待和await清理，仅是候选夹具，不替代生产ShutdownCoordinator接线。可信Chromium TLS允许路径仍需一个系统原有信任且正常DNS通过公网策略的受控HTTPS目标；当前不能通过安装测试根或绕过198.18补齐。
