# 插件市场产物与公开发布准备

## 当前交付范围

市场随应用提供离线目录与 `text-stats` 1.0.0 安装包。用户可以浏览随附条目并明确选择安装；安装后的插件仍保持停用，用户启用后才加载入口。文本统计使用现有 Plugin API v1 的 `text-stats_count` 工具，不申请宿主服务，不联网、不读写文件、不启动命令。完整统计口径见 [插件说明](../../examples/text-stats/README.md)。

随附目录不依赖公共服务器。公开 GitHub 目录与 Release 只是可以准备的发布目标；生成文件不表示资源已上传、地址可访问或在线市场已经上线。默认构建不猜测仓库、分支或 Release，也不配置任何远端来源。

## 离线构建

在仓库根目录，使用 Node 24（与项目 engines 一致）和已安装的项目依赖：

```bash
node scripts/plugin-marketplace/build.mjs
node --test scripts/plugin-marketplace/*.test.mjs
```

默认生成：

```text
resources/plugin-marketplace/
  registry.json
  text-stats-1.0.0.zip
```

主进程构建把该目录复制到 `dist/main/plugin-marketplace/`。`resources/plugin-marketplace/` 与 `dist/` 是构建产物，不应作为已部署的在线来源。需要单独查看生成结果时，可以指定 `--out-dir <本地输出目录>`，不会改写应用设置。

ZIP 只包含以下根目录文件：

```text
LICENSE
README.md
index.cjs
manifest.json
```

入口不依赖运行时 SDK 安装。`manifest.json` 使用宿主当前 `src/plugins/manifest.schema.json` 校验；还要求固定 ID、合法 SemVer、当前宿主 API 版本、入口名、空依赖和 `defaultEnabled: false`。

以后升级插件时，只需在源码 manifest 中递增合法 SemVer，再同步说明与版本相关测试；构建器会从 manifest 生成文件名与目录版本，没有锁死在 1.0.0。版本格式直接复用宿主规则。

可重复性：

- 文件条目与 JSON 字段顺序固定；不遍历或打包未列出的文件
- 文本内容归一化为 LF；不采集本机 mtime、权限或绝对路径
- ZIP 时间统一为 `1980-01-01T00:00:00.000Z`
- ZIP 平台为 UNIX，文件模式为 `0100644`，使用 STORE 方式避免压缩差异
- 从最终 ZIP 字节计算 SHA-256，写入目录条目
- 本地目录与公开目录引用相同 ZIP 字节；重新构建同样的源文件与锁定依赖可得到同样的哈希

目录格式为：

```json
{
  "apiVersion": 1,
  "plugins": [
    {
      "id": "text-stats",
      "name": "文本统计",
      "version": "1.0.0",
      "description": "由实际 manifest 读取",
      "author": "由实际 manifest 读取",
      "downloads": 0,
      "pluginApiVersion": 1,
      "capabilities": ["供用户阅读的能力说明"],
      "zip": "bundled:text-stats-1.0.0.zip",
      "sha256": "构建时由最终 ZIP 计算的 64 位十六进制哈希"
    }
  ]
}
```

上面仅说明字段，哈希占位文本不可作为真实目录使用。`downloads: 0` 表示本构建没有接入下载量统计，不是采集后的使用量。`pluginApiVersion` 是安装包要求的宿主 API 版本；最外层 `apiVersion` 是目录协议版本。

## 公开 GitHub 产物准备

必须显式提供仓库、Release tag、目录所在 ref 和独立输出目录。下面的 `YOUR_OWNER/YOUR_REPO`、`YOUR_RELEASE_TAG`、`YOUR_REGISTRY_REF` 都需要替换为发布者选定的实际值；不是已经存在的发布地址。

```bash
node scripts/plugin-marketplace/build.mjs --out-dir release/plugin-marketplace-public --repository YOUR_OWNER/YOUR_REPO --tag YOUR_RELEASE_TAG --registry-ref YOUR_REGISTRY_REF
```

