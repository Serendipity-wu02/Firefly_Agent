# MiniMax-M3 工具调用参数缺失问题报告（2026-09-05）

> **日期**：2026-09-05
> **状态**：历史问题报告，依据三个会话的原始快照整理；未在本次文档整理中重新复现。
> **范围**：MiniMax-M3 的 `write_markdown` 必填参数、工具 ID 与工具白名单约束。
> **来源**：Playa 的原厂商反馈材料；保留当日报文、观察及证据边界。当前维护入口见[文档导航](../../README.md)。

## 1. 问题与环境

2026 年 9 月 5 日，在使用 MiniMax-M3 进行长上下文、多工具调用时，观察到 `tool_use`（工具调用）会连续丢失 Tool Schema（工具参数结构）中明确声明为 `required`（必填）的参数。

测试环境：

* 模型：MiniMax-M3
* API：MiniMax 官方 API
* API Key：MiniMax 官方开放平台 Key
* 套餐：官方 Token Plan（Token 套餐）
* 未使用任何第三方 API 中转、代理或第三方模型服务
* 协议：Anthropic 兼容协议，流式
* 场景：自研 Agent 客户端，多轮工具调用
* 单会话约 51～57 条消息
* 同时存在多个 Tool Schema（工具定义）
* 涉事工具：`write_markdown`
* `filename` 和 `content` 均明确声明为 `required`

涉事工具的完整定义（三个会话中一字未变，Schema 指纹一致）：

```json
{
  "name": "write_markdown",
  "input_schema": {
    "type": "object",
    "properties": {
      "filename": { "type": "string", "description": "文件名（.md 结尾）" },
      "content":  { "type": "string", "description": "markdown 内容" }
    },
    "required": ["filename", "content"]
  }
}
```

测试链路使用官方 API、官方 Key 和官方 Token Plan，未经过第三方中转或二次报文转换。

## 2. 对照时间线

同一天、同模型、同协议、完全相同的工具 Schema：

* 13:22 对照会话：调用 4 次，4/4 正确携带 `filename`
* 14:22 新会话：调用 17 次，0/17 携带 `filename`
* 14:27 新会话：调用 13 次，0/13 携带 `filename`

两个独立失败会话合计连续 **30 次**调用 `write_markdown`，均缺失必填的 `filename` 参数。

三个会话的工具 Schema 指纹与协议相同，一小时内由全部成功转为全部失败。服务端时段性退化仅为待核查假设，需结合 9 月 5 日 13:00–15:00（UTC+8）的服务端日志确认。

客户端每次都会返回点名参数的校验错误（`filename 必须是 .md 结尾`），但模型连续重试仍然无法恢复。

## 3. 关键证据与推断边界

### 3.1 最终报文已缺少参数

服务端最终返回的 `tool_use block`（工具调用数据块）中，`input` 本身就只有 `content`，部分调用甚至直接为空对象 `{}`。

流式增量结果与最终返回结果完全一致，因此缺参应该已经发生在模型生成或服务端工具调用转换阶段，而不是客户端后续解析过程中。

### 3.2 错误识别与参数生成不一致

在 thinking（思考过程）中，模型实际上知道自己需要同时生成 `filename` 和 `content`。

但检查自己实际生成的工具调用后，它明确写道：

> "There's no `<parameter name="filename">...</parameter>` at all! I'm not generating it."

也就是说，模型知道应该提供这个参数，也正确理解了客户端返回的错误，但实际生成工具调用时，仍然始终没有真正生成 `filename`。

### 3.3 缩短参数未恢复

第一个失败会话的 17 次调用中：

* 9 次只有 `content`
* 6 次直接生成空对象 `{}`
* 另外几次模型已经主动将内容不断缩短，尝试通过最小化调用进行排查

但最终仍然无法正确生成 `filename`。

缩短参数没有恢复调用，说明单纯参数过长不足以解释观察结果；长上下文或多工具状态下的持续生成退化仍是待验证假设。

## 4. 其他协议异常

测试过程中还发现：

1. 同一轮响应中偶尔会出现重复的 `tool_use id`（工具调用 ID）。如果 Agent 客户端按照 ID 做幂等去重，可能会因此误丢正常调用。

2. MiniMax-M3 偶尔会调用当前 `tools` 数组中并不存在的工具，例如 `apply_patch`、`str_replace`、`write_file` 等，而服务端仍然会将其转换成 `tool_use block` 返回给客户端。

客户端已增加校验；模型与服务端侧的约束仍需独立验证。

## 5. 改进与验证方向

* 长上下文、多工具情况下，`required` 参数的生成稳定性
* 收到明确参数校验错误后，模型真正修正下一次 Tool Call（工具调用）的能力
* 单轮响应中 `tool_use id` 的唯一性
* 对当前 `tools` 白名单之外工具调用的约束

## 6. 证据材料与来源

原报告说明已保存三个完整会话的 Run Snapshot（运行快照），包括：

* 30 次调用的原始 arguments（参数）
* thinking 全文
* 模型自行排查 Tool Call 的过程
* 最终 `tool_use blocks`
* 请求侧完整 Tool Schema
* Schema 指纹

复现材料在进一步共享前需要脱敏；本文不表示材料已经发送，亦不表示问题在后续版本中仍然存在。
