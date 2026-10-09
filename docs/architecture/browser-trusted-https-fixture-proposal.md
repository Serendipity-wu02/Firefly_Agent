# N5 与 N9 可信 HTTPS 验证设施方案

- **方案日期**：2026-10-05
- **状态**：未部署的设施提案
- **目标**：补充受限浏览器的真实 HTTPS worker 方法边界、SW 生命周期及撤销证据
- **边界**：设施部署本身不构成 N5/N9 通过，也不证明 N7 全接口出口安全

## 1. 背景与设施选择

已有局部 TLS、Session 与存储证据仍不足以证明可信 HTTPS 主 SW 脚本安装、更新和撤销后的有限晚写行为。本方案提供受控 origin，使客户端事件与服务端真实计数可以关联。

优先使用已有、可修改固定脚本并导出完整请求日志的自有 HTTPS origin。实际域名须明确核验；前提是已有可信证书、Main DNS 的全部 A/AAAA 答案满足公网策略，并通过原 hostname 的正常 Chromium TLS。只增加 `/r/<runId>/` 专用测试路径，不购买新域名或更改系统信任。

备用方案为临时 Cloudflare Worker，使用既有账户的 `workers.dev` 域名：

`https://<已批准的Worker名>.<实际Workers子域>.workers.dev/r/<runId>/`

该格式不是已存在或已获准 URL。Worker 名和子域须来自实际账户，不把示例当成标识。平台域名避免迁移用户 DNS zone；路由公开可达，仅用于短期非生产 QA。[官方域名规则](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

## 2. 预算与执行前置条件

2026-10-05 提案引用的 Free 额度为每天 100,000 请求、每次 CPU 10ms；该额度下计划新增费用为 US$0。每轮最多 200 请求，仅固定小响应和小日志，不使用 DB/KV/R2/Queues 或付费附加资源。账户套餐、已有用量及可用域名未核验，不承诺账户总账单为零；实施前须重新核对[官方 pricing](https://developers.cloudflare.com/workers/platform/pricing/)。

执行前确认实际账户、Worker 名、最终 URL、最多 200 请求、数据内容及下列动作范围：创建、v1/v2 受控部署、请求日志查看/导出、验收后停用和删除。可以由账户负责人在已有 dashboard 部署，无需读取账户凭据。

本方案不包含 DNS zone 编辑、系统管理员权限、根证书、OS 代理/TUN、付费升级、生产配置或新账户。若改用 API 自动化，必须另行核验最小权限及凭据流程，不能假定 token 支持单 Worker 作用域。额度、地区网络或默认 TLS 不满足时停止，不扩大设施或放宽策略。

截至方案记录，没有创建部署文件或服务，没有注册账户、购买域名、生成凭据或发送 fixture 数据。普通站点 GET 的许可不能扩展为外部服务部署或合成写请求。

## 3. 固定 endpoint 与数据契约

| 路径 | 行为与用途 |
| --- | --- |
| `/r/<runId>/page`、`/frame` | 固定 HTML；main/iframe 对照，无远端依赖 |
| `/r/<runId>/dedicated.js`、`/shared.js`、`/import.js` | 同源 worker；限次执行合成 GET/HEAD 与不安全方法探针 |
| `/r/<runId>/sw.js` | 固定主 SW 路径；v1 → v2 修改实际内容，验证同注册 update/install/activate |
| `/r/<runId>/preload`、`/tick` | navigation preload 及有限晚写/晚 fetch 观察点 |
| `/r/<runId>/probe` | 对照侧允许固定合成 POST/PUT/DELETE；受限侧应阻断，以 origin 计数核验 |

endpoint 仅接受固定 run 路径和有限方法，不提供任意 URL proxy、文件或账户能力。CSP 固定 `worker-src 'self'`，保留 SW 能力；SW 使用 `Cache-Control:no-store`，scope 限于 `/r/<runId>/`。不能只更换 query 参数冒充 SW 内容更新。

同一版本的源文件 SHA、响应版本、实际 install/activate 状态和部署时间共同留证。证书或完整 DNS 预检失败即停止，不放行坏证书或私网答案。

发送的数据仅包括非秘密 runId/序号、固定 `ff-qa` 文本（每请求 ≤1KiB）、方法、路径与有限版本号。本地只种入合成 cookie/IDB/CacheStorage，不上传线程、用户文件、真实登录 cookie、凭据或生产 userData。

正常 HTTPS 仍向托管商暴露出口 IP、User-Agent 等基础元数据。自写日志仅记 runId、序号、方法、固定路径、版本、状态、时间和字节数，不记录 Authorization、cookie、body 原文或 IP；不能称为“无数据离机”。

## 4. 验收方案

1. 预检实际域名、全部 DNS 答案、数值 dial 和原 hostname 正常 TLS，禁止 override。
2. 在独立匿名 QA control Session 中，通过相同 TLS/proxy 路径让 origin 实际收到同 probe 合成请求；只在 QA 对照侧改变 request policy，产品门禁不变。
3. 受限 Session 分别测试 main/iframe/dedicated/shared/SW 的 GET/HEAD 与不安全方法，关联 hook、方法、owner/binding 和 origin 计数。JS TypeError 或 server 405 不能替代“请求未到达”；对应正例不触达则负例不合格。
4. 主 HTTPS SW v1 实际 install/activate，再部署同路径 v2 并实际 update/activate，触发 navigation preload。保留旧 SW/存储 writer 时撤销 owner，记录销毁、清理预算、状态、revoke 序号和 origin 晚 nonce。writer 最多 20 次、持续 ≤3 秒。
5. 双域 A/B 使用不同 run 路径和匿名 Session，A 撤销不能破坏 B 正例。正常退出清理后关联 origin 与本机事件、精确 SHA，以 run/序号/nonce 对齐，不假定本机与远端是同一时钟。

## 5. 证据完整性与清理

Worker 日志配置 100% 采样，在固定窗口导出并检查丢失和限额。实时 tail 没有输出不能证明请求为 0；必须先验证同路径同方法正例的完整采集。[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

无法取得完整受控 origin 计数时，结果仅属于可信 TLS 观察，不构成完整 E3。验收结束停用路由/Worker，移除 QA SW 与非持久 Session；平台日志按实际保留策略处理，不承诺远端日志瞬时全部删除。

实施前的可审阅输入应包括固定脚本、版本清单、最终 URL、权限清单和请求预算。完成报告须分别列出通过、失败、未执行及受阻项，不将设施上线或负例表面失败等同于安全验收通过。