此命令只写本地文件，不创建 Release、不推送代码、不上传附件、不测试网络，也不写 Firefly 用户配置。输出：

```text
release/plugin-marketplace-public/
  text-stats-1.0.0.zip
  marketplace-config.json
  marketplace/
    registry.json
```

公开目录的 ZIP 地址根据显式输入生成：

```text
https://github.com/YOUR_OWNER/YOUR_REPO/releases/download/YOUR_RELEASE_TAG/text-stats-1.0.0.zip
```

建议配置文件只有以下字段：

```json
{
  "registryUrls": [
    "https://raw.githubusercontent.com/YOUR_OWNER/YOUR_REPO/YOUR_REGISTRY_REF/marketplace/registry.json"
  ],
  "zipUrlPrefixes": [
    "https://github.com/YOUR_OWNER/YOUR_REPO/releases/download/"
  ]
}
```

Tag 和 ref 必须是安全的单一路径段（如 `plugins-v1.0.0`、`main`），或使用完整 commit SHA。含斜杠的 tag/ref（如 `plugins/v1.0.0`）会被拒绝，避免产生安装器不接受的编码路径分隔符。建议目录 ref 固定为已审核 commit 或不可变 tag，以便追溯。脚本拒绝不完整参数、额外 CLI 参数、重复参数、不合法 owner/repo、斜杠 tag/ref、空白、路径穿越、查询串与片段标识等输入。公开模式不得把默认随附目录作为输出目录。

## 发布者后续检查清单

以下是需要发布者另行批准并执行的步骤，本构建脚本不会执行：

1. 审核插件入口、manifest、README、许可证与目录元数据；记录本次 ZIP 的 SHA-256。
2. 在明确选定的 GitHub 仓库与 tag 下创建或使用 Release，把 ZIP 作为该 Release 的附件发布。
3. 把生成的 `marketplace/registry.json` 放到明确选定的目录 ref 的同名路径。不要把含 `bundled:` 地址的离线目录当作公共目录发布。
4. 在无仓库登录状态下验证目录 URL 与 ZIP URL 均可访问；下载实际公开的 ZIP 后重新计算 SHA-256，与公开目录中的值逐字比较。
5. 使用 Firefly 检查目录展示、预览和安装；确认首次安装停用，明确启用后能统计文本，停用后工具移除。
6. 验证以上步骤后再把建议配置用于产品的来源配置；目录参数只是准备结果，不是在线可用证明。

私有仓库或未发布 Release 可能导致 URL 无法公开读取；不能通过生成 URL 推断其可用性。来源允许列表应尽量限定到指定仓库，避免放开整个 GitHub 下载域。

## 信任与验证边界

SHA-256 用于校验目录与下载字节的一致性，不证明发布者可信。目录和 ZIP 同时被替换时，单独哈希无法提供独立真实性保证。Firefly 插件在主进程运行；`deps: []` 和“离线计算”是本插件实现的描述，不是操作系统沙箱或权限隔离。

自动测试覆盖确定性、ZIP 内容与实际宿主 manifest schema、公开地址拼接、参数拒绝、离线工具的 Unicode/空白/换行统计、工具清理与重新启用，以及不提供 Node、网络和计时器全局对象时的工具运行。真实 Electron 界面、公开托管可访问性、发布权限和外部发布操作必须分别验证，不能由这些构建测试推断通过。

## JavaScript API

```js
import { buildMarketplace } from "./scripts/plugin-marketplace/build.mjs";

const result = await buildMarketplace({ outDir: "/path/to/local/output" });
// result: { outDir, registryPath, zipPath, sha256 }

const publicResult = await buildMarketplace({
  outDir: "/path/to/public-preparation",
  repository: "YOUR_OWNER/YOUR_REPO",
  tag: "YOUR_RELEASE_TAG",
  registryRef: "YOUR_REGISTRY_REF",
});
// publicResult also includes configPath; still no network or publication.
```
