# Windows N3/N10 有限原生验收

> 证据阶段：2026-10-05
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与证据分类

本阶段使用专用 smoke profile、非持久 Session、隐藏不可聚焦宿主和自有 loopback fixture。Electron 43.1.0 / Chromium 150.0.7871.47 / Node 24.18.0；E1 为注入/屏障/合成挑战，E2 为真实 native/socket/自有 fixture，E3 为正常可信 TLS 加受控目标日志。本阶段没有新 E3，不与旧 r8 的 17 项重复计数；生产 gate 当时关闭。

## 2. N3 鉴权与归属

最终 `n3-r4` native exit0，12 记录、errors 空，清理成功。两 CONNECT binding 的真实 TCP sink 总命中 8；负例按同 counter 增量判断，不能把正例也称零。

| 场景 | 结果与边界 |
| --- | --- |
| 两个已注册 binding | 正确凭据经真实 proxy 抵达自有 TCP sink，E2 |
| foreign loadURL 合法 A token 正例 | sink +2、A resolve/connect 各 +2；fixture Main 注入凭据，E2 |
| 未注册 Session 无凭据；foreign 错 token | 真实 proxy challenge 拒绝；resolve/connect/sink 均 +0，E2 |
| A token 用于 B endpoint | 三 counter +0；A 当时有效，证明跨 endpoint 而非活跃 token 轮换 |
| 注册 B 指向 A proxy | registered/proxy/granted=false，三 counter +0 |
| 相同 B loadURL 走自身 proxy | 同 sink +2 正例 |
| site login 合法合成身份 | 真实 401/200、两请求、authorized1，E2 |
| 注册 B 的 native site login | proxy=false/registered=true/granted=false，请求+1、authorized+0；最终401可加载，不把 fulfilled 算认证成功 |
| site/realm/scheme/host 不匹配 | 实际 native identity 上4个合成挑战拒绝，E1 |
| A 退役 endpoint + 旧 token | `ERR_PROXY_CONNECTION_FAILED`，三 counter +0，无新 challenge |
| A 退役 native identity | destroyed，credentialsFor=null |

CONNECT 夹具只在 QA 进程替换公网分类，允许自有 127.0.0.1，并将443映射临时 TCP sink；真实 socket/remote peer 保留，sink 主动断开，不提供有效 TLS。site401 额外只允许精确 native ID/URL/GET，经固定 fixture HTTP proxy、无 DIRECT。替换不在产品/IPC，不认证公网分类、TLS 或全出口。凭据只在 Main 内存，JSON 仅布尔授权结果。

N3 有限拒绝条款成立；可信 HTTPS site challenge、worker auth cache/challenge 完整组合仍未覆盖，不宣称整个 N3 完成。

## 3. N10 清理、失败、deadline 与重入

每组新进程含两个实际非持久 Session，各种一个合成 cookie；请求仅 `.invalid`、resolver 空答案，无 upstream dial。五步清理沿实际 Session port；故障只在调用适配器 Promise reject/永不完成，不覆盖原生方法。

| 场景 | 清理结果/cookie A/B | coordinator 与 native 结果 |
| --- | --- | --- |
| 无故障控制 | 成功；0/0 | 7 阶段完成，无故障日志，exit0 |
| browser reject | cleanup_failed；1/0 | 首域拒绝仍调用全部10项及后续阶段；故障1，exit0 |
| browser timeout | cleanup_failed；1/0 | 350ms browser 预算，挂起项不伪报成功；其余与后段继续，故障1，exit0 |
| 七阶段各一次 reject | 成功；0/0 | 7 条精确日志，阶段继续、最终动作执行，exit0 |
| 后阶段总 timeout | 成功；0/0 | browser后 stopExternalProviders 挂起，700ms 总 deadline/abort/pending ID 保留，后两阶段未执行，exit0 |

每组4汇总记录、errors空。事件序列为先 revoke/请求 destroy，再调用10项原生清理；最终 guest destroyed。3 次 before-quit、同一 shutdown Promise 重入、一次 final-action/will-quit/quit。coordinator resolve 或 native exit0 不等于 browser cleanup 成功；首域失败时 B cookie确为0。

native close 异步，清理 API 启动时 isDestroyed 可仍 false；最终 destroyed 不认证 N9 late-writer 先后。只注入一个原生步骤的 reject/noncompletion、七阶段普通 reject及一个后段 deadline，未穷尽每 API/阶段 timeout或系统关机/注销/重启。初始 first-final-action-only 用同一函数，只证明一次调用；不同回调身份由[后续 N6/N10 记录](browser-native-n6.md)单独验证。

## 4. 产品反例与验证

host destroy 后访问 `options.host.webContents.id` 可抛 Object has been destroyed，导致 owner signal 未 abort。最小修复保存注册时的精确 ID供 affected-ID 匹配，其他权限不变；直接 RED 为 owner.signal false，1 failed/2 passed，修复后3/3，原生矩阵不再出现异常。同步 destroy 断言错误不用于修改产品时序，也不据此宣称可利用漏洞。

| 最终检查 | 结果 |
| --- | --- |
| Browser 回归 | 14 files / 288 passed，exit0 |
| Main noEmit、browser tests strict types、Main 隔离 emit | exit0 |
| 完整 build | storage boundary/Main/preload/CLI/renderer exit0，保留 chunk 警告 |
| 完整普通套件 | 646 files：645 pass/1 fail；6513 passed/14 failed/2 skipped，exit1 |

14 失败均在既有 `native-history-presence-process.test.ts` 的精确外部 TEMP 前置条件，随后 afterEach 因 root 未初始化报错。未借用外部 fixture、改测试/门槛或跳过；其他环境的6526/2skip不能替代本次全量。独立只读审查无 Critical/Important，N10 标题 Minor 按上述范围收窄，未独立重跑 native。

## 5. 证据资格与后续要求

历史夹具失败包括 defaultSession 误拦 host data:、可变引用导致早期计数不稳定、fixture 自身关闭挂起，以及把 destroy 请求误当同步 destroyed。原始失败保留；最终记录使用快照、有预算关闭与自有残留 socket 回收，不把 fixture 自关当产品 tunnel revoke。

输入、失败/最终 JSON 与 launcher 见[manifest](fixtures/browser-native-gaps/manifest.json)。复现需新 run、自己隔离 QaRoot/QaBuilt 和明确编译输入；脚本历史默认目录不是通用环境，不对生产 dist/userData 运行。N7/N9、新设施和全 N1–N10 仍是独立验收，不由此报告放行生产。
