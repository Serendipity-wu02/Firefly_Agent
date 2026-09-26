# npm audit 修复与残余风险（2026-09-26）

## 范围与结果

基线：`d8757969ab97b49f250fdcead2be2a0723191d3d`，分支 `firefly-mini-v1.1.x`。仅处理依赖安全与直接相关解压入口；不提交、不推送，不修改原两个项目或用户配置。

CI 的 **28 项（1 critical、13 high、14 moderate）是生产依赖口径**。本轮完整审计包含开发依赖，为 **33 项（3 critical、16 high、14 moderate）**。修复后完整与生产两种审计均为 **1 high、0 critical、0 moderate**，退出码仍为 **1**。该 1 项包包含两份 extract-zip advisory，不是“一项测试失败”。传播型包统计不是独立攻击路径数量。

未执行 `npm audit fix --force`，未新增 ignore、audit-level 降级或 continue-on-error。现有 CI 报告型 continue-on-error 未修改；它不能作为漏洞已解决的依据。未声称已达到零漏洞门禁。

## critical / high 逐包处置

版本来自修改前锁文件、完整审计和 npm registry；选择满足本次全部已知 advisory 的最小同主版本补丁/次版本。传播问题优先修复实际受影响子依赖，不为消除元漏洞盲目更换上层库。

| 包（审计级别） | 修改前已安装版本 | 处置 / 修复版本 | 直接/传递与生产可达性 |
|---|---|---|---|
| @larksuiteoapi/node-sdk (high) | 1.68.0 | 1.71.1 | 直接生产依赖；飞书适配器 src/main/channels/adapters/feishu/index.ts:34 使用。继承 axios/protobufjs 问题，不等于 SDK 自身另有独立漏洞。 |
| @xenova/transformers (high) | 2.17.2 | 保留 2.17.2，修复 sharp/protobufjs 子依赖 | 直接生产依赖；src/main/rag/embedding.ts:98、reranker.ts:20 动态加载。未下载或运行模型；不能宣称真实 BGE-M3 推理已验收。 |
| @xmldom/xmldom (high) | 0.8.13 | 0.8.15 | 传递开发依赖；electron-builder 的 plist 解析路径，不是应用生产入口。 |
| axios (high) | 1.13.6 | 1.18.0 | 传递生产依赖；飞书 HTTP 请求可达；是否触发具体 SSRF/头部/重定向问题取决于可控 URL、代理和响应，不将依赖存在直接视为已被利用。 |
| brace-expansion (high) | 2.1.2, 5.0.8, 1.1.15, 2.1.1 | 1.1.18 / 2.1.4 / 5.0.9 | 传递生产及开发依赖；ExcelJS 归档与打包 glob 链可达。未发现应用将任意外部字符串直接作为 brace pattern 的调用；仍分别修补各主版本。 |
| concurrently (critical) | 9.2.1 | 9.2.3 | 直接开发依赖；npm run dev 的固定命令。critical 为 shell-quote 传播，不是生产 Agent 执行器。 |
| extract-zip (high) | 2.0.1 | 无已发布修复；保留 2.0.1，加入口缓解 | 直接生产依赖；插件导入、Skills 安装/迁移和打包解压可达。详见残余风险章节，npm audit 仍返回 1。 |
| fast-uri (high) | 3.1.2 | 3.1.6 | 传递生产及开发依赖；src/plugins/manifest-validation.ts:10 的 Ajv 使用固定 manifest schema。没有发现开启不可信远程 schema 装载，但 URI 解析依赖仍升级。 |
| ip-address (high) | 10.2.0 | 10.3.1 | 传递生产依赖；来自 MCP SDK 的服务端限流链。当前 src/main/orchestrator/mcp-adapter.ts:2-5 使用 Client/transport；未证明该服务端漏洞入口在当前应用中可达。 |
| js-yaml (high) | 4.3.0, 3.14.2, 5.0.0 | 3.15.2 / 4.3.2 / 5.2.2 | 直接 5.x 仅打包配置测试使用，移入 devDependencies；生产 gray-matter 仍保留修补后的 3.x。src/main/skills/skill-scanner.ts:7 解析外部 Skills frontmatter，属于真实不可信输入路径。 |
| nanoid (high) | 5.1.14, 3.3.12 | 3.3.18 / 5.1.16 | 传递生产及开发依赖；docx 内部 ID 与 Vite/PostCSS。未发现外部输入直接控制 nanoid 大小参数的应用调用。 |
| nodemailer (high) | 9.0.1 | 9.1.1 | 直接生产依赖；src/main/orchestrator/tools/email-tools.ts:130 创建 SMTP transport，工具输入形成邮件字段。保持既有权限，不执行真实发信。 |
| onnx-proto (high) | 4.0.4 | 保留 4.0.4；protobufjs 覆盖为 7.6.5 | 传递生产依赖；静态 ONNX codec 使用 protobufjs/minimal，不是用户 schema 编译器。新增 int64、空 bytes、往返编码回归。 |
| onnxruntime-web (high) | 1.14.0 | 保留 1.14.0；修补 protobufjs 传播链 | 传递生产依赖；Node 下 Transformers 使用原有 onnxruntime-node；web 依赖仍被装载/分发，不能以 Node 优先路径宣称完全不可达。未升级运行时以避免无必要推理 API 变化。 |
| postcss (high) | 8.5.15 | 8.5.23 | 传递开发依赖；Vite CSS 构建，不是生产运行时输入。 |
| protobufjs (critical) | 7.6.4, 6.11.6 | 6.11.6 / 7.6.4 → 7.6.5 | 传递生产依赖；飞书消息协议与 ONNX 静态 codec。动态 schema/codegen 漏洞需要不可信 schema 输入，当前未发现该直接入口；仍修复所有实例。6→7 属跨主版本，单列兼容验证。 |
| sharp (high) | 0.32.6 | 0.32.6 → 0.35.4 | 传递生产依赖；Xenova 的 RawImage 导入原生图像库。现有业务为文本嵌入/重排，未证明不可信图像到漏洞解码器路径；升级且用真实 PNG 验证导入、解码、resize。0.x 跨 minor 按破坏性升级处理。 |
| shell-quote (critical) | 1.8.3 | 1.9.0 | 传递开发依赖；concurrently 的命令解析。当前开发脚本使用固定命令，未发现攻击者传入 operator 对象的入口。 |
| undici (high) | 7.28.0 | 7.29.0 | 传递开发依赖；Electron 安装下载工具 @electron/get 使用；不是应用 fetch 的替代实现。 |

