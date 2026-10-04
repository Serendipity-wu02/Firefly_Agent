# SW安装/更新与原生退出的有限证据

2026-10-04，续接基线`de87bbd10cb6420abcf2703941b6b6c4b28ebf2f`，用户授权现环境可做的隔离验证。沿用[Session契约](../architecture/right-agent-workspace.md#2026-10-04-会话授权域验证契约)，产品源码/启动接线不变，生产gate HOLD。[原始JSON、launcher、输入版本及哈希](fixtures/browser-session-epoch/continuation/sw-lifecycle-manifest.json)保留全部运行，不覆盖失败。

## TLS与DNS仍是两个独立限制

[只读诊断](fixtures/browser-session-epoch/continuation/diagnosis-manifest.json)中example.com系统DNS为198.18.1.171，未改产品判非公网；探针未调用应用TCP连接API。原记录`tcpAttempts:0`是源码的显式API计数/无调用事实，不是OS DNS内部TCP或抓包0。现有测试leaf自签且日期有效，Chromium页面实测ERR_CERT_AUTHORITY_INVALID；不是过期。未安装根/改系统网络/改DNS/绕198.18/统一放行证书。

本步仍用先前受控resolver/dialer将合法公网数值pin映射到自有本机TLS sink，仅实验依赖替换；未用于实际公网联网。Node局部显式CA、rejectUnauthorized:true仅建立一个自有GET TLS隧道作为退出关闭观察，未冒充Chromium允许路径。本次sink唯一HTTP命中为该Node GET。

## SW路径实测

Electron43.1.0/Chromium150.0.7871.47，独立非persist Session/窗口、sandbox/contextIsolation，无Node/preload，固定内存scheme仅供应合成文档/worker脚本；protocol handler也复验活动域和GET。不创建真实userData或改变首版匿名GET/HEAD限制。

- `/update.js`内存主脚本v1实际激活：active state=activated，回传version=1、UUID及安装事件结果；不只看register resolve。
- 主脚本实际字节改为v2，update后active version=2且UUID改变，protocol记录版本2。每版安装事件GET均进入Session xhr hook（ID/frame缺失）并新增代理拨号1；POST hook拒绝、未新增拨号，HTTP0。
- 安装期顶层HTTPS import使用独立`/install-only/` scope；更新v3顶层HTTPS import使用已存在scope。两次远端import均进入真实script hook（ID/frame缺失），各新增代理DNS与数值拨号1，hookCoverageGap=false，HTTP0，脚本求值/更新失败。
- 失败的v3更新后，实际active仍为v2及其原UUID。失败安装或update返回不能当成新版本可用。

这证明本机这两个**import路径可观察**及内存脚本v1/v2真实安装/激活，不证明HTTPS主SW脚本安装/更新成功或全面覆盖。SW import未触发app certificate-error逐URL事件，原始错误是script evaluation failed，不能只凭TypeError确定每次精确证书错误码；默认Chromium信任未改变、受控TLS下失败和HTTP0仅是负例。已有installed SW动态新import脚本map负例仍与这次安装/更新路径分别解释。

## 退出失败及有界观测

| run | PID / native退出 | 结果 |
|---|---|---|
| green-sw-r1 | 34136 / 1 | 7记录；全域revoke/destroy/清理均尝试，cookies0、隧道已关闭、peer0，但B即时running snapshot非空。errors保留，走异常app.exit1；不算生命周期GREEN。 |
| green-sw-r2 | 9468 / 0 | 7记录/errors=[]，真实will-quit/quit及launcher门槛通过；两个即时快照恰好为空，未验证状态迟到原因。 |
| green-sw-r3 | 10672 / 0 | 最终7记录/errors=[]；补全域清理后才等待、操作/事件时间及放行前全域复验；A有界观测34ms后为空，B0ms；正式退出事件通过。 |

首轮失败后核对固定Electron API：ServiceWorkers有running状态事件和查询，没有本次可用的stop方法；clearStorageData promise不等于同步主进程running快照为空。只做一次有界状态观测修正，零生产修复。r3支持快照需要异步等待的解释，未证明r1内部精确时序原因，不删除旧错误转绿，不加禁Worker或扩大等待。

最终原型在before-quit同步preventDefault/锁重入；首个await前全部域ready=false/revoked/abort并触发proxy revoke，再destroy全部view，不等待网页beforeunload。全部域各五项清理逐项捕获，先尝试全部域才逐域有界观察最多3秒（当前两域序列最多6秒，不是总退出3秒上限）；超时/查询/清理失败保留errors，拒绝正常退出GREEN。记录初始running workers、状态事件、各清理resolve时间、最终快照，并在放行退出前复验全域为空。B自身即时清理快照仍非空，waitedMs=0仅表示轮到最终检查时已空，不表示B同步清理完成。

r3真实beforeQuit=3、cleanupRuns=1、reentryBlocked=1、willQuit=1、quit=1/exitCode0；beforeUnloadEvents=0。两个域cookies及running workers为空，Node已验证存量GET TLS客户端destroyed，剩余自有peer0。launcher另校验原始errors、事件及锁门槛，避免进程exit0掩盖JSON失败。正常GREEN未调用app.exit；异常fallback的quit事件不冒充正常退出。`destroy`不发beforeunload及Windows系统退出不保证app事件均来自[固定BrowserWindow文档](https://raw.githubusercontent.com/electron/electron/v43.1.0/docs/api/browser-window.md)、[固定App文档](https://raw.githubusercontent.com/electron/electron/v43.1.0/docs/api/app.md)；状态事件见[固定ServiceWorkers文档](https://raw.githubusercontent.com/electron/electron/v43.1.0/docs/api/service-workers.md)。

## 审查、验证及最小下一步

独立session_epoch_security_review先审诊断和原型顺序，要求launcher原始证据门槛、全域清理后等待、放行前复验及精确SW版本；均落实。最终只读复审核对r1失败与r3原始记录/脚本：无新增Critical/Required，可交付有限原型证据，生产HOLD；审查者未运行native或改文件。最终输入SHA256为`8a7b32f9c918b0ed82e709a5f062fbbaf54e12ed00a3cb91cd7c00e4eb6346a9`。脚本及launcher语法、归档哈希、记录PID退出及Git范围检查随提交验证；产品代码未变，不将历史131/全量/build结果写成本阶段新执行。

**仍HOLD**：可信Chromium TLS及其已有隧道POST、HTTPS主SW脚本安装/更新/导航预加载、完整跨协议出口、生产owner/ShutdownCoordinator、清理失败注入、Windows系统关机/注销/崩溃及多平台未验证。

最小下一步：当前环境可先做夹具首域清理失败注入，断言仍清后域、全域持续deny且不伪报正常退出；另对准备await取消点补原生生命周期记录。可信TLS正例需要受控HTTPS目标，其证书链由系统原有信任支持、正常DNS答案全过现有公网策略且能部署固定SW测试脚本；满足前再跑同源HTTPS主SW安装/更新、真实已有TLS隧道POST拒绝和GET/HEAD允许。没有这个前提就维持缺口，不安装根、不改网络、不硬编码公网IP绕DNS。全协议出口抓包及生产接线是后续独立门槛，本次不提前实施。

首域失败注入已在[网络独立负例](browser-cleanup-failure.md)续接：A异步拒绝一次，B原生清理完成，聚合cleanup_failed/native exit1保留、未放行正常退出；独立复审两项Required关闭。此项不再列为完全未测，正常退出、异步失败的有限夹具证据分别保留，生产参与者接线与其他失败/超时种类仍未验证。可信TLS/DNS依赖验证按用户要求暂停。
