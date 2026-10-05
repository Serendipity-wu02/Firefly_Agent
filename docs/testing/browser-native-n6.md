# Windows N6 有限撤销矩阵与 N10 回调身份

基线`2cf8eb93d4a227f5b46dc1e4c30b93720c3ece19`，同一隔离E工作树。
只新增一次性夹具、报告与证据，产品源码没有变化；原工作区、旧N3/N10归档、
R1/shared/renderer/CI、生产gate、系统网络与证书信任不变。

最终本机`n6-r2`：PID33064、native exit0、17记录、errors空。
此外单独采用首轮的一个成功公开TLS子记录，以及一个新的N10身份记录；
不把旧r8的17项或首轮其余重叠项计入本次结果。

## 线性化、证据类型与有限范围

撤销线性化点是此binding的owner AbortSignal开始通知，先于resolver/proxy的
同步失效与socket销毁。事件序号记录dial-init、connect200-write-init和双向
forward-write-init；14个raw proxy case各有恰好一个对应撤销序号。
断言这些启动事件不发生在序号之后，而不是断言所有晚到网络字节均为零。
已写入内核的数据可晚到，使用撤销后首次提交的独立fresh nonce验收。

E1为交付屏障/回调故障注入；E2为真实Node/c-ares UDP、socket/peer及Electron
Session/guest/app事件。自有127.0.0.1分类与443到临时端口映射只在QA进程替换，
真实socket、实际remote peer保持。公开TLS观察前恢复原地址策略及原443拨号；
没有peer伪造、MITM、TLS exception、根证书或OS网络改动。本次没有完整E3
（正常可信TLS加受控origin日志），更没有全进程/全接口出口证明。

P4真实peer读取、CONNECT200和初始pipe设置在代理源码中是同一无await同步段。
记录真实顺序，测试其前后窗口；不重写产品、不用重入getter制造不存在的native
异步窗口。P2准确停在原生答案完成、交付代理校验之前，不声称在最终地址谓词后暂停。

## 同probe / 同sink / 同counter的七组正负对照

同一个自有echo origin保留两端peer，统一CONNECT及fresh nonce探针。
每个正对照dial1/origin1/200write1，fresh nonce真实抵达并回显1次。
撤销负例fresh nonce均0，禁止的撤销后启动事件均0。

| 点 | 实际负例边界 | dial / origin / 200write | 额外实证 |
|---|---|---|---|
| P0 | 收到CONNECT后、admission前同步撤销 | 0/0/0 | 最终序号26收到请求→27撤销；不是提前关闭后空测 |
| P1 | 两个真实c-ares A/AAAA UDP查询均被自有stub扣住时撤销 | 0/0/0 | 59/60查询→61撤销→62/63晚回答；ECANCELLED，不是OS lookup取消证明 |
| P2 | 原生完整答案完成后，resolve Promise交付屏障仍未释放 | 0/0/0 | 100答案→101撤销→103交付；未发生迟到拨号 |
| P3 | 真实loopback socket已连接，connect事件向代理交付被扣住 | 1/1/0 | 142origin accept→143连接→144撤销→145迟到交付；旧连接被关，未发布200或转发 |
| P5 | 探针peer已收到200之后撤销 | 1/1/1 | 后提交fresh nonce不抵达；原200是在撤销前启动 |
| P6 | 已有pre nonce完整往返回显之后撤销 | 1/1/1 | 活动tunnel双向本机socket销毁，远端EOF/reset单独观察 |
| P7 | 活动tunnel撤销，同时自有server.close回调注入error | 1/1/1 | 298撤销→300错误→301远端EOF→305观察；重复revoke返回同Promise且均reject，不伪报清理成功 |

P0/P1/P2没有origin peer，所以远端观察字段为null，不用空集合推出“远端已关闭”。
其他实际peer均先观察产品导致的EOF/reset及本地destroyed，再回收夹具自己的
half-open peer。echo sink不会预先自关制造撤销通过。3秒只是失败预算，屏障/事件
及状态观察决定顺序，不用固定sleep充当正确性证据。

## DNS隔离和真实native guest

另有一个真实UDP隔离项：两个独立owner的Resolver各发A/AAAA；A取消得到
ECANCELLED，向旧端口发送晚回答，B正常完成，B信号未abort。此项是独立
Resolver/c-ares通道，并非两个同时在网的Chromium Session的全部组合。
现有trusted factory绑定隔离回归继续复用，不扩成无限native组合。

