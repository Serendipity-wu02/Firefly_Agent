# Firefly 未提交修改审查包

源码工作目录：`E:\Codex\Firefly-Agent-migration`。
基线：`35457af3279fccaf0ab462f8744f47183fce79f1`。
本包只用于外部审查，不是安装包或已提交版本。未运行测试、未暂存、未提交、未推送。

## 阅读顺序

1. `structure-cleanup-2026-09-26.md`：原完整报告，原样导出。其测试结果属于上一轮，不是本次重新执行。
2. `baseline.txt`、`git-status-full.txt`、`git-status-porcelain.txt`：实际基线及完整工作树状态。
3. `tracked-diff-HEAD.patch`：原始 `git diff HEAD --binary --full-index --find-renames`。Git 不把未跟踪目标自动识别为重命名，因此此补丁显示旧路径删除；**不能单独使用此文件判断新文件丢失**。
4. `untracked-additions.patch`：所有未跟踪文件的单独新增补丁；`current-files/` 保留所有实际修改及新增文件的当前字节，目录结构不变。二者与上一补丁合起来覆盖当前内容差异。没有使用临时暂存区修改仓库索引。
5. `move-map.csv`：明确列出 12 张头像、源 YAML、两篇历史文档的移动关系，区分内容相同、仅换行变化、内容修改。
6. `file-manifest.csv`：实际新增/修改/删除清单、当前文件 SHA-256。Git 状态中 SDK LICENSE 有修改标记，但 `git diff HEAD` 没有实质内容差异；完整 status 如实保留，不把它报告成许可证内容修改。
7. `avatar-moves.csv`：姓名来自 `src/shared/task-characters.ts`，不是按文件名推测；卡芙卡对应原有 `卡夫卡.png`。12 张移动前后哈希相同。
8. `stickers.csv`、`stickers/contact-sheet-*.png`、`stickers/gallery.html`：52 项实际路径、哈希、格式尺寸与预览。联系表为第一帧缩略预览；HTML 可离线查看原文件及 GIF 动画，不能把联系表第一帧当成完整动画检查。
9. `sticker-references.tsv`、`references-explanation.md`：分类引用及实际运行含义。搜索行仅是引用证据，不能单凭文本命中认定生产生效。
10. `checklist.md`：上一轮请求逐项处理与验证边界；`remaining-address-examples.txt` 给出称呼样例残留的精确位置。

只打包本轮源码差异、审查文档及指定公开贴图资源。未包含用户数据、运行日志正文、密钥、node_modules、dist、模型权重、原目录备份。原始历史图片仍属于原素材作者，不因进入审查包改变许可或归属。`SHA256SUMS.txt` 用于完整性检查。

本次实际有 83 个内容差异路径（含23个未跟踪路径），完整 Git status 为84项，额外一项是上述没有内容差异的 SDK LICENSE 标记。移动目标尚未跟踪，不能把当前 Git 显示的删除项全部当成实际删除。52项图片均成功解码生成预览，无解码失败；GIF只在联系表截取第一帧，原始文件完整保留。
