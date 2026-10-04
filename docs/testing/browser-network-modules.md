# 独立匿名浏览器网络模块验证

2026-10-04，基线 `ed144ee99cff80dfadb1bc2b591aa690440160b9`，复用 `E:\Codex\2026-10-04\task-4\audit-r3-r4` / `feat/right-agent-workspace`。用户直接授权独立模块TDD，未授权共享接线或生产gate放行。新增六个 `src/main/browser/*.ts` 源码/测试与本阶段文档，无IPC/preload/Bootstrap/BrowserService/旧UI/R1/目录backend/CI变更。

## 交付与契约

- `public-network-target`：Node BlockList保守IPv4/IPv6全球单播分类；特殊用途、IPv4映射/转换与zone等拒绝。CONNECT authority限定显式443，拒绝URL/userinfo/路径/编码/末尾点/非DNS标签。规则快照保守拒绝部分全球可达特殊地址，不保证所有网站可用，也不能识别公网地址上的组织内部服务。
- `browser-request-policy`：未来Main注册的准确WebContentsId + AbortSignal；严格HTTPS GET/HEAD、资源白名单，unknown/foreign/worker归属不明及关闭后拒绝。纯策略没有DNS/实际连接权，必须配合代理。仅策略分支测试不能证明Chromium全部入口覆盖。
- `authenticated-connect-proxy`：Main-only factory，127.0.0.1随机端口、随机内存Basic凭据、每binding独立realm与精确proxy挑战匹配；不回应目标/外来/未知挑战。HTTP forwarding/upgrade、重复Auth/Host、authority歧义拒绝。全部DNS答案校验，混合/空/失败/family不匹配拒绝；只向一个已审数值IP连接，不二次按hostname解析，复核remoteAddress。请求准备10s、头4KiB、连接64/准备32上限。拒绝响应flush后destroy，1s不可延长收尾兜底。撤销先失效，取消DNS等待、销毁connecting/已建socket，关闭listener；复验revoke返回同一cleanup结果。

构造参数/注入resolver与dialer只能由未来可信Main适配器提供，不能成为renderer/model可构造authority。本模块仅固定输入身份/原signal，不认证宿主top frame、profile、conversation或当前Main注册状态；这些仍由父冻结和实现。实际Session代理配置/单一webRequest注册/全局导航guard精确路由/permission证书与shutdown不由本模块代办。代理看不到TLS内HTTP方法；Main必须把本请求策略装到专用Session，且补完实际入口验收。返回凭据属于Main私有值，不放到公开DTO/URL/日志/metadata。

## RED/GREEN 与失败记录

日志根 `E:\Codex\2026-10-04\task-4`。临时目录/runner诊断均任务E盘，共享node_modules junction无安装复制。定向命令：`node .\node_modules\vitest\vitest.mjs run src/main/browser --configLoader runner`。严格类型包含六个源码/测试文件；沿用现有全量runner和实际 `FIREFLY_TEST_BASH=E:\Git\bin\bash.exe`。

