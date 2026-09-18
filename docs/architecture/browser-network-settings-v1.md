# Firefly V1.1.1 — Browser Network Settings V1

## 状态与冻结边界

本文件记录 Browser 网络设置的当前实现。版本保持 `1.1.1`，工作树基线是
`firefly-v1.1.0`、HEAD `30ac278cdf0f7419510ae575737ab0ee44d1d744`。设置由
`SettingsManager` 唯一持久化；Browser 静态读取工具已经在 Main 组合根注册，但设置加载、
保存和页面编辑本身不发起 DNS、连接或网页请求。本轮没有修改系统代理、DNS、Clash、TUN、
hosts、TTS、音乐或用户数据。

## 实际契约

新增共享类型位于 `src/shared/settings-types.ts`：

- `BrowserSettings`：有效、规范化的设置值。`transportMode` 只有 `direct` 和
  `http_proxy`；代理值复用 `src/shared/browser-types.ts` 的 `BrowserProxyEndpoint`，不含
  用户名、密码或凭据引用；`allowedOrigins` 是精确规范化 Origin 列表，默认为空。
- `BrowserSettingsUpdate`：Settings IPC 的输入契约。代理端点以文本输入，交给 Main
  权威规范化；直连不接受代理字段。
- `BrowserSettingsSnapshot`：返回给 Renderer 的状态快照，包含 `revision`。状态为
  `default`、`configured` 或 `unavailable`。
- `FireflySettingsSnapshot.browser` 和 `FireflySettingsUpdate.browser`：本轮新增的
  Settings 字段；持久化键名为 `browser`。

有效代理配置在 `settings.json` 中的形状是：

```json
{
  "browser": {
    "transportMode": "http_proxy",
    "allowedOrigins": ["https://example.com"],
    "httpProxy": {
      "protocol": "http:",
      "hostname": "127.0.0.1",
      "port": 18080
    }
  }
}
```

`httpProxy` 的规范化规则唯一复用 `src/main/browser/browser-policy.ts` 的
`normalizeBrowserProxyEndpoint()`：HTTP、显式数字端口 `1..65535`、空路径或 `/`，拒绝
HTTPS/SOCKS、缺失端口、凭据、查询、片段和其他路径。Settings 保存只执行 URL 解析与
规范化，不调用 DNS，不建立 socket，不读取系统或环境代理。

## 所有权与调用关系

```text
SettingsView
  -> window.settings.save({ browser: BrowserSettingsUpdate })
  -> existing SETTINGS_SAVE IPC
  -> registerWindowAndSettingsIpc()
  -> SettingsManager.save()
     -> normalizeBrowserProxyEndpoint()
     -> write the single settings.json owner
  -> SettingsManager.load()/getSnapshot()
  -> existing SETTINGS_CHANGED broadcast
  -> SettingsView live snapshot
```

`src/main/settings/settings-manager.ts` 是唯一的持久化和有效配置状态所有者。现有
`SETTINGS_LOAD`、`SETTINGS_SAVE`、`SETTINGS_CHANGED` 频道没有增加或替换；
`src/main/application/default-dependencies.ts` 仍通过同一个 `SettingsManager` 处理请求。
Renderer 的提示只用于即时反馈，不能替代 Main 校验。模型输入、网页内容和 Browser 后端
本轮都不能选择或修改这个设置。

## 缺失、损坏与保存语义

- 用户设置文件没有 `browser` 字段时，快照为 `status: "default"`、有效配置为直连。
  `src/main/settings/settings.example.json` 不增加该字段，因此示例配置的缺失也继续走
  这个默认状态；旧的有效 Browser 段缺少 `allowedOrigins` 时迁移为空列表。
- 已有 `browser` 字段但结构、模式或代理端点不符合契约时，快照为
  `status: "unavailable"`、`reason: "invalid_saved_configuration"`。不会静默变成直连；
  原始损坏字段会在与 Browser 无关的保存时保留，直到用户显式保存新的有效 Browser 设置。
- 代理模式缺少端点或端点非法时，`SettingsManager.save()` 在写文件和内存状态变化前
  返回 `false`。原有效配置、修订号及其他一起提交的设置不因这次非法 Browser 更新而改变。
- 正常保存仍使用原有整体 JSON 写回方式，其他设置字段和既有权限迁移保持不变。

## 修订号与快照

`SettingsManager` 在每个进程内维护 `browserSettingsRevision`，首次加载建立为 `1`。
修订号不是授权，也不跨进程持久化。比较身份时使用有效网络配置的规范化值：

- 直连身份为 `direct`；
- HTTP 代理身份为规范化的 `http://host:port`，IPv6 使用括号；
- 两种模式的身份都包含去重、排序后的 `allowedOrigins`；
- 同一规范化配置、无关 Settings 保存及 `SettingsManager.load()` 重读不递增；
- 有效配置实际改变才递增，`A -> B -> A` 仍保持单调递增，不回到旧值；
- 从损坏状态修复为有效配置也产生一次变化。

`getBrowserSettingsSnapshot()` 返回的顶层对象、有效设置对象和代理端点对象均为冻结副本。
调用方不能通过修改快照改变 SettingsManager 的当前状态。读取任务应绑定启动时的有效快照；
Settings 模块不直接修改 Approval 或在途 Browser 任务，配置变化由组合根通知 BrowserReadService
执行失效和取消。

## 设置页范围

`src/renderer/ui/components/SettingsView.tsx` 新增 `data-browser-network-settings` 区域，
  提供直连和 HTTP 代理选择、端点文本框及一行一个的精确允许 Origin 列表，不添加连接测试按钮。页面说明明确：

- 直连不自动采用系统代理、环境变量、PAC 或 Clash；
- HTTP 代理由用户显式指定并负责解析网页域名，Firefly 不独立观察代理连接的网页 IP；
- 保存设置不代表连接测试成功；Browser 只接受当前用户 Chat 消息明确提供的网页地址，
  并仍须经过授权与沙箱。

`src/renderer/ui/App.tsx` 复用原 Settings load/save/change 通道，保存失败不会显示成功；
已损坏快照会显示不可用提示，但仅在用户明确保存有效替代值后才恢复有效状态。

## 测试与未执行项目

新增 `tools/test/runtime/browser-settings.test.ts`，并接入 `package.json` 的默认 `test`
命令。测试使用临时 Settings 文件，覆盖：

1. 缺少字段的直连默认；
2. 直连和 HTTP 代理规范化保存、重载及持久化形状；
3. 缺失端点、协议、端口、凭据和路径等非法输入的 Main 拒绝及原配置保持；
4. 已损坏配置的 `unavailable` 状态、无关保存保留和显式修复；
5. 规范化身份、无关保存、`A -> B -> A` 修订号和冻结快照；
6. Settings 校验无 DNS/连接调用，Browser 允许 Origin 精确匹配、非法保存保持原配置，
   以及有效网络设置变更使配置修订号递增。

`tools/test/runtime/browser-production-integration.test.ts` 使用受控传输、实际授权管线、
实际 `browser_read` 工具和解析器验证生产路由；不访问公网。公网读取、真实代理和设置页 GUI
仍需单独人工验收。

本轮自动验证项目由最终报告列出。没有执行 GUI 设置页人工操作、Browser 公网读取或真实
代理连接。`BrowserSettingsSnapshot` 为 `unavailable` 时生产路由明确失败；编辑态直连值不会
替代损坏配置。Browser 工具、Capability、Sandbox Profile 与 Harness 动态路由的实际生产
状态见 `browser-authorization-contracts-v1.md` 的当前接入章节。
