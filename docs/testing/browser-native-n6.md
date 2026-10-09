# Windows N6 有限撤销矩阵与 N10 回调身份验证

> 证据阶段：2026-10-05
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与范围

本阶段只增加一次性夹具与证据，不改产品或旧 N3/N10 归档、系统网络/信任和生产 gate。最终 `n6-r2` native exit0、17记录、errors空；另采用 `n6-r1` 一个独立有效公开 TLS 子记录及一个 N10 身份项，不与旧 r8 或重叠矩阵重复计数。

E1 为交付屏障/回调故障注入，E2 为真实 Node/c-ares UDP、socket/peer、Electron Session/guest/app。QA 的127.0.0.1分类/443临时端口映射保留真实 socket/peer；公开 TLS 前恢复真实地址策略/443。无 MITM、TLS例外、根证书或 OS 网络变更；无完整 E3（可信 TLS+受控 origin日志）及全出口证明。

## 2. 撤销线性化与判定

线性化点为 binding 的 owner AbortSignal 开始通知，先于 resolver/proxy 同步失效和 socket destroy。记录 dial-init、connect200-write-init、双向 forward-write-init；14 个 raw proxy case 各有恰一个撤销 marker，断言禁止启动不在 marker 之后。撤销前入内核的字节可能晚到，因此使用撤销后首次提交 fresh nonce，不要求所有晚到字节为0。

P4 peer读取、200启动、初始pipe是无 await 同步段，不制造假异步窗口。P2 在原生答案完成、交付 proxy 校验前，不是最终地址谓词后。

## 3. 七组同 probe/sink/counter 对照

每个正例 dial/origin/200write=1/1/1，fresh nonce抵达并回显1；所有负例 fresh nonce0，撤销后禁止启动0。

| 点 | 负例边界 | dial/origin/200write | 关键观察 |
| --- | --- | --- | --- |
| P0 | 收到 CONNECT、admission 前 | 0/0/0 | request序号26→revoke27，非提前关代理空测 |
| P1 | 自有 stub 扣住两真实 c-ares A/AAAA UDP 查询 | 0/0/0 | 查询59/60→revoke61→晚答62/63，ECANCELLED；非 OS lookup 取消证明 |
| P2 | 原生完整答案完成、交付屏障未放 | 0/0/0 | 答案100→revoke101→交付103，无晚 dial |
| P3 | 真 socket 已连，connect 交付扣住 | 1/1/0 | origin142→连接143→revoke144→晚交付145，旧连接关闭，无200/转发 |
| P5 | peer 已收到200 | 1/1/1 | 200在撤销前启动，后提交nonce不抵达 |
| P6 | pre nonce已完整往返 | 1/1/1 | 双向本机socket毁，远端EOF/reset独立观察 |
| P7 | active revoke + server.close callback error | 1/1/1 | revoke298→error300→EOF301→观察305；重复revoke同Promise、均reject |

P0/P1/P2没有 origin peer，远端字段为 null，不从空集合推导关闭。其他 peer先确认产品导致EOF/reset/local destroyed，再回收夹具 half-open peer；sink不提前自关。3秒是失败预算，顺序以屏障/事件/状态为准。

## 4. DNS 隔离、native guest 与公开 TLS

两个独立 owner Resolver 各发A/AAAA，A取消ECANCELLED并向旧端口送晚答，B正常、signal不abort。只证明独立 Resolver/c-ares 通道，不是两个 Chromium Session 全组合。

BrowserService/host owner/Session/guest同 DNS stub/origin正负例：正例释放DNS后origin命中2，但echo不能TLS、页面预期load_failed；负例在双查询等待service.revokeAll，reply cancelled、dial/origin/200皆0，晚答不复活。两例旧guest真实销毁、dispose成功、旧Session.fetch=`ERR_BLOCKED_BY_CLIENT`，撤销后启动0。

独立采用 `n6-r1` 的 `real-public-TLS-revoke-observation-not-full-E3`：example.com匿名GET成功，既定 Main resolver192.168.31.1、一次numeric dial、原hostname默认TLS。revoke390→本机proxy-client close391→upstream close392，旧guest/local upstream destroyed、晚GET拒绝，无新dial/200/forward。没有origin日志/远端EOF，不能计完整E3；最终本机矩阵未再次访问公网。

## 5. N10 回调身份与证据资格

`n10-identity-r1` exit0、1记录、errors空：两真实quit分别传不同firstAction/secondAction，同shutdown Promise，firstCalls1/secondCalls0；finalizing后的第三before-quit、will-quit、quit0真实。该项关闭先前“只证明调用一次”的身份限制，不重复五组故障矩阵。

首轮 `n6-r1` native exit0/errors空，但P0未等CONNECT tap、缺marker；undefined比较不足以证明顺序，独立资格检查exit1，整组不验收，仅保留不受影响的公开子项。最终等待 requestReceived、要求整数marker、无peer字段null，从真实events重算14 raw cases及TLS子项/N10，exit0。

独立只读审查无Critical/Important。Minor为r2历史evidenceClass仍带public-observation后缀，实际17项全本机；manifest按真实case分E1/E2，public仅r1子项。原始JSON不改，不从标签推断额外公网执行；审查只重算记录，未重跑native。

## 6. 验证、复现与限制

既有 authenticated-connect-proxy、trusted-browser-resolver、trusted-browser-resolver-budget、browser-network-binding 回归为4 files/95 passed/exit0。输入/N10脚本node --check、PowerShell语法、只读资格判定和哈希已核验；`verify-evidence.cjs`只读已有事件，不启动native或网络。

[manifest](fixtures/browser-native-n6/manifest.json)保留输入、失败及最终数据。仅文档/夹具变化，未重新Main类型/全量/build；较早288/types/build成功和14项TEMP失败不算本次执行。复现必须新run、显式自有QaRoot/QaBuilt，使用local-only矩阵；不运行旧输入或重复公开动作。

该阶段只能关闭上述有限启动/晚交付/活动连接/重复撤销条款，不能宣布所有OS/Chromium DNS/CONNECT、全部cleanup故障或完整N6。N7/N9与生产启用需要独立证据；本页历史 gate 关闭不作为当前模式状态。
