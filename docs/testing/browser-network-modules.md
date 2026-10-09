# 匿名浏览器网络模块验证

> 证据阶段：2026-10-04
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与范围

本阶段新增独立 `src/main/browser` 网络模块及测试，不接入 IPC/preload/Bootstrap/BrowserService/UI，不改 R1/backend/CI。后续[第二阶段证据](browser-network-phase2.md)表明 dedicated worker GET 可能被记为宿主 xhr 并接受；[DNS 预算修复](browser-dns-budget.md)表明准备槽不等于实际未完成解析数。首阶段通过不得覆盖这些后续发现。

## 2. 模块契约与责任边界

- `public-network-target`：Node BlockList 保守 IPv4/IPv6 全球单播分类，拒绝特殊用途、mapped/translated/zone 地址。CONNECT authority 要求显式 443，拒绝 URL/userinfo/path/encoding/trailing dot/非法 DNS label。保守策略可能拒绝部分全球可达特殊地址，也不能识别公网地址上的组织内部服务。
- `browser-request-policy`：精确 WebContentsId + AbortSignal，严格 HTTPS GET/HEAD 与资源白名单；unknown/foreign/归属不明和关闭后请求拒绝。纯策略没有 DNS/连接权，不能证明 Chromium 全入口覆盖。
- `authenticated-connect-proxy`：Main-only factory、127.0.0.1 随机端口、随机内存 Basic 凭据、每 binding 独立 realm。仅精确 proxy challenge 发凭据；拒绝目标/外来/未知 challenge、HTTP forwarding/upgrade、重复 Auth/Host 和 authority 歧义。
- 全部 DNS 答案校验，拒绝 mixed/empty/error/family mismatch；只拨一个已审数值 IP，不二次 hostname lookup，核验 remoteAddress。准备 10s、header 4KiB、connection 64/preparing 32。拒绝响应 flush 后 destroy，1s 不可延长兜底。revoke 先失效、取消等待、销毁 connecting/connected socket、关 listener，重复返回同 cleanup 结果。

owner 身份与 signal 在构造时快照。注入 resolver/dialer 只允许可信 Main 使用，不能成为 renderer/model authority。宿主 top frame/profile/conversation/有效注册、Session 代理/单一 webRequest handler、全局导航/证书/permission/shutdown 不由这三个模块代办。proxy 不解密 TLS，HTTP 方法必须由专用 Session gate 限制。凭据不进入 DTO/URL/log/metadata。

## 3. 技术反例与最终验证

实际回归发现：可变 owner 输入可改变身份；拒绝连接只 end 写半边时，恶意 peer 持续占槽，64 个拒绝连接后第 65 个合法请求无响应。分别通过身份快照，以及 flush 后 destroy + 1s 固定兜底修复。真实 TCP 半开反例由独立审查发现；不会把普通 FIN 当完整关闭。

测试夹具的非法 GET request-target 与 `it.each` 数组展开导致的无效 DNS 参数已修正为合法绝对 request-target 和对象案例；无效旧参数不算验收。模块缺失造成的 suite failure 也不算行为断言。

| 最终检查 | 历史结果 |
| --- | --- |
| 六源码/测试模块定向 | 126/126 passed，exit 0 |
| 六文件严格 types、renderer/schema | exit 0 |
| 完整 build | storage boundary/Main/preload/CLI/renderer exit 0，保留 chunk 警告 |
| 既有完整 runner | 618 files、6185 passed / 0 failed / 2 skipped，6187 total；exit 0，390.21s |
| 独立只读审查 | 修复前另跑 125/125 并发现半开 Important；修复后完整回归通过，无未处理 Important |

两个 skip 为真实 Windows 8.3 alias 不可用和 file-symlink `ERROR_PRIVILEGE_NOT_HELD(1314)`。未改边界测试、timeout、门槛或 CI；生成 snapshot 仅换行表示变化、无内容差异。原始日志在当时仓库外证据目录，不在正文逐轮列出。

## 4. 真实 Electron 消费探针

`r2`：Electron 43.1.0 / Chromium 150.0.7871.47 / Node 24.18.0，exit 0，5 记录、errors 空。只消费编译模块，不启动产品 Main/bridge；隐藏独立 BrowserWindow、专用内存 Session/QA profile、无真实用户数据。

- renderer fetch POST 被实际 onBeforeRequest 识别为 method POST/resourceType xhr/WebContentsId 1，策略 false，origin/dial 0。
- GET 的真实 proxy challenge 仅在 isProxy/basic/精确 WebContentsId 时获取临时凭据；两次 dial 均为 `93.184.216.34/family4/443`，夹具映射到实际 loopback echo，TLS 字节回显故意导致 `ERR_SSL_PROTOCOL_ERROR`，不构成 TLS/页面成功。
- revoke 后 GET 为 `ERR_BLOCKED_BY_CLIENT`，dial 保持 2；fixture 的 connection/storage/cache/auth/resolver 清理完成，只说明该生命周期。

初始未加载 fixture 文档导致 executeJavaScript 等待页面而超时；先加载受控 about:blank 后再安装策略解决，未给产品增加 scheme 例外。探针版本语义见[Electron 固定 API](https://github.com/electron/electron/blob/v43.1.0/docs/api/web-contents.md#contentsexecutejavascriptcode-usergesture)。

## 5. 验收限制与后续计划

真实 proxy frontend/echo 为本机 TCP，resolver/dialer/remoteAddress 有明确注入；默认数值 dial 路径只核对源码/类型。IPv6 分类使用真实 BlockList，未连真实 IPv6 公网；手工 Socket 事件不等于 OS connect 竞态。10s 准备与 1s 收尾尚无悬挂 resolver/写背压精确耗时验收。

N3 尚需真实多 Session 缓存/worker challenge；N4 需默认 numeric socket、mixed DNS/rebinding/redirect；N5 需 iframe/form/beacon/worker/SW 和正常 GET/HEAD；N6 需 OS 连接/迟到 DNS/缓存竞态；N1/N2 需特殊地址及 proxy failure 无回退；N7 需 UDP/TCP 同探针正例及出口观察；N8 需 TLS/mTLS、设备/捕获/下载；N9/N10 需持续回写、清理失败和实际 shutdown。

当时生产 gate 关闭，模块不形成可用浏览入口，也不允许系统浏览器回退。后续各阶段必须独立提供证据，不能用单元数量或历史 probe 数量补齐原生/网络门槛。
