# 离线模块 RED/GREEN 与最终验证原始日志

本目录仅保存本次实际工具输出。`manifest.json` 的 SHA256/bytes 绑定原始字节，`.gitattributes` 禁止 Git 换行转换；请以原字节核验，不先转码。Windows console 捕获中的非 ASCII 字符可能乱码，正文计数和断言仍可读取。

`browser-domain-full.log` 是未设置 Bash fixture/受限沙箱的第一次全量失败记录，且运行期间有审查修正；不能当最终版本验证。`browser-domain-full-final.log` 才是源码冻结后在已核实 fixture 与原生子进程权限下的完整结果。没有改测试配置、跳过失败项或调整 CI。

类型日志空文件是无诊断输出；exit0由实际工具结果核对，并记在正文，不以空文件推断退出码。新增测试类型与接线示例使用工作树外临时config，主源码/CI config未改。接线示例只运行TypeScript编译，没有执行app.login、createView、Session.fromPartition或shutdown注册。

详细命令、退出码、独立审查和未验证项见[验证报告](../../browser-domain-modules.md)。
