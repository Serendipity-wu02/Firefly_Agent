# Firefly 依赖安全升级 Differential Review

## 结论

基线 `d8757969ab97b49f250fdcead2be2a0723191d3d` → 本轮未提交工作树；没有新增提交。本报告按 differential-review 的历史追踪、逐差异审查、调用范围与攻击路径检查执行，不是独立第三方审计。

**建议：CONDITIONAL。** 本轮未发现新增 critical/high 安全回归；保留 **1 项 high 依赖风险（extract-zip，无上游修复发布）**。应用入口缓解与回归已实现，不能宣称整个依赖生态零漏洞或所有平台已验证。详见 [完整逐包报告](docs/refactor/2026-09-26-npm-audit-remediation.md)。

| 分类 | 数量 / 结论 |
|---|---|
| 新增 critical/high 回归 | 本轮审查未发现 |
| 仍存在 high 包告警 | 1，extract-zip；两个 advisory |
| 审查期间补齐的测试缺口 | 2：MinGit 真实 ZIP 策略、proxy-from-env 跨版本路由 |
| 独立于本轮的环境跳过 | 1：Windows 文件符号链接权限 |
| 审查方式 | DEEP：全部 11 个技术变更文件；两份交付文档另核对事实 |

## 文件范围与行为差异

| 文件 | 行为 / 风险与覆盖 |
|---|---|
| package.json | 最小修补版本、scoped overrides、移除无调用的 nut-js；js-yaml 5.x 移到 dev 但所有实例均修补。依赖变动为高影响面，不新增工具权限。 |
| package-lock.json | 逐项检查 30 个原路径版本变化、31 新节点、154 移除节点；同版本 integrity 无变化，所有 resolved 都为 npm registry。新增 @img 为 Sharp 的平台二进制；axios 的代理链、protobufjs long 更新分别检查。uuid 通过既有 11.1.1 节点去重；不将删除节点数等同删除功能。 |
| src/shared/zip-entry-policy.ts:1 | 新的 5 行链接类型拒绝器；4 个直接调用点，低调用扩散但高信任边界重要性。与 extract-zip 自身 UNIX mode 判定一致，抛错发生在创建链接之前。 |
| src/main/skills/snapshot-install.ts:60 | 唯一生产调用来自 skills/index.ts；保留已有用户内容/哨兵处理，只收紧归档内容。真实恶意 ZIP 回归验证准确拒绝原因。 |
| src/main/migration/skill-snapshot.ts:61 | 唯一生产调用来自 skills/index.ts；新策略在解压阶段拒绝链接，原文件 hash 筛选、备份及 finally 清理未移除。失败原文件不变测试。 |
| scripts/packaging/prepare-mingit.mjs:22 | 默认解压路径加检查，测试注入接口未变。hash 验证、staging、probe、失败清理保持；真实恶意 ZIP 与旧文件保留测试。 |
| scripts/packaging/build-skills-snapshot.mjs:67 | 快照验证解压加检查；未改变归档来源/目标/manifest。Node 24 支持现有纯类型 TS helper 的导入。未重新生成仓库快照来冒充打包回归。 |
| src/main/migration/skill-snapshot.test.ts | 精确断言 onEntry 拒绝、旧内容不变、无备份写入及临时目录删除。 |
| scripts/packaging/prepare-mingit.test.mjs | 新增默认真实提取路径的 ZIP 拒绝与失败清理测试；旧 hash/缓存测试保留。 |
| src/main/skills/snapshot-zip-security.test.ts | ZIP symlink fixture + 外部 sentinel；必须观察 ZIP_SYMLINK_FORBIDDEN，不能拿 OS EPERM 代替策略证明。 |
| src/main/dependency-security.test.ts | Sharp/Xenova API、protobufjs 静态 ONNX、ExcelJS uuidv4、代理环境解析 4 项真实库回归。无真实模型、服务凭据或公网请求。 |

`packages/plugin-sdk/LICENSE` 为先前已有无内容差异标记；完整测试后 snapshot 文件亦出现无内容差异标记，均不属于安全修复的内容变更。原两个目录与用户数据未纳入 diff。

## 历史与安全不变量

- `git blame`：Skills 默认解压入口来自 `f1f65795`，原来没有 onEntry；本轮是加校验，不是删除既有安全保护。
- 迁移链历史包含 `6c18981` 与 `35457af`；读取当前 hash 比对、备份及清理后确认其仍存在。本轮没有重写历史或改动迁移数据。
- 插件安装原有 `validateEntryName`、重复路径检查、链接拒绝、解压预算、assertNoLinks、staging 和身份检查均保留，没有因升级切换到缺少 onEntry 的内部解压包。
- 不更改审批、凭据处理、模型配置、Agent Loop 或工具授权；新测试只使用临时公开数据。

## 直接攻击路径与残余风险

### HIGH：extract-zip 未发布修复（保留风险，非新增回归）

攻击者需让恶意归档进入导入/安装流程：先创建指向目标外文件的 symlink，再使用归档写入条目覆盖目标。在原先无 onEntry 的 Skills 路径，该包执行链接创建；本轮四个调用点在这一操作前拒绝链接。插件入口本已拒绝链接。

真实 ZIP 回归先观察到“仅因 Windows EPERM 而失败”的不足，随后加强断言并得到 red 结果；加入策略后 green。这样区分“环境偶然阻止”与“程序安全策略生效”。

审查未证明可在新增拒绝器下利用上述归档链接攻击；也不保证其他第三方调用、已有恶意本地 symlink/并发替换、其他尚未披露 ZIP 缺陷均被处理。npm audit 仍退出 1，登记后续上游修复/安全替换路线，不加忽略或放宽判定。

### 兼容变化：代理解析 1.x→2.x

升级前 npm_config_* 可影响代理，2.x 不再使用；URL 解析改为 WHATWG URL。通过已安装源码与 [官方发布说明](https://github.com/Rob--W/proxy-from-env/releases) 交叉确认，不将其写成“无 API 变化”。当前应用没有自行调用旧解析接口；飞书通过 Axios 调用新库。回归确认 HTTPS_PROXY 和 NO_PROXY 仍有效、相对 URL 不被当作代理目标、npm_config_https_proxy 不再决定路由。需要此旧环境语义的部署必须改用明确的运行时代理环境变量；没有静默修改用户设置。

## 验证证据与缺口

- 完整套件：4428 通过、1 环境配置失败、1 跳过；补齐 FIREFLY_TEST_BASH 后仅相关文件复测 2/2 通过。不是单次全量全通过记录。
- 原安全定向：5 文件 33 通过；MinGit 3 通过；审查后追加组合 31 通过、1 既有权限跳过。数字有重叠，不相加当作独立测试总量。
- Renderer 类型检查、完整 build、schema check、npm ls、diff check 通过；签名验证 1200 包通过，194 attestations。
- 未执行真实飞书/SMTP、模型推理、所有 Sharp 图像格式、跨平台本地包及安装器；不能将单元回归外推为这些服务已验证。
- build-skills-snapshot 的拒绝器与其他入口共享且覆盖，脚本接线已读；未执行重新归档端到端。现有快照不变。
- 锁文件包源码没有逐行审计全部 1329 个依赖节点；审查聚焦受影响版本、传播链、直接消费者及安全边界。

## 后续

1. extract-zip 保留 high 跟踪；2026-10-03 或修复发布时重新评估，不以本轮构建通过关闭。
2. 覆盖支持的平台与真实服务验收后再扩大发布结论；BGE-M3 未配置不下载。
3. 本轮未暂存、提交、推送或触发 CI。工作流现有报告型 audit 策略没有作为本轮“修复”去改动。