| 检查 | 真实结果 | 日志 |
|---|---|---|
| 策略模块缺失 | exit1，2 suites、0测试；加载RED | browser-network-policy-module-red.log |
| 可执行未实现接口 | exit1，91 fail / 1 pass，共92 | browser-network-policy-runtime-red.log |
| 策略最小实现 | exit0，92/92 | browser-network-policy-green.log |
| 代理模块缺失 | exit1，1 suite、0测试；加载RED | browser-connect-proxy-module-red.log |
| 可执行未实现代理接口 | exit1，26 fail / 1 pass，共27 | browser-connect-proxy-runtime-red.log |
| 代理首次验证 | exit1，118 pass / 1 fail；GET夹具用了非法request-target。严格类型也暴露DNS it.each数组参数被展开，旧无效DNS参数不能作验收证据 | browser-connect-proxy-first-green.log、browser-network-types-first.log |
| 定位并一次纠正上述夹具 | exit0，119/119与严格types；DNS案例改对象包裹，发送合法绝对HTTP request-target | browser-connect-proxy-green.log、browser-network-types.log |
| 调用方复用可变owner对象的缺陷 | exit1，124 pass / 1 fail；随后快照原身份与signal，125/125 + types | browser-binding-identity-red.log、browser-network-modules-green.log、browser-network-types-final.log |
| 独立审查半开连接占槽缺陷 | exit1，125 pass / 1 fail；64拒绝连接保留写半边，第65合法请求无响应 | browser-connect-half-open-red.log |
| 拒绝完整销毁一次修复 | exit0，126/126；第65合法请求能建立隧道，真实TCP | browser-network-modules-final-green.log |
| 六文件严格types（含测试） | exit0 | browser-network-module-test-types-final.log |
| renderer/schema | 两者exit0 | browser-network-final-renderer-types.log、browser-network-final-schema.log |
| 完整npm run build | exit0，storage boundary/Main/preload/CLI/renderer完成，既有chunk大小警告保留 | browser-network-final-build.log |
| 原runner全量（正式进程权限/真实Bashfixture） | exit0，618 files；6185 pass / 0 fail / 2 skip，共6187，390.21s | browser-network-full-tests.log |

全量已实际完成，没有TestFiles筛选或排除。两项既有skip仍为E盘临时路径无真实Windows8.3 alias，以及plugin-panel file symlink native ERROR_PRIVILEGE_NOT_HELD(1314)。没有更改这些测试/目录边界。runner只产生快照LF/CRLF表示变化、git内容diff为空，确认本轮生成后恢复该单一文件，不纳入提交。无同问题连续两次技术修复失败：每项夹具/身份/半开缺陷均一次定位修正后通过；native初跑超时一次，页面初始化纠正后通过。没有权限拒绝或绕过，没有切模型猜修。独立最终审查本身使用按skill要求的新鲜Astra-medium审查者，不是实施失败后的模型切换。

技能可用性：核心using-superpowers/context-engineering/TDD/security/source-driven/writing-plans/executing-plans及实际vendor TDD/debugging/review指引已读。云TDD引用的`writing-good-tests.md`读取失败，不宣称使用该附录；本轮按可读取核心及vendor规则取得实际RED/GREEN，不改门禁。方案已有用户直接执行授权，无额外总体设计审批循环。

## 独立审查

审查者只读六个新文件，独立复跑125/125通过，并用真实本机TCP发现1 important：仅end写半边后，本机恶意对端收到407/FIN但不发送FIN、持续来包，32s后仍占槽；64个拒绝连接使第65连接无响应。源码改为flush后destroy + 不可延长1s兜底；新回归真实RED→GREEN一次修复。没有未处理important，未发现blocking公网/凭据归属绕过；未进行第二轮重复审查，本阶段最终完整套件验证承担修复后的回归检查。

审查确认测试证据边界：代理前端/echo目标是实际本机TCP；resolver/dialer与remoteAddress刻意注入，记录合法公网数值参数后映射到本机sink。产品没有localhost准入例外。IPv6等价比较使用真实Node BlockList，但没有真实IPv6外网连接；连接中撤销用真实Socket手工事件，不能冒充OS connect竞态。实际默认数值dial调用路径由源码/类型核验，没有连接真实公网验证。

10s准备与1s收尾兜底配置已存在，尚未单独对悬挂resolver/写背压做精确耗时验收；半开回归证明正常拒绝flush即时释放槽。该覆盖缺口不以代码中有setTimeout替代，随延迟/背压夹具补齐。

## 新模块真实Electron消费探针

独立夹具 `E:\Codex\2026-10-04\task-4\network-modules-native\probe.cjs` 和 `run-probe.ps1`。先完整build，再正式审批运行 `& ...\run-probe.ps1 -Run r2`。只import新编译模块，不启动产品Main/bridge。隐藏独立BrowserWindow，专用内存Session及E盘userData/sessionData/logs/TEMP；只真实连接127.0.0.1合成echo，公网页名解析/dial由受控依赖映射，不转发公网，不用真实凭据、userData或PID10072。