### 实际依赖链与 advisory

下列逐安装位置记录修改前的链；“开发”不表示漏洞不存在，仅说明应用生产路径不可由该链直接推出。上表的同版本保留项已由最终 audit 验证传播告警消失。

#### @larksuiteoapi/node-sdk

- `node_modules/@larksuiteoapi/node-sdk`：1.68.0。
  - 生产：`@larksuiteoapi/node-sdk@1.68.0`。

元漏洞：沿上列依赖链传播；没有给此上层包虚构独立 advisory。

#### @xenova/transformers

- `node_modules/@xenova/transformers`：2.17.2。
  - 生产：`@xenova/transformers@2.17.2`。

元漏洞：沿上列依赖链传播；没有给此上层包虚构独立 advisory。

#### @xmldom/xmldom

- `node_modules/@xmldom/xmldom`：0.8.13。
  - 开发：`electron-builder@26.15.3` → `app-builder-lib@26.15.3` → `plist@3.1.0` → `@xmldom/xmldom@0.8.13`。

[GHSA-6gmq-8vp8-gcm6](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6)、[GHSA-w2rr-34g9-rvrj](https://github.com/advisories/GHSA-w2rr-34g9-rvrj)、[GHSA-4w3w-2rp5-g8jm](https://github.com/advisories/GHSA-4w3w-2rp5-g8jm)、[GHSA-c7q8-3ch8-vqpv](https://github.com/advisories/GHSA-c7q8-3ch8-vqpv)、[GHSA-27p8-2357-5qqv](https://github.com/advisories/GHSA-27p8-2357-5qqv)、[GHSA-6h8r-xr42-gp59](https://github.com/advisories/GHSA-6h8r-xr42-gp59)、[GHSA-8344-3jmq-59r6](https://github.com/advisories/GHSA-8344-3jmq-59r6)、[GHSA-x4fp-j954-r2f4](https://github.com/advisories/GHSA-x4fp-j954-r2f4)、[GHSA-965w-775f-mr7g](https://github.com/advisories/GHSA-965w-775f-mr7g)、[GHSA-93r5-fhx6-vmg9](https://github.com/advisories/GHSA-93r5-fhx6-vmg9)。

#### axios

- `node_modules/axios`：1.13.6。
  - 生产：`@larksuiteoapi/node-sdk@1.68.0` → `axios@1.13.6`。

[GHSA-3p68-rc4w-qgx5](https://github.com/advisories/GHSA-3p68-rc4w-qgx5)、[GHSA-w9j2-pvgh-6h63](https://github.com/advisories/GHSA-w9j2-pvgh-6h63)、[GHSA-pmwg-cvhr-8vh7](https://github.com/advisories/GHSA-pmwg-cvhr-8vh7)、[GHSA-3w6x-2g7m-8v23](https://github.com/advisories/GHSA-3w6x-2g7m-8v23)、[GHSA-xhjh-pmcv-23jw](https://github.com/advisories/GHSA-xhjh-pmcv-23jw)、[GHSA-445q-vr5w-6q77](https://github.com/advisories/GHSA-445q-vr5w-6q77)、[GHSA-m7pr-hjqh-92cm](https://github.com/advisories/GHSA-m7pr-hjqh-92cm)、[GHSA-5c9x-8gcm-mpgx](https://github.com/advisories/GHSA-5c9x-8gcm-mpgx)、[GHSA-vf2m-468p-8v99](https://github.com/advisories/GHSA-vf2m-468p-8v99)、[GHSA-pf86-5x62-jrwf](https://github.com/advisories/GHSA-pf86-5x62-jrwf)、[GHSA-6chq-wfr3-2hj9](https://github.com/advisories/GHSA-6chq-wfr3-2hj9)、[GHSA-xx6v-rp6x-q39c](https://github.com/advisories/GHSA-xx6v-rp6x-q39c)、[GHSA-q8qp-cvcw-x6jj](https://github.com/advisories/GHSA-q8qp-cvcw-x6jj)、[GHSA-fvcv-3m26-pcqx](https://github.com/advisories/GHSA-fvcv-3m26-pcqx)、[GHSA-62hf-57xw-28j9](https://github.com/advisories/GHSA-62hf-57xw-28j9)、[GHSA-hfxv-24rg-xrqf](https://github.com/advisories/GHSA-hfxv-24rg-xrqf)、[GHSA-777c-7fjr-54vf](https://github.com/advisories/GHSA-777c-7fjr-54vf)、[GHSA-p92q-9vqr-4j8v](https://github.com/advisories/GHSA-p92q-9vqr-4j8v)、[GHSA-j5f8-grm9-p9fc](https://github.com/advisories/GHSA-j5f8-grm9-p9fc)、[GHSA-3g43-6gmg-66jw](https://github.com/advisories/GHSA-3g43-6gmg-66jw)、[GHSA-35jp-ww65-95wh](https://github.com/advisories/GHSA-35jp-ww65-95wh)、[GHSA-898c-q2cr-xwhg](https://github.com/advisories/GHSA-898c-q2cr-xwhg)、[GHSA-mmx7-hfxf-jppx](https://github.com/advisories/GHSA-mmx7-hfxf-jppx)、[GHSA-pmv8-rq9r-6j72](https://github.com/advisories/GHSA-pmv8-rq9r-6j72)、[GHSA-mwf2-3pr3-8698](https://github.com/advisories/GHSA-mwf2-3pr3-8698)、[GHSA-7q8q-rj6j-mhjq](https://github.com/advisories/GHSA-7q8q-rj6j-mhjq)、[GHSA-jqh4-m9w3-8hp9](https://github.com/advisories/GHSA-jqh4-m9w3-8hp9)、[GHSA-42h9-826w-cgv3](https://github.com/advisories/GHSA-42h9-826w-cgv3)。

#### brace-expansion

- `node_modules/@electron/universal/node_modules/brace-expansion`：2.1.2。
  - 开发：`electron-builder@26.15.3` → `app-builder-lib@26.15.3` → `@electron/universal@2.0.3` → `minimatch@9.0.9` → `brace-expansion@2.1.2`。
- `node_modules/app-builder-lib/node_modules/brace-expansion`：5.0.8。
  - 开发：`electron-builder@26.15.3` → `app-builder-lib@26.15.3` → `minimatch@10.2.5` → `brace-expansion@5.0.8`。
- `node_modules/brace-expansion`：1.1.15。
  - 生产：`exceljs@4.4.0` → `archiver@5.3.2` → `archiver-utils@2.1.0` → `glob@7.2.3` → `minimatch@3.1.5` → `brace-expansion@1.1.15`。
  - 开发：`electron-builder@26.15.3` → `app-builder-lib@26.15.3` → `@electron/asar@3.4.1` → `minimatch@3.1.5` → `brace-expansion@1.1.15`。
- `node_modules/filelist/node_modules/brace-expansion`：2.1.2。
  - 开发：`electron-builder@26.15.3` → `app-builder-lib@26.15.3` → `ejs@3.1.10` → `jake@10.9.4` → `filelist@1.0.6` → `minimatch@5.1.9` → `brace-expansion@2.1.2`。
- `node_modules/readdir-glob/node_modules/brace-expansion`：2.1.1。
  - 生产：`exceljs@4.4.0` → `archiver@5.3.2` → `readdir-glob@1.1.3` → `minimatch@5.1.9` → `brace-expansion@2.1.1`。

[GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp)、[GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg)、[GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895)。

#### concurrently

- `node_modules/concurrently`：9.2.1。
  - 开发：`concurrently@9.2.1`。

元漏洞：沿上列依赖链传播；没有给此上层包虚构独立 advisory。

#### extract-zip

- `node_modules/extract-zip`：2.0.1。
  - 生产：`extract-zip@2.0.1`。

[GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)、[GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)。

#### fast-uri

- `node_modules/fast-uri`：3.1.2。
  - 生产：`ajv@8.20.0` → `fast-uri@3.1.2`。
  - 开发：`electron-builder@26.15.3` → `app-builder-lib@26.15.3` → `ajv@8.20.0` → `fast-uri@3.1.2`。

[GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx)、[GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7)、[GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc)、[GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf)、[GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp)、[GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6)。

#### ip-address

- `node_modules/ip-address`：10.2.0。
  - 生产：`@modelcontextprotocol/sdk@1.29.0` → `express-rate-limit@8.5.2` → `ip-address@10.2.0`。

[GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr)、[GHSA-4xrf-jv44-h6hh](https://github.com/advisories/GHSA-4xrf-jv44-h6hh)、[GHSA-22jq-vg5j-6vgg](https://github.com/advisories/GHSA-22jq-vg5j-6vgg)。

#### js-yaml

- `node_modules/app-builder-lib/node_modules/js-yaml`：4.3.0。
  - 开发：`electron-builder@26.15.3` → `app-builder-lib@26.15.3` → `js-yaml@4.3.0`。
- `node_modules/builder-util/node_modules/js-yaml`：4.3.0。
  - 开发：`electron-builder@26.15.3` → `builder-util@26.15.3` → `js-yaml@4.3.0`。
- `node_modules/dmg-builder/node_modules/js-yaml`：4.3.0。
  - 开发：`electron-builder@26.15.3` → `dmg-builder@26.15.3` → `js-yaml@4.3.0`。
- `node_modules/gray-matter/node_modules/js-yaml`：3.14.2。
  - 生产：`gray-matter@4.0.3` → `js-yaml@3.14.2`。
- `node_modules/js-yaml`：5.0.0。
  - 生产：`js-yaml@5.0.0`。

[GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68)、[GHSA-g796-fgmg-93mv](https://github.com/advisories/GHSA-g796-fgmg-93mv)、[GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m)、[GHSA-724g-mxrg-4qvm](https://github.com/advisories/GHSA-724g-mxrg-4qvm)、[GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)、[GHSA-pm4m-ph32-ghv5](https://github.com/advisories/GHSA-pm4m-ph32-ghv5)、[GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)。

#### nanoid

- `node_modules/docx/node_modules/nanoid`：5.1.14。
  - 生产：`docx@9.7.1` → `nanoid@5.1.14`。
- `node_modules/nanoid`：3.3.12。
  - 开发：`vite@7.3.6` → `postcss@8.5.15` → `nanoid@3.3.12`。

[GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv)、[GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)。

#### nodemailer

- `node_modules/nodemailer`：9.0.1。
  - 生产：`nodemailer@9.0.1`。

[GHSA-8m3c-c648-2xjj](https://github.com/advisories/GHSA-8m3c-c648-2xjj)、[GHSA-wmmp-3585-3rmp](https://github.com/advisories/GHSA-wmmp-3585-3rmp)、[GHSA-2x7j-588g-ccc2](https://github.com/advisories/GHSA-2x7j-588g-ccc2)、[GHSA-cc9r-2j5m-2m83](https://github.com/advisories/GHSA-cc9r-2j5m-2m83)。

#### onnx-proto

- `node_modules/onnx-proto`：4.0.4。
  - 生产：`@xenova/transformers@2.17.2` → `onnxruntime-web@1.14.0` → `onnx-proto@4.0.4`。

元漏洞：沿上列依赖链传播；没有给此上层包虚构独立 advisory。

#### onnxruntime-web

- `node_modules/onnxruntime-web`：1.14.0。
  - 生产：`@xenova/transformers@2.17.2` → `onnxruntime-web@1.14.0`。

元漏洞：沿上列依赖链传播；没有给此上层包虚构独立 advisory。

#### postcss

- `node_modules/postcss`：8.5.15。
  - 开发：`vite@7.3.6` → `postcss@8.5.15`。

[GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)、[GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)。

#### protobufjs

- `node_modules/@larksuiteoapi/node-sdk/node_modules/protobufjs`：7.6.4。
  - 生产：`@larksuiteoapi/node-sdk@1.68.0` → `protobufjs@7.6.4`。
- `node_modules/protobufjs`：6.11.6。
  - 生产：`@xenova/transformers@2.17.2` → `onnxruntime-web@1.14.0` → `onnx-proto@4.0.4` → `protobufjs@6.11.6`。

[GHSA-xq3m-2v4x-88gg](https://github.com/advisories/GHSA-xq3m-2v4x-88gg)、[GHSA-66ff-xgx4-vchm](https://github.com/advisories/GHSA-66ff-xgx4-vchm)、[GHSA-2pr8-phx7-x9h3](https://github.com/advisories/GHSA-2pr8-phx7-x9h3)、[GHSA-fx83-v9x8-x52w](https://github.com/advisories/GHSA-fx83-v9x8-x52w)、[GHSA-75px-5xx7-5xc7](https://github.com/advisories/GHSA-75px-5xx7-5xc7)、[GHSA-jvwf-75h9-cwgg](https://github.com/advisories/GHSA-jvwf-75h9-cwgg)、[GHSA-685m-2w69-288q](https://github.com/advisories/GHSA-685m-2w69-288q)、[GHSA-q6x5-8v7m-xcrf](https://github.com/advisories/GHSA-q6x5-8v7m-xcrf)、[GHSA-jggg-4jg4-v7c6](https://github.com/advisories/GHSA-jggg-4jg4-v7c6)、[GHSA-wcpc-wj8m-hjx6](https://github.com/advisories/GHSA-wcpc-wj8m-hjx6)、[GHSA-f38q-mgvj-vph7](https://github.com/advisories/GHSA-f38q-mgvj-vph7)、[GHSA-j3f2-48v5-ccww](https://github.com/advisories/GHSA-j3f2-48v5-ccww)。

#### sharp

- `node_modules/sharp`：0.32.6。
  - 生产：`@xenova/transformers@2.17.2` → `sharp@0.32.6`。

[GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)、[GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)。

#### shell-quote

- `node_modules/shell-quote`：1.8.3。
  - 开发：`concurrently@9.2.1` → `shell-quote@1.8.3`。

[GHSA-w7jw-789q-3m8p](https://github.com/advisories/GHSA-w7jw-789q-3m8p)、[GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv)。

#### undici

- `node_modules/undici`：7.28.0。
  - 开发：`electron@43.1.0` → `@electron/get@5.0.0` → `undici@7.28.0`。

[GHSA-8xcm-r25x-g524](https://github.com/advisories/GHSA-8xcm-r25x-g524)、[GHSA-4cwx-7wf7-3272](https://github.com/advisories/GHSA-4cwx-7wf7-3272)、[GHSA-m8rv-5g2x-5cg5](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5)、[GHSA-jr45-8vmc-qm54](https://github.com/advisories/GHSA-jr45-8vmc-qm54)、[GHSA-v3r7-h72x-cjcm](https://github.com/advisories/GHSA-v3r7-h72x-cjcm)。

## moderate 与未使用依赖

- DOMPurify 3.4.12→3.4.13；Hono 4.12.25→4.13.5；@hono/node-server 1.19.14→1.19.15；Mermaid 11.16.0→11.16.1；qs 6.15.2→6.16.0。
- ExcelJS 的 uuid 8.3.2→11.1.1，仅 scoped override，不改其他调用方。
- 删除未被项目调用的直接依赖 @nut-tree-fork/nut-js。检查 src、scripts、skills、packages、examples 及 vendor/firefly-skills/skills-snapshot.zip 内文本，没有 nut-js/Jimp 引用；截图/输入实际实现不依赖它。其 Jimp/file-type 链共 7 项 moderate 随之移除，并非关闭现有功能。
- 没有依靠移入 devDependencies 掩盖告警：js-yaml 的全部生产与开发实例都已修补，完整 audit 与生产 audit 分别执行。

## 跨版本兼容审查

1. [protobufjs 7.0.0 发布说明](https://github.com/protobufjs/protobuf.js/releases/tag/protobufjs-v7.0.0)：移除老 Node 支持、拆出 CLI、long 更新及空 buffer 编码差异。项目 Node 24，未使用该 CLI。实际 ONNX 静态 codec 的 int64/空 bytes/编码往返测试通过；飞书原有 7.x 不跨主版本。[7.6.5](https://github.com/protobufjs/protobuf.js/releases/tag/protobufjs-v7.6.5) 修复解析问题。
2. [Sharp 0.35.0](https://github.com/lovell/sharp/releases/tag/v0.35.0) 要求 Node >=20.9、移除安装脚本及废弃 API，改变部分输出默认值；[0.35.4](https://github.com/lovell/sharp/releases/tag/v0.35.4) 包含底层修复。读取 Xenova RawImage 实际调用，未使用移除的 API。新增真实 native PNG/resize 测试，不替换 Transformers 公共 API，也不下载模型。未宣称所有图像格式或真实模型均验证。
3. [uuid 11.1.1 changelog](https://github.com/uuidjs/uuid/blob/v11.1.1/CHANGELOG.md)：9/10 移除旧 Node/浏览器支持，11 改变部分有状态版本接口。ExcelJS 仅 require 的 v4，Node 24/CJS 导出仍可用。新增 XLSX dataBar 条件格式写入/读取测试，实际触发 v4 使用位置。
4. 同主版本 HTTP/邮件升级仍有行为影响：保留业务参数、权限、超时与代理配置；本轮自动测试不等于真实飞书/SMTP 服务验收。
5. Axios 带入 proxy-from-env 1.1.0→2.1.0。[官方发布说明](https://github.com/Rob--W/proxy-from-env/releases) 确认改用 WHATWG URL、停止把 npm_config_* 当作运行时代理配置。Axios 调用 getProxyForUrl 的位置已核查；新增回归覆盖 HTTPS_PROXY、NO_PROXY、无效相对 URL 及不再使用 npm_config_https_proxy。需要代理时使用运行时 HTTPS_PROXY/HTTP_PROXY/NO_PROXY；本轮未读取或改写真实用户代理值。没有为兼容旧行为回退到不安全版本。

## 唯一残余：extract-zip@2.0.1（high）

- 原因：registry 没有修复发布；最终 audit 明确 `fixAvailable: false`。
- 风险：[符号链接路径穿越](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) 与 [符号链接条目任意写入](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)。攻击者提供恶意 ZIP，经可达导入/安装路径解压，在未拒绝链接的入口写出目标目录。不是网络请求本身立即利用，需要归档被接受和解压。
- 已有插件入口 `src/plugins/installer.ts:136`：onEntry 先拒绝链接、重复/危险路径、加密及超预算内容；独立 staging 与后验 assertNoLinks 保持不变。
- 本轮为 Skills 安装、历史 Skills 迁移、MinGit 准备、Skills 快照验证的四个调用点统一加入 `src/shared/zip-entry-policy.ts`，在链接创建前抛出 `ZIP_SYMLINK_FORBIDDEN`。不通过吞错返回成功。MinGit 保留 SHA-256 验证与临时目录；迁移失败不覆盖已有文件。
- 定向测试使用真实恶意 ZIP，不以 Windows 无链接权限导致 EPERM 冒充策略通过；断言准确策略错误、外部 sentinel 不变、无成功标记。迁移与 MinGit 另验证已有文件保留和临时目录清理。
- 缓解范围：阻断已知“归档内创建链接”的路径；不保证第三方任意使用此包均安全，也不覆盖拥有本地写权限者并发替换目录的 TOCTOU。只导入可信来源，保留既有 hash/路径/预算约束，不放宽权限。
- 未采用 @electron-internal/extract-zip：其 README 明确内部使用，不支持当前 onEntry 安全契约；仅换包会丢失插件逐条预算/校验，不是安全的等价替换。
- 后续：2026-10-03 或上游发布时复核修复版；若仍无发布，另行选用受维护解压实现，保留全部路径、链接、预算与失败清理契约并做跨平台归档回归。此项仍是依赖安全待办，不称为完全修复。

## 安装与供应链边界

发现迁移目录原 node_modules 为指向原 Cyrene 目录的 junction。已将链接本身移至仓库外取证目录，未改目标；在迁移目录独立 `npm ci --ignore-scripts --no-audit --no-fund`，后续去除无用依赖也禁止生命周期脚本。只在检查脚本后显式执行 Electron 安装脚本；未启动应用。原项目依赖未改动。

`npm audit signatures` 成功：1200 个包 registry 签名验证、194 个 attestation 验证。这是供应链来源验证，不保证包没有漏洞。packageManager 记录 npm 11.17.0；本轮没有把既有 allowScripts 字段误称为所有 npm 版本下强制生效的沙箱。

## 验证

- 最终 full/prod audit：均退出 1，仅 extract-zip high。
- 定向 Vitest：5 文件 / 33 测试通过；含 ONNX、Sharp、ExcelJS、恶意 ZIP、迁移及插件安装。
- MinGit node:test：3 通过，0 跳过。
- 完整测试一次：514 文件，513 通过、1 文件失败；4428 测试通过、1 失败、1 跳过，224.01 秒。唯一失败是环境未提供 FIREFLY_TEST_BASH，执行前已由测试主动拒绝；不是被测命令返回错误。按实际发现的 E:\Git\bin\bash.exe 设置本次进程环境后，该文件 2/2 通过（0.973 秒）。没有将两次结果伪写为“一次全量全通过”。
- differential-review 追加代理回归并核对跳过项：3 文件、31 通过、1 跳过（5.48 秒）。跳过为插件面板真实文件 symlink 测试，当前 Windows 无创建符号链接权限；已知 ZIP 攻击测试不依赖该权限且已通过。
- npm run check:renderer、npm run build（Main/Preload tsc、CLI、Vite）、npm run check:plugin-schema 均退出 0。Vite 保留大 chunk 警告，未调宽阈值。npm ls --depth=0 与 git diff --check 退出 0。
- 没有 lint script；不新增工具或伪称执行 lint。
- 真实 SMTP、飞书、模型推理、安装器和运行应用未实测；不修改用户设置。
- 证据在仓库外 `E:\Codex\Firefly-npm-audit-20260926`：before-all.json、triage.json、final-all.json、final-prod.json、各验证日志。日志不作为提交文件。
