# Firefly Memory Repository Implementation Plan
For agentic workers: use superpowers:executing-plans or installed equivalent, with TDD and independent review at task boundaries.
Goal: 在Windows交付独立可测试的加密事务仓库、可信Main命令边界与故障恢复，不切换生产writer。
Architecture: Main验证StorageContext与命令授权，专用worker持有SQLite和AEAD载荷；CurrentUser DPAPI通过隔离KeyProtection适配器保护DEK；修订、当前投影、幂等与抑制代次事务一致。
Tech Stack: TypeScript, Electron 43.1.0, embedded Node24.18.0, node:sqlite, node:crypto；不增加第三方运行框架。
Spec: docs/superpowers/specs/2026-09-30-memory-repository-design.md

## Global constraints
- Windows产品目标，中英文兼容、中文优先。S/M/H是三个职责，不创建MemoryTier或晋升。
- 基线be6beede628e6e00dc6304355af4ab3dd65f919c。每次命令显式E盘workdir及进程级TEMP/TMP/TMPDIR/cache/appData/log；C安装工具与Skills仅只读执行。
- 在 E:\Codex\Firefly_Agent-skills-layout\output\task-b-memory-core 下创建独立worktree/分支 feat/memory-repository-core（若存在先核查，不覆盖）。正常fetch允许，用户主工作树5096f75与既有P0证据原样保留。PR延后，不push/merge。
- P0原spike只作证据/可审查复用源，不能整目录拷入生产模块。正式模块不import scripts/verify/memory-p0。
- 不接管生产PMRS/真实数据，不迁移旧格式，不添加Renderer自动权限、默认模型配置或用户secret。
- 先RED→最小实现→GREEN→相关回归→review→本地逻辑commit。同问题两次失败或太难报告，由我协调Astra low。

## Review focus
密钥初始发布中断；错key且live WAL存在；伪造scope或用户确认；source改版/forget与迟到job竞争；重复commandId携带不同payload。分别在任务1/2/3/4测试，不以类型断言替代运行时验证。

## Task 1: 主库安全打开与密钥保护
Files: create src/main/memory-core/key-provider.ts, windows-dpapi.ts, protected-key.ts, payload-codec.ts及各同名.test.ts；已有runtime-profile.ts/storage-context.ts只消费公开接口。
Interfaces: KeyProtection {protect(plaintext:Uint8Array):Promise<Uint8Array>;unprotect(blob:Uint8Array):Promise<Uint8Array>}；loadOrCreateMemoryKey({roots,protection}):Promise<MemoryKeyHandle>，handle不进sharedDTO；seal/openPayload绑定recordType/id/schemaVersion/keyVersion的AAD。
- [ ] RED验证：新profile发布后可重开；pending各边界失败不覆盖已有key；错/丢/损坏key拒绝前DB/auth/WAL/SHM零变化；缺key但已有DB绝不自动创建；两实例独占；旧格式拒绝。
- [ ] RED验证AEAD：UTF8中/英/混合往返，修改tag/nonce/AAD及跨record替换失败，不回传未经认证明文。
- [ ] 最小实现：随机32byte DEK、AES-256-GCM、每次随机12byte nonce、16byte tag，版本化envelope严格形状/长度验证。密钥原子非覆盖发布与认证头沿用已验证P0算法，经review后抽离。密钥不打印、不进argv/env/temp明文。
- [ ] Windows DPAPI固定系统路径/固定脚本，匿名二进制管道、严格magic/长度/退出检查、输出上限和有界进程时间，异常杀掉并等待close；不经shell、不依赖safeStoragepreflight、不改变OS策略。仅在初始化/打开调用，不在每条记录启动进程。
- [ ] targeted Vitest对应新增文件，Main tsc noEmit；真实Electron重用P0故障场景，以新模块为被测对象。保留失败证据后review。

## Task 2: 单worker事务仓库与schema
Files: create src/main/memory-core/repository.ts, schema.ts, repository-types.ts, worker.ts, worker-client.ts, repository.test.ts, worker.test.ts。
Interfaces: openMemoryRepository({databasePath,key}): MemoryRepository（worker内部）；MemoryClient.open({storage,keyProtection}):Promise<MemoryClient>（Main内部）。外部不接受原始数据库路径作为Renderer输入。
逻辑表sources/evidence/candidates/fact_revisions/current_facts/jobs/deletion_markers/index_state；另command_receipts记录幂等commandId+requestDigest+result。使用显式schema_version迁移，不容忍未知未来版本。事实表状态与revision引用用FK和unique约束，不依赖应用预查询代替约束。
明文只保留必要随机内部ID、类型/状态、版本/时间及引用；正文、摘要、自然语言subject、来源标题/路径、模型提议payload均AEAD加密。scope使用Main给定的不含用户路径/名称的内部scopeKey，禁止把整条原聊天复制进来源表。subjectKey若用于索引需加密载荷内保留原值，采用独立用途派生key的HMAC索引；不要明文存人名/偏好。
- [ ] RED：transaction注入失败整体回滚，重开数据稳定，future schema拒绝，关联约束有效，密文错key先认证再open，worker无响应/崩溃让pending请求全部结束且关闭资源。
- [ ] 实现所有write经worker串行命令和事务；并发写测试验证预期冲突/幂等，无同步SQLite跑Main。shutdown拒绝新命令、等待已入队提交或明确失败，再关闭。备份用一致性SQLite支持入口，不裸拷正在变化DB。
- [ ] 幂等：相同commandId+相同requestDigest返回原结果；相同ID不同payload/scope返回冲突。测试事务内write+receipt一起回滚。
- [ ] 定向测试与Main typecheck通过后独立review；可提交第一笔 feat(memory): add protected transactional storage core。