- r1 PID10020，exit1，只有代理路由记录后30s超时。新建window尚未载入完成的夹具文档，executeJavaScript等待加载停止；核验实际Electron43类型与[固定版本官方说明](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-contents.md#contentsexecutejavascriptcode-usergesture)后，先加载受控about:blank再装网络策略。没有给产品策略添加scheme例外。
- r2 PID10864，exit0，Electron43.1.0 / Chromium150.0.7871.47 / Node24.18.0，5条记录、errors为空，已退出。`evidence-r2.json` 与 `launcher-r2.json`、stdout/stderr保留，脚本语法node --check退出0。
- 真实renderer fetch POST：onBeforeRequest显示methodPOST、resourceType xhr、WebContentsId1，策略false，origin/dial均0。
- GET真实代理挑战：isProxy=true/scheme=basic/WebContentsId1才获得临时凭据；CONNECT两次dial都传入93.184.216.34/family4/443。实际TCP映射到echo，回显TLS字节刻意导致ERR_SSL_PROTOCOL_ERROR；没有合法TLS、证书验证或页面成功的证明，没有信任CA/证书例外。
- revoke后新GET在Chromium ERR_BLOCKED_BY_CLIENT，dial仍2无增长。fixture最后closeAllConnections/storage/cache/auth/hostResolver清理完成；仅此探针生命周期，未证明生产shutdown接线与全部存储种类。

## 当前可证实与未完成门槛

| 目标 | 当前证据 | 剩余最小步骤/环境需求 |
|---|---|---|
| N3鉴权 | 实际TCP错/跨binding/重复token无DNS/dial；实际Chromium匹配proxy login | 真实隔离Session之间缓存凭据隔离、其它页面/worker挑战归属与退出后重开 |
| N4 IP固定 | 全DNS答案拒绝、单数值pin、无二次lookup、每CONNECT重验、remoteAddress复核；真实前端+注入dial记录 | 默认真实IPv4/IPv6 numeric socket、混合DNS/重绑定/redirect完整本机TLS夹具；不触达私网或真实metadata |
| N5请求覆盖 | 所有纯策略资源分支，真实renderer POST-before-dial | iframe/redirect/XHR/form/beacon/worker/SW完整实际入口及GET/HEAD正常fixture；当前echo TLS失败无法供真实跨页渲染 |
| N6撤销 | 延迟DNS零dial、连接中迟到事件不发布、真实已建TCP拆除；真实Chromiumrevoke无新dial | 默认OS connect中断竞态、迟到DNS/CONNECT/redirect并发、真实Session auth与缓存竞态 |
| N1/N2 | 前阶段隐式DIRECT/单代理失败反例；本模块CONNECT-only/本次实际proxy路由 | Windows特殊名/IPv6/link-local及HTTP/WebSocket路径实际阻断、proxy死后真实Session无回退 |
| N7跨协议egress | 未抓包；WebRTCpolicy/专用disable-quic只是设置 | 专用UDP/TCP sink与隔离抓包/egress验收。未核验可用抓包环境；所需安装/系统控制或额外权限由父具体决定，不自行修改宿主网络 |
| N8证书权限 | 前阶段Notification拒绝；本次没有证书正/负验证 | 临时TLS/mTLS、设备/捕获/下载/upload各入口拒绝；不安装系统CA、不使用真实证书/凭据 |
| N9/N10生命周期 | 模块revoke/socket/listener与专用fixture清理 | 全Session数据/worker回写、cleanup失败与真实shutdown顺序/超时；共享接线仍父负责 |

**生产gate保持关闭。** 独立模块与探针不创建可用浏览入口，不是完整BrowserNetworkPort.prepare，不回退系统浏览器。最小下一步是本机TLS/iframe-worker完整夹具与独立egress证据；然后父冻结Main owner/session、单一handler与cleanup契约，接线后再验收。未验证项不通过mock、历史10probe或125/126单测数量补票。
