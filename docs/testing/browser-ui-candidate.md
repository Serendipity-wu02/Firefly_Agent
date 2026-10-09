# 浏览器关闭态 UI 候选验收

> 证据阶段：2026-10-04
> 文档整理：2026-10-07；仅整理既有证据，未重跑测试。
> 适用边界：下述实现、通过项与 HOLD 均指记录阶段，不代表当前产品状态。

## 1. 背景与范围

该候选整合既定 UI 与浏览器 Session/epoch 契约，仅提供浏览器关闭态界面。原生历史 backend 与其未完成探针不在本阶段范围；不将合成 UI 验收解释为网络可用。

## 2. 已验证交互与权限边界

已有 Chat/Work/Code 会话右上角入口在既有单一 Inspector 中打开可关闭标签，与文件树、预览、Diff、计划共用布局。地址可编辑，前往/后退/前进/刷新及 Enter 导航禁用，显示“浏览器暂不可用：网络安全验证尚未完成。”关闭、收起或切换会话释放本地地址草稿，聊天草稿沿用既有行为。

Main 通过 IpcScope 注册只读 `browser:availability`，preload 仅 `manualBrowser.getAvailability()`，固定 DTO `{available:false, reason:"network_unavailable"}`。没有 URL 导航、guest 创建、layout 控制、proxy 凭据或 model browser API；当时未装配 BrowserService/navigation/login/shutdown，生产网络 gate HOLD。

## 3. 自动验证与技术失败条件

共享 DTO/关闭面板和实际 Inspector 接线都有行为 RED/GREEN，最终定向 5 files / 25 passed、exit0；完整 631 files / 6327 passed / 2 skipped，6329 total、404.23s、exit0。Main/preload/renderer noEmit、5 个新增/相关测试严格 types 与完整 build 均 exit0，保留 Vite large-chunk 提示。

额外 test strict config 在工作树外无法解析 `vite/client`，普通 require.resolve 又不适用于其 types-only export；最终明确使用已安装 `vite/client.d.ts` 与 @types 后通过，未复制依赖或改项目配置。独立只读审查无 Critical/Required/Important，diff check 及宽/最小窗口检查通过；不重复计入此前 domain 审查。

## 4. 有限 GUI 验收

全新独立 profile，实际 appData/userData/sessionData/logs 路径均经 wrapper 核验。使用已安装 Playwright/Electron 与候选自己的编译输出，隐藏不可聚焦窗口；QA 守护阻止外部网络、系统对话框、原生菜单/快捷键及前台激活。没有读取真实用户数据、模型/API、登录或用户窗口。

结果为 11 项通过、0 失败、1 受阻，renderer errors0；6 张实际 offscreen paint 截图有序号/尺寸/3px freshness marker 并逐张检查。前后 GetForegroundWindow 句柄相同只是采样，不证明全程无前台影响。

| 范围 | 结果 |
| --- | --- |
| 隔离路径/非聚焦窗口、既有历史/头像/侧栏/聊天草稿 | 通过 |
| Main→preload 不可用 DTO、单一 Inspector、Enter/4 命令禁用、零网络、Tab/ShiftTab | 通过 |
| 关闭重开与 A→B→A 不复活地址/标签、保留聊天草稿 | 通过 |
| pending 查询关闭后迟到回复 | 不复活标签；仅 QA handler 注入时序并恢复 |
| 真实绑定 fixture 文件树/预览共存和关闭回退 | 通过 |
| 960×540 命中区域、输入可见、无文档横向溢出 | 通过 |
| 未验证 API 状态打开真实设置，无自动 transport | 通过 |
| 匿名 about:blank 本地绘制 | QA-only BrowserWindow 通过，不是产品 guest/网络验收 |
| 真实网络/native guest、OS foreground/tray | 受阻/未验收 |

settings 原始 `status` 被 lamp 值 `unverified` 覆盖，reviewed JSON 仅将字段改名 lampState并注明修正，原始数据保留，未改检查结果。证据含 JSON/guard wrapper/driver/实际路径与 paint metadata，见[fixtures](fixtures/browser-ui-candidate)。6 张 PNG 仅保留在当时仓库外证据目录，未上传或纳入版本控制，不表示当前仓库可访问。

## 5. 验收限制与后续要求

真实导航、登录、下载、证书/公共 DNS、BrowserService/native 生命周期、原生前台鼠标键盘/tray/tooltip、真实 model/API 未验收。英文/深色、外部 Main 配置缓存、未知 provider 风险、跨进程未发送草稿持久化仍属原范围限制，未扩充设计。

完整测试使用核验 Bash、专用 TEMP 与所需正常进程权限，未调整测试/CI。后续需分别验收真实 service、共享路径和原生网络，不能由关闭态 UI 的 11 项通过推导生产可用或当前仍关闭。
