# 受限浏览器：有限可用性验收补充

基线`138c5268a89e69e20ad7cc2e56cadb6f1fd9d592`，原隔离E工作树。
只新增验收夹具和记录，没有产品源码、SW策略、生产gate或主共享接线变化。
未重跑N6的17项、已验证两站，未启动常驻viewer、部署服务器、改OS/TUN/证书/驱动。

## 可交付的受限预览结果

复用既有`browser-resolver-shared-integration/evidence-r5.json`：example.com与GitHub
确实经选定Main DNS192.168.31.1、数值TCP和原hostname正常Chromium TLS加载成功；
过期证书站实际拒绝ERR_CERT_DATE_INVALID。这是历史实测，本轮不访问这些站点。
既有`public-ui-summary.json`有24项/9截图、errors空：Chat/Work/Code的欢迎页与
已有会话、native页面内容、几何布局、resize、关闭/重开及撤销。公共网络是真的；
可见/聚焦host授权状态是QA合成，实际OS前台/tray不是已验收项。没有在本轮新开预览。
因此已有独立受限预览的匿名GET/HEAD及基本交互证据可供验收，不能据此打开生产gate。

## 本轮N7：同一Chromium探针，而非Node预探测

`n7-r1` PID29336、native exit0、8记录、errors空。IPv4/IPv6各UDP STUN与TCP TURN
四组，每组使用同一个sink/计数器和完全相同的RTCPeerConnection/createDataChannel/
createOffer/setLocalDescription探针。控制侧只在此QA进程用direct/default policy；
受限侧复用编译后的真实`createElectronBrowserGuest`固定偏好、
`disable_non_proxied_udp`及真实authenticated proxy和产品Session port的fixed proxy设置。
只加载固定data文档，HTTP/HTTPS请求拒绝；不声称经过完整BrowserService导航授权。
没有公网RTC/STUN/TURN目标、页面preload/Node、全接口抓包或证书放行。

| 同probe对照 | 控制侧真实sink结果 | 受限侧sink增量 | 资格 |
|---|---|---|---|
| IPv4 TURN TCP | accept2、STUN magic framing2 | accept0/message0 | 有限E2正负对照成立 |
| IPv6 TURN TCP | accept3、STUN magic framing3 | accept0/message0 | 有限E2正负对照成立 |
| IPv4 STUN UDP | datagram0 | datagram0 | 正例未触达，不计通过 |
| IPv6 STUN UDP | datagram0 | datagram0 | 正例未触达，不计通过 |

TCP sink只保留连接和计数，不实现TURN relay、鉴权或数据通道；STUN magic只证明
协议格式字节抵达，不证明Allocate成功。原始事件标签`owned-TURN-allocation-message`
不能提升为Allocation成功。没有proxy auth事件，所以也不推断具体是代理鉴权或
哪个内部检查挡住该尝试。两个设置作为受限组合观测，并未分离各自因果。

每探针JS设置3500ms观察预算，Main执行总预算6000ms；不是全时段或全出口零证明。
各控制侧候选数10（host）；各受限侧本轮记录0，保留gathering/error状态。
**候选计数来自此次事件，不将policy字符串当作zero ICE，也不宣称通用zero ICE。**
UDP socket均能在127.0.0.1/::1绑定，但Chromium正例没有触达；没有诊断为设备不支持
IPv6或改路由重试。按四组有限边界停止，不换公网目标或无限延长等待。

E1为QA direct/default正例适配，E2为真实Chromium RTC和自有loopback socket。
本轮8项只有2组TCP具备合格同probe正例，不能写成8项N7门槛全过，更没有完整E3。

## 剩余项逐条判定

| 项目 | 本机现状与验收边界 |
|---|---|
| N7 IPv6 | 本轮真实IPv6 TURN TCP同probe补齐一个有限窗口；IPv6 STUN UDP正例未触达，仍未验收 |
| N7 公网/全接口 | 两站普通TLS不等于RTC/QUIC/HTTP3旁路证明；缺获准全接口/出口观察设施及受控协议服务，本次不安装、不部署 |
| N7 QUIC/WebTransport | 既有IPv4 bounded sink观察保留；没有可信自有HTTP3/WebTransport server同probe正例，仍未闭合 |
| N5可信HTTPS worker矩阵 | 既有main HEAD成功、POST/PUT/DELETE/beacon/WSS拒绝、local-protocol worker观察保留；真实HTTPS iframe/dedicated/shared/SW全矩阵缺可控受信任origin |
| N5/N9 HTTPS SW | 缺既有信任链、合规DNS、可部署固定SW脚本的自有HTTPS origin；本轮不能测主脚本install/update/navigation-preload及持续late-writer，不借第三方站点注册/写入 |
| N9既有本机状态 | local-protocol SW真实v1/v2安装激活/清理与固定observer存储清空有限证据已存在；HTTPS import负例HTTP0不是HTTPS主脚本安装成功，不重复或重标成TLS |
| N10系统生命周期 | 已有真实app.quit/coordinator身份及故障证据保留；OS注销/关机/崩溃本轮未测，不触发系统动作 |

既有SW保留政策不变。不新增功能、入口或门禁。N6和N3/N10先前checkpoint继续独立，
本轮不将“需要设施”转换成“通过”。生产gate仍关闭。

## 验证与交付

脚本语法、原生launcher、`verify-evidence.cjs`的只读资格判定及相关已有guest/session
回归2文件/29 passed/exit0（electron-browser-guest、browser-network-binding）记录于
新fixture归档；不把进程exit0当作N7完整通过。输入、原始JSON/日志、
审查及SHA256在[manifest](fixtures/browser-bounded-acceptance/manifest.json)。
产品源码未变，不重跑全量/type/build；前checkpoint的14项继承H TEMP失败仍未豁免。

Fresh-context Astra只读审查无Critical/Important，重算TCP2/3及UDP不合格分类。
一项未来夹具健壮性Minor保留：pair资格/离线checker尚未明确排除`result.failure`。
本轮8项实际均无该字段，另行检查后采用当前结果；不由此保证未来异常正负例合格。
审查时manifest尚未生成，已在交付归档补齐并由作者核对哈希；不宣称独立审查了最终清单。

API依据：[Electron43.1 WebContents policy](https://raw.githubusercontent.com/electron/electron/v43.1.0/docs/api/web-contents.md)、
[WebRTC规范](https://www.w3.org/TR/webrtc/)。固定API只规定控制方式，验收结论取自实际计数。