## Task 3: Main可信命令与事实修订
Files: create src/shared/memory-contracts.ts；src/main/memory-core/main-access.ts, memory-service.ts及测试。
DTO：SourceRef {sourceId,revision,span?}；事实时间recordedAt/acceptedAt/supersededAt/validFrom/validTo/referenceTime，未知为null，区间半开且起止有效。MemoryScope只能由Main授权适配解析，DTO不包含可用于授权的自由owner/project字段。
MainAccess在模块私有WeakMap/等效不可由JSON构造的runtime registry验证，不能只靠TypeScript brand。worker接收的scope来自验证后的Main命令通道，不能暴露worker端口给Renderer。
Repository commands: registerSource, appendEvidence, proposeCandidate, activateCandidate, correctFact, forgetFact；每个mutation带commandId，correct/forget带expectedRevision；所有service读写带有效MainAccess并在查询中scope过滤。
- [ ] RED：模型proposal不能变active；plain-object伪造授权失败；越scope读写失败；自动policyAccepted与explicitUserConfirmed不同，模型自称confirmed不改变字段。
- [ ] Main显式用户事件和已批准policy的activationReason独立。当前阶段用可信Main fixture测试，不实现凭模型返回“清晰无冲突”就自动激活的捷径；真实提取/冲突整合接入下一阶段。
- [ ] RED：correct事务追加新revision并supersede旧，current投影原子变化；并发expectedRevision只有一个成功；迟到旧来源不能覆盖新版本；中英混合文本原样往返。
- [ ] 修订内容不覆盖。supersession作为追加生命周期记录（可用fact_revisions内typed event），current投影可更新；查询出的supersededAt由事件导出，保留完整历史，不为了immutable额外复制明文。
- [ ] 定向测试+runtime权限负例+review，提交第二笔 feat(memory): add scoped fact revisions and trusted commands。

## Task 4: 幂等jobs与防复活屏障
Files: create src/main/memory-core/jobs.ts, suppression.ts及测试，修改repository/schema事务入口。
job记录固定sourceRevision、scopeKey、suppressionGeneration、leaseToken/leaseExpiresAt与幂等键；时间注入clock便于测试。claim返回opaque lease token；commitJobResult验证有效lease及所有版本/代次，过期token/旧revision不得提交。
- [ ] RED：forget先提交屏障并立即让current查询不可见，排队/运行中的旧job之后提交拒绝；source编辑后旧提取拒绝；lease过期重领只能新token提交；同job重放不重复事实。
- [ ] 新可信用户remember事件生成新的授权代次，旧job仍无效；不能通过删除tombstone让旧聊天复活。
- [ ] forget只撤销M读取与再提取，不自动删除原聊天文件；H历史审阅/旧原文加密后续产品确认，当前不连H读面，不以此擅自开放被忘内容。实际跨文件hard-delete返回pending状态，不伪称已完成；首阶段只测仓库屏障。
- [ ] targeted+并发竞争测试通过，独立review，提交第三笔 feat(memory): guard background jobs against stale sources。

## Task 5: Windows集成验收与交付
Files: tests按仓库实际Electron验证布局落地，专用runner仅生成合成数据、正式打包配置不偷偷启用Memory。跟据现有npm脚本核对命令并报告实际文件路径。
- [ ] 真实开发/packaged worker：首启各key提交边界kill→reopen、rollback、并发、backup、shutdown、liveWAL下错key/缺key零字节变化、密文串换拒绝、版本抑制竞争。正常系统重启证据可引用已验证provider，但新module替换后独立标明验证范围。
- [ ] DB/WAL/SHM/backup/temp/log synthetic canary扫描；主Memory持久化与派生index/temp根不重叠。所有安全assertion不skip或放宽。不能把人工OS断电标为已测。
- [ ] npm test；npx tsc -p tsconfig.main.json --noEmit；npx tsc -p tsconfig.preload.json --noEmit；npm run check:renderer；npm run build；plugin SDK/schema/examples；相关packaging；git diff --check。记录真实counts/duration/skipreason，任何未跑明确。
- [ ] code-review-and-quality/verification-before-completion，行为稳定后局部simplify再回归。提交只含设计、计划、核心代码/测试和必要验证脚本，禁止合成key/DB/敏感证据进入git。
- [ ] 向我报告commits、精确HEAD、工作树、每阶段RED/GREEN、Windows门禁及未决事项。完成这一阶段后停止，不生产cutover/不push；下一阶段来源和检索由我继续定设计。

此计划已按用户批准设计逐项检查覆盖、类型/接口责任、5类故障和范围。实现时若具体仓库风格需等价命名调整请记录，不改安全或产品语义。