实际BrowserService/host owner/非持久Session/guest正负两个控制使用同一自有DNS
stub和origin。正例释放DNS后origin真实命中2次；echo peer不能提供合法TLS，
页面预期load_failed，不能写成浏览成功。负例在双查询等待时service.revokeAll：
reply为cancelled、dial/origin/200均0；释放晚回答不能复活。两项都实际销毁旧
guest、dispose成功、旧Session.fetch为ERR_BLOCKED_BY_CLIENT，撤销后禁止启动0。
隐藏不可聚焦宿主，无remote preload/Node，未读取生产userData。

## 唯一公开TLS观察：独立采用n6-r1子记录

首轮PID29012中的`real-public-TLS-revoke-observation-not-full-E3`实际加载
`https://example.com/`成功，既定Main resolver192.168.31.1、一次数值IP拨号、
原始hostname Chromium正常TLS。恢复真实地址分类，不使用fixture端口映射。
该binding序号390撤销→391本机proxy-client close→392本机upstream close；
旧guest destroyed、本地upstream destroyed、晚Session GET被本地策略拒绝，
无新增dial/200/forward启动。没有origin日志或远端EOF观察，不能称完整E3。
仅匿名GET，未向第三方发写请求、创建账户/服务或改变网络配置；最终本机矩阵
复用这一个独立有效子记录，不再次访问公开站点。

## N10 Minor 的精确闭合

`n10-identity-r1` PID3200、exit0、1记录、errors空。两次真实app.quit触发
两个before-quit请求，分别传不同firstAction/secondAction；同shutdown Promise，
firstCalls1、secondCalls0。finalizing后的第三次before-quit、will-quit、quit0均真实。
因此补齐上个checkpoint仅能证明“一次调用”的身份限制；不重复旧五组故障矩阵。
这是实际coordinator/native事件验证，没有修改产品shutdown接线或实现。

## 保留首轮资格失败、审查与验证

首轮n6-r1虽native exit0/errors空，但P0-revoke没有等待CONNECT tap，直接
explicit revoke先关闭代理；该case缺对应线性化序号，原检查中的undefined比较
不足以证明顺序。独立marker判定实际exit1，首轮整组superseded。旧输入快照
`inputs-n6-r1.cjs`和原始JSON/日志保留；只采用不受此缺陷影响的上述公开子记录。
最终版本等待P0 requestReceived、要求整数marker，并明确无peer时为null；
后验判定逐项从真实events重算14个raw case，再核对公开子记录及N10身份，exit0。

Fresh-context Astra只读审查：无Critical/Important。Minor为r2的历史
evidenceClass字符串仍带public-observation后缀；r2实际17项均本机，mode和limits
已说明。原始JSON不改，最终manifest按实际cases分为E1/E2，public仅指r1单个子项。
后续按模式调整这个元数据字段，不能将该串当作r2又执行公网的证据。
审查者重算已有事件，未独立运行native或重复公网动作。

本次现有定向回归4文件/95 passed/exit0：authenticated-connect-proxy、
trusted-browser-resolver、trusted-browser-resolver-budget、browser-network-binding。
最终/旧输入及N10脚本node --check、PowerShell语法检查、证据资格判定和哈希核对。
归档的只读`verify-evidence.cjs`可重新核对已有事件，不启动native或网络探针。
仅夹具/文档新增，没有重新运行Main类型、全量或完整build；上个checkpoint的
288/type/build成功和14个继承H TEMP全量失败仍是历史记录，不写成本次执行。

复现最终本机矩阵（必须新run、只用自有QaRoot/QaBuilt）：

```powershell
& .\docs\testing\fixtures\browser-native-n6\run.ps1 -Matrix n6 -Run n6-new -Mode local-only
& .\docs\testing\fixtures\browser-native-n6\run.ps1 -Matrix n10-identity -Run n10-identity-new
```

不运行旧输入快照，不重复公开动作。完整原始数据和SHA256见
[fixtures/browser-native-n6/manifest.json](fixtures/browser-native-n6/manifest.json)。
可关闭上述有限N6启动/晚交付/活动连接/重复撤销条款；仍不能宣布所有OS/Chromium
DNS/CONNECT窗口、所有cleanup失败或完整N6闭合。N7/N9待新能力或用户取舍，
生产gate保持关闭；本任务到此停止扩展组合。
