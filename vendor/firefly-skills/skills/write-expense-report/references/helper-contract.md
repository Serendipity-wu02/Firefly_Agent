# 确定性金额与工作表辅助协议

`scripts/prepare-report.mjs` 是 Firefly 当前维护的本地辅助程序，Node 24 标准库实现，无安装步骤。它只接受本流程已经逐笔核实且用户确认的中间数据，不是 `query_expense` 返回 JSON 的证明，不读取 userData，不调用模型、网络、账本工具或 Excel 库。此程序不授予 shell 权限；由当前宿主已有的授权执行能力或用户手动运行。

## 输入

UTF-8 JSON 顶层只能有 `currency`、`records`；`records` 非空，每笔只能有 `date`、`category`、`amount`、`note`、`currency`。这些是新辅助协议字段，不是查询输出字段或账本结构映射。以下全部是合成示例，不含用户数据：

```json
{
  "currency": "CNY",
  "records": [
    { "date": "2026-09-01", "category": "餐饮", "amount": "1.005", "note": "synthetic", "currency": "CNY" },
    { "date": "2026-09-02", "category": "交通", "amount": "0.10", "note": "", "currency": "CNY" }
  ]
}
```

- `currency` 为用户明确确认的三位大写代码，每笔必须与顶层完全相同；程序检查一致性，不证明该代码存在或原始记录实际采用该币种。仅用于用户已确认采用两位小数的单币种报告，不转换币种。
- `date` 必须是已经确认日期含义的合法 `YYYY-MM-DD`；程序不解释地区日期或重新选择时区，不筛选日期范围。范围与来源完整性由主流程在准备前核对。
- `category` 是非空类目原文；保留其空格，不自行重分类。`note` 必须是文本，确认无备注时才传空字符串。
- `amount` 必须是最多 100 字符的无符号十进制字符串，禁止数字类型、千分位、货币符号、空白、非有限值及指数形式。逐笔 half-up 到分，拒绝非正/舍入为零、超出安全整数分或数值单元格无法保留分的值。合计也做相同的安全检查。

## 手动调用与输出保护

```text
node <已解析的技能目录>/scripts/prepare-report.mjs <已确认中间数据.json的绝对路径> <新中间输出.json的绝对路径> <实际运行时输出根目录的绝对路径> <用户确认的新文件名.xlsx>
```

前三个路径必须是绝对路径，从真实文件与宿主上下文取得并逐个作为命令参数传入，不用字符串拼接执行用户输入，不推测安装路径。第三个参数只能是当前 `write_excel` 的真实输出根目录，第四个是单个新文件名，不能含目录、穿越或工具禁止的字符。程序以 `path.resolve(outputRoot, filename)` 检查工作簿目标，不能用输入所在目录或进程当前目录替代真实根目录，也不能把任意桌面路径冒充可信工作区。

中间输入的创建同样需用户授权与新文件保护；输入与两个输出不能复用同一文件。中间输入和中间输出不限制在技能资源目录或运行时输出根内，技能资源只读。中间输出的父目录及运行时根目录应已存在，程序不创建目录。

程序只读取输入，准备四列明细及第二张汇总，保留明细顺序；类目按整数分小计降序、同额按字符序排列。输出中只有 `filename`、`sheets`，后者内含 `name`、`headers`、`rows`，可以逐字段传入真实 `write_excel`。`filename` 为原样验证的第四个参数，不携带目录；实际根目录须与运行时输出根相同。第二张表的币种列用于标识，最后一行为合计；类目原文即使为“合计”仍是类目，最后一行按位置识别为总计。

既有工作簿路径（含目录或链接）使程序报错且不创建中间输出；中间输出使用 Node 的 `flag: "wx"` 独占创建，拒绝既有路径，不修改输入及既有文件。工作簿存在性检查不是预留锁，程序不写 XLSX，不宣称 `write_excel` 有独占创建；其后仍须执行 SKILL.md 的写入前检查和真实审批。异常写盘可能留下不完整的新中间文件；检查后改用用户确认的新路径，不自动删除、覆盖或重试。

成功退出码为 0；失败为 1，标准错误以 `[expense-report]` 开头，校验失败含 `Invalid input`，既有目标含 `Output exists`。没有输出文件不表示真实支出为零。成功后以只读方式读取中间结果并核对账目、范围及笔数；传给工具后再对实际 XLSX 读回，不能将中间 JSON 检查当作工作簿检查。

## 实现核对依据

实际工具契约取自本仓库 `src/main/orchestrator/tools/life-tools.ts`、`src/main/orchestrator/tools/document-tools.ts`，权限档位取自 `src/main/permission-policy.ts`。辅助程序不修改这些实现。

Node 24 官方文件系统文档说明 [`wx` 在路径存在时失败](https://nodejs.org/docs/latest-v24.x/api/fs.html#file-system-flags)，以及应[直接独占打开而非先检查后创建](https://nodejs.org/docs/latest-v24.x/api/fs.html#fsaccesspath-mode-callback)。测试使用 [Vitest 的参数化测试 API](https://vitest.dev/api/test#test-each)，启动真实 Node 辅助进程并使用合成临时文件，不以搜索说明文字代替功能验证。
