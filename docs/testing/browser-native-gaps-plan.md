# Windows 原生浏览器验收缺口计划

> 记录阶段：2026-10-05
> 文档整理：2026-10-07；以下为当时计划及已记录结果，未进行当前复测。
> 历史结论：N3/N10 有限条款获得证据；完整 N1–N10 与生产 gate 仍未闭合。
> 适用边界：以上与下文均指记录阶段，不代表当前产品状态；历史 gate/HOLD 不作为当前启用判定。

## 1. 背景与验证边界

既有两站 TLS/UI 矩阵不重复执行。每个原生运行使用全新专用 smoke profile、隐藏且不可聚焦宿主，以及实际 Main ownership、Session、guest 和 IPC。生产 gate、shared/renderer、正常 TLS 验证、选定 Main DNS `192.168.31.1` 与系统 TUN 配置保持不变。

## 2. 计划矩阵

| 门槛 | 独立验证内容 | 验收目的 |
| --- | --- | --- |
| N1/N7 | 自有活动 IPv4/IPv6 接口 sink、正例、native fetch/frame/RTC/WebTransport；仅自身新进程 Session netLog metadata | 区分目标真实可达与没有观察到流量，验证本地服务访问和旁路边界 |
| N3 | 未注册原生 Session 使用真实 authenticated proxy，观察凭据拒绝，不记录凭据值 | 防止跨会话借用网络能力 |
| N6 | 延迟 proxy/setup/native DNS 答案，取消精确 owner 后释放迟到工作；观察旧 socket/view 关闭与晚拨号 | 验证关闭或切换后不再启动请求 |
| N8 | 自有 profile 的下载拒绝，以及可达且已核验的匿名 Basic/client-cert 挑战 | 验证文件、凭据提示与客户端证书身份边界 |
| N10 | 真实原生资源与 SDK 清理拒绝/永不完成注入；记录 coordinator 阶段与最终动作 | 有界退出、失败可见、失败资源不得静默复用 |
| N4/N5/N9 | 先审阅 WPT/httpbin 官方资源；HTTPS worker、更新、late-writer 需实际可控脚本 | 验证 worker 请求和清理后状态回写边界 |

自身 Session 的默认 netLog 仅是应用元数据，不等于全机抓包。自有接口 sink 不能认证任意公网 QUIC 目标。不得为验收新增驱动、根证书、OS 设置或采集其他应用流量。公共脚本先审阅，不创建账户或执行公网写入。

## 3. 变更与证据要求

发现产品缺陷时，先取得直接 RED，再作最小修复并运行相关类型/测试/build和独立只读审查。夹具新增不构成 renderer 测试能力或产品 IPC 扩展。若设施无法支持更新、回写或 rebinding，应列出所缺受控 HTTPS 目标条件，不能降低门槛。

## 4. 已记录结果与限制

2026-10-05 的有限执行聚焦 N3/N10：

- N3 `n3-r4`：native exit 0，12 记录；真实自有 socket 正例及 native 401 挑战。地址、端口与精确 GET 替换明确属于 E2，不能计为 E3。
- N10 五组原生运行覆盖清理拒绝、浏览器超时、七阶段拒绝、总 deadline 和 quit 重入；`cleanup_failed` 独立于 exit 0 保留。
- 原生宿主销毁暴露 owner 失效监听异常；直接 RED/GREEN 验证后，修复为保存注册时的精确 WebContents ID。
- Browser 288 测试、类型和 build 通过；全量为 6513 通过、14 个继承 TEMP 前置条件失败、2 跳过，不能写为全量 GREEN。
- 独立审查无 Critical/Important；N10 初始动作身份只能证明单次调用，不能证明两个不同回调选择首个。

详细数据与后续边界见[N3/N10 报告](browser-native-n3-n10.md)。N7/N9 所需设施及生产启用仍是独立待验收条件。
