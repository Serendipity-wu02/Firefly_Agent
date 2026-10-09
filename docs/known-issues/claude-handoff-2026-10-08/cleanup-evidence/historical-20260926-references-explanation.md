# 52 张历史贴图：实际调用分类

## 文件与界面加载

`src/main/sticker-descriptions.ts` 的 `BUILT_IN_STICKER_FILES` 为 52 项 ID → 文件名映射；`src/renderer/public/stickers/` 原文件由 Vite public 复制。`src/shared/sticker-types.ts` 保留旧 ID。

- `src/main/moments/moment-media-matcher.ts`：ID 可转换为 `stickers/${builtInFile}` 历史媒体引用。
- `src/main/channels/outgoing-composer.ts`：保留内置 ID 到文件路径解析，不能声称这些文件只有静态历史文档引用。
- `src/renderer/react/features/chat/components/ChatComposer.tsx`、`ChatMessageList.tsx` 与 `src/renderer/sticker-manager/main.ts`：保留 `/stickers/` 资源路径解析。
- `src/main/sticker-storage.ts:getAllStickerConfig` 仅枚举用户贴图，不自动把这 52 项放回当前选择列表。其函数注释仍写“内置 + 用户”，与当前函数体不同；本审查包记录差异，不追加源码清理。

## 模型描述

`BUILT_IN_STICKER_DESCRIPTIONS` 现在为 `{}`。旧角色口吻描述从生产表移除，没有把旧图片冒充流萤。原描述删除全文可在补丁检查。当前没有新增流萤内置描述，等待用户提供素材和含义。

## 向量索引

`src/main/services/embedding/embedding-index-service.ts` 将空内置表及用户 manifest 传入 `buildCachedStickerEmbeddingIndex`；`sticker-embedder.ts` 只迭代实际描述条目。`sticker-embedding-cache.ts` 的缓存键包含规范化后的描述；不因仍保留文件映射而自动构建这 52 个内置向量。未接触用户缓存，未执行真实 embedding 请求；服务配置状态不在本包采集范围。

## 测试、历史文档与其他契约

`sticker-references.tsv` 每行含分类、实际文件、行号与源码行。测试命中包括路径 fixture、媒体保留和空描述表断言；不是真实界面已显示的证据。`docs/archive/` 和 `docs/migration/` 单独标为历史文档；这些文字不会加载图片。当前架构报告也单列，不与历史文档混淆。其他存储/协议行用于补全调用链，不把所有 sticker 单词都认定为这 52 张的直接引用。

每一项通过同一映射分发表共享上述生产路径；各文件具体名称的直接引用也收录在 TSV。仅保留原文件/联系表，不生成或修改人物图片。
