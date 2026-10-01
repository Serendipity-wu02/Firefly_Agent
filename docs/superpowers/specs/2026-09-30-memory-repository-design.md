# Firefly Memory v2 第一阶段：独立事务主库

状态：设计待评审；P0实验不是生产实现。目标平台Windows，TypeScript/Electron/Node。中文优先，同时保留英文和中英混合文本。正式实现基线须核对PR13远端be6beede628e6e00dc6304355af4ab3dd65f919c，使用E盘工作区内独立分支/目录，保留用户当前5096f75主工作树及现有P0证据。PR更新暂缓。

## 目标与范围
交付可独立测试的memory-core事务仓库及安全密钥边界：来源、证据、候选、事实修订、当前事实投影、幂等作业、删除标记、索引状态。仅以合成数据验证，不接管旧PMRS、不调用真实模型、不读取或迁移真实用户数据。S是当前会话上下文，M是长期有效事实，H是历史检索，绝不把三者定义为tier或晋升链。第一阶段不复制全部历史原文，source只登记可信来源引用和revision；H及S适配留到下一阶段。

## 模块边界
src/shared/memory-contracts.ts仅含跨进程安全DTO，不暴露真实路径、DEK、数据库句柄或授权构造器。src/main/memory-core内按职责划分key-provider、payload-codec、repository、worker-client/worker、contracts/tests。职责明确即可，禁止预建巨型插件框架。复用src/main/storage-context.ts的memory.dataRoot/indexRoot/tempRoot；正式生产路径不搬迁，index/temp不等于dataRoot。

## 密钥与存储
单一SQLite事务主库在专用worker运行，Main提供已验证StorageContext和受控命令。主库是真相，派生索引可重建。AEAD加密内容载荷；明文结构字段只允许经审查的最小内部标识/枚举/时间，用户文字、摘要、subject自然语言、来源标题路径等不得意外落明文。每个密文认证关联记录类型、稳定ID、schema版本、密钥版本，防止跨记录替换。错密钥、错认证头、缺失/损坏密钥在打开既有数据库进行任何写操作前拒绝，不重新建库或生成替代key。

Windows候选为CurrentUser DPAPI保护随机DEK；safeStorage同步/异步都已证实存在首次强杀LocalState尚未持久化窗口，不作为本方案持久密钥依赖。生产KeyProtection接口封装平台能力，业务仓库不感知PowerShell。首阶段可以沿用已验证的固定系统helper作为受限Windows适配，但必须先完成接口协议/安装路径/系统策略/进程退出和错误审查：固定可验证系统可执行路径与脚本，无shell拼接，key仅二进制匿名管道，不进argv/env/log/temp，启动仅发生于key初始化或打开，失败fail closed。没有silent fallback，不自行引入native依赖或旧数据迁移。提交顺序为受控独占→新key pending写入与flush→解密校验→不覆盖发布→最终文件验证→数据库初始化。部分初始化状态明确恢复或拒绝，不能用sleep或访问次数“提高可靠性”。不得将进程kill测试表述为断电耐久性证明。

## 事实模型和事务
保留sources/evidence/candidates/fact_revisions/current_facts/jobs/deletion_markers/index_state逻辑实体，物理schema在实现计划逐项确定。SourceRef含来源类型、可信sourceId、revision和范围；用户来源及角色由Main来源适配验证，不接受模型自报。事实修订含subjectKey、scope、assertionKind、recordedAt、acceptedAt、supersededAt、validFrom、validTo、referenceTime、provenance。未知时间保持未知，不以录入时间伪造事实发生时间。时间区间统一半开并验证端点。

所有修订追加，current_facts只是当前投影。correct在单事务里写新修订、supersede旧修订、更新投影与索引失效事件；写失败整体回滚。不能last-arrival-wins。并发correct使用expectedRevision，过期请求明确冲突。幂等commandId重放结果一致。

## 激活授权
用户已批准：清晰、无冲突的用户直接陈述，可由Main按明确规则自动激活M；推断、敏感及冲突信息保持candidate等待确认。模型提取只产生evidence/candidate，不得决定授权、owner/project或user-confirmed。Main构造不可由Renderer或模型直接序列化伪造的激活授权上下文。记录activationReason区分policyAccepted与explicitUserConfirmed；自动接受绝不标为“用户已确认”。政策规则和来源验证必须可测试且带版本。第一阶段仓库测试通过可信Main适配fixture，不通过模型文本充当授权。

## 删除与后台竞争
forget立即撤销事实可召回性，并在事务中更新删除/抑制代次和索引失效；迟到任务提交必须验证sourceRevision、scope和suppressionGeneration。重新记住只由新的可信用户事件创建新代次，不释放旧jobs。删除后历史原文是否仍供用户手动审阅，以及既有原文加密范围，留待H接入前产品确认；不得由仓库自行删除历史文件。跨SQLite与文件清理只能先提交屏障→幂等清理→确认完成，不宣称跨文件原子删除。

## 生命周期
有效期、superseded、forget/delete与检索排序分开。访问频次不改变真实性、不自动延长有效期。首阶段不做基于未访问时间的自动硬删除、不实现S→M→H晋升。指数衰减若后续加入只影响召回排序；S摘要必须带source revision，H命中不自动成为M。

## 验收
先RED再GREEN，Windows真实Electron及打包worker验证：事务回滚、并发修订冲突、幂等提交、worker故障/关闭、首次初始化各边界kill/reopen、正常系统重启后的旧key解密、错/缺/损坏key下原DB/auth/WAL/SHM不变、密文跨记录替换拒绝、key/blob/schema不匹配拒绝、source修改和forget后的迟到job拒绝、模型伪造confirmed/scope拒绝、中英文及混合文本往返不丢失。日志和数据库关联文件合成canary扫描。完整Memory产品评测≥60中文开发/≥200中文发布及检索指标留到接入阶段，不用本阶段单测数量替代。所有构建测试产物明确E盘workdir/env，保留C盘工具仅只读执行的边界，OS自动写无跟踪就标未知。

## 退出与后续
此阶段通过后才接S/H来源适配、提取整合和最小用户操作闭环，再做混合检索与UI、最后单writer切换。完整正式产品链不在本阶段启动。设计通过后再写具体文件/接口/RED测试及提交顺序实施计划，用户评审后执行。