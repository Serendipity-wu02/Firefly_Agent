# N5/N9 受控可信 HTTPS origin 最小设施提案

2026-10-05。仅提案：没有部署、注册账户、购买域名、生成凭据或发送夹具数据。
用户目的为补现有受限浏览器的真实HTTPS SW证据；保留SW政策与生产gate off。
设施建成也不自动通过N5/N9，不作为全接口出口/N7证明。

## 两个可选路径

首选用户已有、可变更固定脚本并取得完整请求日志的自有HTTPS测试origin。
域名必须由用户明确提供，现无已核验的自有域名，不推测标识。前提是原有受信任
证书、实际Main DNS全A/AAAA答案均满足现有公网策略、正常hostname Chromium TLS；
只加专用`/r/<合成runId>/`测试路径。若现有设施满足，不买新域名、不改DNS/OS信任。

若没有已有origin，推荐一个临时Cloudflare Worker，使用平台现有`workers.dev`域名。
地址形式为`https://<用户批准的Worker名>.<用户现有Workers子域>.workers.dev/r/<runId>/`。
这只是待确认格式，不是已存在/已获准URL。Worker与子域名取自用户实际账户；
不将示例名当作账号标识。平台域名避免购买域名或把用户DNS zone迁入Cloudflare。
[官方域名规则](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
说明账号子域和Worker路由格式，地址启用后公开可达；仅作短期非生产QA。

Free额度内预计新增费用US$0：当前官方为100,000请求/天、CPU10ms/次。
本提案测试最多200请求/轮，固定小响应和小日志，无DB/KV/R2/Queues/付费附加资源。
用户账户实际套餐、已有用量和可用域名尚未核验；不承诺未知账号总账单为零。
不自动升付费；额度/地区网络/默认TLS不满足即停。价格依据
[官方Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)。

## 需要明确批准的最小权限和副作用

用户选定其拥有的账户、Worker名及实际测试域名，并允许这个临时Worker的创建、
v1/v2两次受控版本部署、该Worker请求日志查看/导出、验收后停用及删除。
最短路径由账户负责人通过已有dashboard部署，Codex不读取账户凭据。
不需要DNS zone编辑、系统管理员、根证书、OS代理/TUN、付款升级、生产配置或新账户。
若未来选择API自动化，届时核验该账户实际提供的最小权限；当前不生成API token，
也不假定提供者支持细到单Worker的token作用域。

这是新外部服务与有限合成写请求，因此在执行前需要用户对最终URL、200请求上限、
数据内容及部署/日志/销毁动作的直接批准。该批准点来自本次“先提案、不部署”的
明确指令；现有普通两站GET授权不能扩成部署或向该origin写入。

## 固定endpoint和数据

| 路径 | 行为/用途 |
|---|---|
| `/r/<runId>/page`、`/frame` | 固定HTML，普通main/iframe对照，无远端依赖 |
| `/r/<runId>/dedicated.js`、`/shared.js`、`/import.js` | 同源固定worker脚本；按限定次数发合成GET/HEAD和不安全方法探针 |
| `/r/<runId>/sw.js` | 主SW脚本，固定路径；第二次部署改变v1→v2实际内容，验证同注册的update/install/activate，不仅换查询参数冒充update |
| `/r/<runId>/preload`、`/tick` | navigation-preload及有限晚写/晚fetch的唯一观察点 |
| `/r/<runId>/probe` | 正对照允许固定合成POST/PUT/DELETE；产品受限侧应阻断，origin日志验证实际到达数为0 |

每个endpoint只接受固定run路径与有限方法，不提供任意URL代理、文件或账号功能。
设置固定CSP和`worker-src 'self'`，不禁用既定SW能力；SW脚本`Cache-Control:no-store`，
scope限于本轮`/r/<runId>/`。正常证书和完整DNS预检失败就停，不放行坏证书/私网答案。
同一版本源文件SHA、响应版本、脚本实际安装激活状态和受控部署时间一起保留。

对外发送的仅为：非秘密runId/序号、固定`ff-qa`合成文本（每请求≤1KiB）、方法、
路径和有限版本号。页面本地种入合成cookie/IDB/CacheStorage；不上传线程、用户文件、
登录cookie、凭据或生产userData。正常HTTPS仍向托管商暴露出口IP、User-Agent等基础
连接/请求元数据，不能称“无数据离机”。自写日志只记runId、序号、方法、固定路径、
版本、状态、时间及字节数，不记Authorization、cookie、body原文或IP。

## 有限验收和可信证据

1. 预检实际域名、全DNS答案、数值dial及原hostname默认TLS；无override。失败停。
2. 同probe正例在独立匿名QA control Session中，通过同一正常TLS/代理路径让自有
   origin实际收到合成请求；只在QA对照侧改变request policy，不修改产品门禁。
3. 产品受限Session中分别执行main/iframe/dedicated/shared/SW GET/HEAD及不安全方法。
   记录真实hook、方法、owner/binding及origin计数；不能用JS TypeError或server405
   代替“未到达”。正例不触达则相应负例不合格。
4. 主HTTPS SW v1实际install/activate→同路径v2实际update/activate，触发navigation
   preload；持有旧SW/存储writer时撤销owner，分别记录本地销毁、清理预算、状态、
   revoke序号及origin的晚nonce。有限writer最多20次/≤3秒，不做无限写回矩阵。
5. 双域A/B使用不同run路径和匿名Session，A撤销不影响B正例；正常退出清理后导出
   原始origin日志及本机事件、精确SHA。本机与远端时间不能直接当同一时钟，靠run/序号/
   nonce关联。不将采样日志的“没看到”当0；完整采集须预验证同路径同方法正例。

日志应对该Worker配置100%采样、固定测试窗口导出并检查丢失/限额，不能仅凭实时tail
没有输出证明没有请求。当前官方支持console及invocation日志与采样配置，见
[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)。
若无法形成完整受控origin计数，则只归为可信TLS观察而非完整E3。
验收结束立即停用测试路由/Worker、移除QA SW/非持久Session；日志按账户实际保留策略
处理并说明平台保留，不能承诺远端日志瞬时全部删除。

可审阅的交付为部署前的固定脚本/版本清单、最终URL、权限清单和请求预算；本提案
目前没有创建这些部署文件或服务。实际账户/domain未知，实施阶段必须先核对这些输入。
