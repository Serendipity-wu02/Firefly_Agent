# 依赖与归档安全维护

当前依赖及版本以根目录 `package.json` 和 `package-lock.json` 为准；来源和许可见 [第三方说明](../../THIRD_PARTY_NOTICES.md)。历史审计及阶段测试结论在 [归档索引](../archive/README.md)，不代表当前依赖安全认证。

执行 `npm audit` 时保留真实退出码与完整报告；区分漏洞、网络错误与安装失败，不通过降低阈值隐藏问题。版本修改后验证实际依赖树及受影响测试，必要时在隔离目录验证 `npm ci`。

项目 ZIP 落盘入口是 `src/shared/zip-extraction.ts`，使用 `yauzl` 解析。保留路径边界、链接拒绝、重复条目限制、预算、临时目录隔离、失败清理及既有文件保护。安全回归与正常归档回归都必须通过。

MinGit 归档处理复用该入口；当前 Skills 按目录分发并通过 manifest 校验，旧 ZIP 哈希仅作来源记录，不将校验成功当成来源或许可核实。

构建及脚本命令见 [开发说明](../../DEVELOPMENT.md) 和 [脚本入口](../../scripts/README.md)。`npm test` 不包含 Node 包装脚本测试，须另行运行 `node --test scripts/packaging/*.test.mjs`。安装器配置检查不代表实际安装、升级或公开发布验收通过。
