# Firefly 旧名称精确残留清单（2026-09-25）

范围：Git 工作树中可见源码、测试、配置、说明与历史文档，包含未跟踪源码；不读取用户数据或依赖。此清单与实施报告自身不计入递归匹配。

以下逐文件列出所有匹配行号；历史文档并非当前功能说明。生成物另在实施报告中列出，不能把生成物中的迁移解析字符串当成旧文件仍在运行。

| 文件 | 精确行号 | 必要用途 |
|---|---|---|
| `.gitignore` | 209 | 排除旧版私有工作区状态，防止迁移源及备份意外进入 Git；不是写入路径。 |
| `docs/archive/README.md` | 3 | 历史设计、问题与迁移记录索引，不参与运行。 |
| `docs/CONTRIBUTORS.md` | 30 | 上游贡献者真实归属记录。 |
| `docs/design/2026-08-08-cyreneHarnessloopdesign.md` | 1, 6, 15, 17, 19, 41, 55, 66, 72, 76, 78, 84, 85, 87, 89, 96, 100, 105, 252, 300, 302, 304, 306, 317, 324, 336, 340, 341, 821, 889, 908, 962, 964, 1001, 1027, 1067, 1075, 1080, 1191, 1195, 1292, 1307, 1316, 1331, 1337, 1346, 1406, 1408, 1418, 1438, 1449, 1456, 1462, 1470, 1482, 1483, 1485, 1489, 1490, 1503, 1505, 1507, 1511, 1513, 1527, 1528, 1533, 1546, 1550 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-08-09-cyrene-harness-construction-status.md` | 1, 14, 33, 40, 46, 47, 48, 49, 50, 52, 58, 83, 84, 89, 117, 126, 131, 144, 151, 154 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-08-09-cyrene-harness-current-status.md` | 1, 13, 16, 25, 26, 27, 35, 45, 113, 186, 190 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-08-09-cyreneHarness-construction-plan.md` | 1, 6, 12, 20, 24, 25, 35, 44, 45, 49, 50, 52, 120, 128, 129, 170, 178, 220, 224, 255, 257, 261, 289, 318, 322, 328, 329, 331, 342, 362, 365, 406, 407, 409, 417 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-08-09-cyreneHarness-design-review.md` | 1, 3, 63, 88, 99, 101, 118, 145, 159 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-08-09-harness-runtime-boundary/implementation-plan.md` | 1, 35, 62, 65, 74, 75, 79, 84, 102, 128, 145, 153, 168, 181, 194, 200, 201, 214, 231, 233, 237, 247, 248, 255, 294, 303, 318, 319, 320, 363, 369, 371, 406, 418, 432, 487, 488, 530, 545, 557, 564, 565, 597, 680, 687, 706, 712 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-08-09-harness-runtime-boundary/runtime-boundary-and-change-plan.md` | 1, 5, 109 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-08-12-code-git-live-refresh-construction-plan.md` | 9, 26, 166, 522, 538, 545 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-08-25-harness-parallel-scheduling-optimization-plan.md` | 26, 124, 252, 303, 304, 323, 349 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-08-29-gamebot-p0-construction-plan.md` | 23, 33, 44, 45, 61, 63, 65, 66 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-08-30-main-process-composition-root-construction-plan.md` | 25, 1517, 1599, 1625, 1637 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-03-bilinote-video-notes-design-reference.md` | 1, 4, 34, 59, 83, 115, 119, 123, 124, 125, 126, 127, 128, 135, 136, 137 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-03-chatpage-refactor-design.md` | 74, 491 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-03-chatpage-refactor-regression-checklist.md` | 54, 66, 111 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-03-learn-mode-upgrade-construction-plan.md` | 3, 4, 14, 27, 224, 296, 322, 350, 370, 376, 381, 398, 411, 413, 414, 421, 477, 545, 554, 585, 586 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-04-moments-social-feed-design.md` | 1, 4, 19, 21, 24, 33, 37, 43, 44, 46, 73, 109, 122, 222, 287, 301, 309, 312, 318, 328, 338, 413, 439, 501, 566, 567, 609, 611, 648, 666, 695, 696, 698, 725, 729, 742, 744, 751, 791, 800, 803, 809 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-06-moments-character-social-enhancement-design.md` | 3, 5, 15, 18, 31, 35, 80, 95, 98, 102, 111, 112, 113, 123, 136, 140, 220, 244, 267, 283, 290, 325, 327, 371, 381, 391, 392, 394, 395, 399, 400, 401, 404, 405, 414, 436, 438, 440, 472, 479, 496, 500, 502, 504, 518, 534, 536, 538, 559, 570, 580, 597, 598, 624, 626, 628, 635, 636, 638, 655, 670, 671, 672 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-07-moments-mention-reply-and-liveliness-design.md` | 25, 44, 49, 51, 107 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-09-attention-toast-center-design.md` | 30, 43, 59, 75, 77, 109, 121, 123, 182, 285, 341, 343, 347, 349, 350, 351 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-11-minecraft-goal-harness-headless-design.md` | 1, 4, 19, 47, 49, 64, 75, 84, 93, 253, 310, 316 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-13-tool-display-name-chinese-design.md` | 22, 78, 91, 92 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-15-agent-execution-master-plan.md` | 1, 28, 34 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-15-dsh-right-panel-diff-comparison.md` | 1, 7, 9, 13, 23, 24, 25 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-15-live-candidate-answer-construction-plan.md` | 25, 27, 36, 45, 73, 91 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-15-message-queue-dsh-reference.md` | 5, 13, 14, 15, 21, 29, 35, 53 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-15-runtime-unified-view-rework-design.md` | 64, 121, 125, 205 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-15-vision-image-pipeline-review.md` | 1 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-15-vision-image-router-redesign.md` | 144 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-15-workspace-open-files-review-design.md` | 9, 15, 25, 27, 29 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/2026-09-21-cta-conversation-transcript-architecture-design.md` | 161, 221, 296, 312, 324, 328, 347, 357, 363 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/gamebot-Honkai-Star-Rail.md` | 15, 40, 46, 65, 66, 106, 188, 255, 262, 281, 289, 291, 337 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/plugin-marketplace.md` | 3, 50, 67, 69, 75, 135, 154, 261, 280 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/plugin-system/architecture.md` | 1, 6, 12, 27, 41, 51, 64, 75, 82, 113, 148, 408, 463, 465, 586, 623, 628, 658, 681, 689, 714, 720, 729, 732, 737, 739, 898, 938, 956, 962, 973 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/plugin-system/construction-progress.md` | 1, 28, 414, 423, 429, 430, 434, 505, 522, 529, 598, 619, 625 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/plugin-system/implementation-plan.md` | 1, 11, 67, 99, 152, 163, 484, 684, 712, 820, 851, 859, 860, 861, 862, 999 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/design/snowluma-plugin.md` | 59, 75, 77, 81, 98, 99, 125, 126, 131, 136, 137, 141, 169, 172, 175, 207, 210, 221, 223, 226, 229, 238, 267, 272, 275, 278, 279, 280, 288, 293, 295, 296, 365, 370, 380, 504, 641, 644, 645, 647, 673 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/internal-issue/2026-08-25-harness-parallel-scheduling-known-issues.md` | 3, 54, 124, 138, 169 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/internal-issue/2026-08-26-image-context-screenshot-known-issues.md` | 287, 291 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/internal-issue/2026-08-27-runshell-hang-glm53-reasoning-known-issues.md` | 48, 50, 95 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/internal-issue/2026-09-05-tool-mode-override-env-context-leak.md` | 17, 29, 41, 52, 96, 99, 113, 159, 178, 243, 257, 259, 349 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/internal-issue/2026-09-06-shell-output-truncation-timeout-known-issues.md` | 29, 41, 58, 102, 122, 131, 221 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/internal-issue/2026-09-09-architecture-review-verification-known-issues.md` | 228, 335 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/internal-issue/2026-09-10-proactive-chat-user-report-unconfirmed.md` | 9, 34, 58 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/internal-issue/2026-09-17-chat-renderer-performance-known-issues.md` | 355, 399 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/internal-issue/2026-09-20-harness-recovery-orphan-tool-result-400-construction.md` | 198, 211 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/internal-issue/2026-09-20-harness-recovery-orphan-tool-result-400-report.md` | 23, 27, 33, 42, 125, 275 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-batch1-implementation-2026-09-23.md` | 1, 5, 16, 17, 19, 20, 21, 31, 33, 35, 37, 42, 50, 52, 54, 55, 56, 57, 59, 75, 79 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-batch2-implementation-2026-09-24.md` | 5 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-batch3-implementation-2026-09-24.md` | 12, 87 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-batch4-implementation-2026-09-25.md` | 16 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-batch5-implementation-2026-09-25.md` | 6 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-batch6-implementation-2026-09-25.md` | 25, 26, 29, 33, 35, 43, 51 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-brand-skills-2026-09-25.md` | 7, 8, 23, 26, 33, 34, 35, 36, 37, 38, 39, 40, 45, 46, 47, 48, 49, 50, 51, 124, 125 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-brand-skills-files-2026-09-25.md` | 9, 44, 51, 122, 154, 155, 158, 159, 181, 183, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 315 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-final-gap-closeout-2026-09-25.md` | 22 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-final-handoff-2026-09-25.md` | 9, 10, 18, 20, 25 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-migration-audit-2026-09-22.md` | 1, 4, 29, 60, 73, 82, 85, 106, 110, 111, 112, 119, 128, 129, 130, 131, 135, 136, 138, 141, 142, 146, 148, 152, 153, 154, 164, 166, 167, 168, 169, 170, 171, 172, 177, 185, 189, 191, 192, 193, 194, 197, 199, 205, 230, 240, 257, 285, 294, 295, 303, 305, 308, 313, 314, 315, 317, 318, 333, 344, 346, 348, 389, 393, 414, 417, 426, 462, 465, 479, 523 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-migration-import-inventory-2026-09-25.txt` | 94, 95, 102, 103, 109, 110, 111, 112, 113, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 302, 354, 468, 1057, 1179, 1180, 1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1629, 1630, 1631, 1657, 1658, 1659, 2720, 2844, 2845 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-reliability-and-submission-2026-09-25.md` | 52, 61, 62 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-source-diff-review-2026-09-25.md` | 6, 7, 12, 14, 15, 18, 19, 21, 25, 31, 37, 38, 40, 44 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/migration/firefly-uncommitted-files-2026-09-25.md` | 88, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 458, 464, 485, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 547, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/refactor/2026-08-31-agui-bridge-refactor.md` | 100, 101 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/refactor/2026-08-31-build-options-refactor.md` | 347, 375 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/refactor/2026-08-31-harness-adapter-refactor.md` | 5, 23, 49, 56, 66, 103, 115, 133, 309 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/refactor/2026-09-14-engineering-governance-plan.md` | 54 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/specs/2026-08-08-dmae-v5-upgrade-and-l2-working-memory.md` | 5, 28, 57, 60, 61, 62, 63, 64, 65, 66, 93, 94, 116, 132, 184, 219, 304, 321, 498, 506, 515, 517, 523, 524, 526, 527, 528, 529 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `docs/specs/2026-09-03-channel-conversation-binding.md` | 5, 12, 13, 15, 16, 25 | 真实历史记录；保留原始事实，不参与当前提示词、构建或产品入口。 |
| `MODEL_LICENSE.md` | 3, 5, 9, 11, 15, 22, 25, 30, 51, 68, 76, 82 | 历史模型来源、作者与独立素材授权说明，不改写第三方归属。 |
| `packages/plugin-sdk/src/legacy.ts` | 2 | 旧插件作者类型别名指向 FireflyPlugin；当前 API 与示例使用 FireflyPlugin。 |
| `scripts/packaging/electron-builder-config.test.mjs` | 57 | 防止旧角色、图标、性能全局标识或安装路径重新出现的否定回归。 |
| `src/cli/state/state.test.ts` | 37, 43, 51 | 历史内部目录/CLI 状态保护与历史路径读取回归。 |
| `src/main/agui-bridge.test.ts` | 1791, 1792, 1811, 1812 | 旧环境变量入口的显式兼容回归；生产读取集中于旧格式适配模块。 |
| `src/main/channels/adapters/feishu/audio-duration.test.ts` | 11 | 旧环境变量入口的显式兼容回归；生产读取集中于旧格式适配模块。 |
| `src/main/channels/settings-store-fallback.test.ts` | 14, 23, 46 | 旧应用名及旧混淆派生的解密回归，验证升级写入与原文备份。 |
| `src/main/character-migration.test.ts` | 67, 73, 75, 81, 89, 115 | 防止旧角色、图标、性能全局标识或安装路径重新出现的否定回归。 |
| `src/main/cita/cita-service.test.ts` | 152, 183 | 旧环境变量入口的显式兼容回归；生产读取集中于旧格式适配模块。 |
| `src/main/external-content-paths.test.ts` | 53, 55, 57, 59, 60 | 历史用户 Skill/提示词命名及新值优先的加载回归。 |
| `src/main/learn/obsidian/obsidian-workspace-service.test.ts` | 5, 174, 176, 182, 204, 206, 207, 211, 221, 228, 229, 230 | 历史内部目录/CLI 状态保护与历史路径读取回归。 |
| `src/main/migration/firefly-contract-integration.test.ts` | 13, 21, 35, 43 | 临时旧格式迁移回归：备份、重试、新值优先、身份/协议和旧源保留。 |
| `src/main/migration/firefly-data.test.ts` | 20, 21, 22, 27, 35, 39, 43, 46, 48, 50, 54, 55, 59, 72, 73, 80, 84, 92, 103, 104, 107, 111, 115 | 临时旧格式迁移回归：备份、重试、新值优先、身份/协议和旧源保留。 |
| `src/main/migration/firefly-data.ts` | 6, 7, 8, 58 | 旧目录/导出清单的只复制迁移源名称；旧源保留，目标存在时不覆盖。 |
| `src/main/moments/character-personas-firefly.test.ts` | 33, 36 | 防止旧角色、图标、性能全局标识或安装路径重新出现的否定回归。 |
| `src/main/moments/character-personas.test.ts` | 259, 267, 268 | 防止旧角色、图标、性能全局标识或安装路径重新出现的否定回归。 |
| `src/main/orchestrator/harness/compaction.test.ts` | 16, 18 | 历史压缩检查点可读、新检查点写 Firefly 的回归。 |
| `src/main/orchestrator/harness/plan-tools.test.ts` | 205, 206, 213, 270, 273 | 历史内部目录/CLI 状态保护与历史路径读取回归。 |
| `src/main/orchestrator/sandbox/sandbox-exec.test.ts` | 103, 175, 176 | 旧环境变量入口的显式兼容回归；生产读取集中于旧格式适配模块。 |
| `src/main/perf-trace.test.ts` | 21 | 旧环境变量入口的显式兼容回归；生产读取集中于旧格式适配模块。 |
| `src/main/plugin-panel-protocol.test.ts` | 50, 51, 71, 72, 73, 74, 76, 77 | 旧协议、保留路径兼容和越权/路径逃逸拒绝回归。 |
| `src/main/rag/model-status.test.ts` | 90, 98, 109, 110, 120, 131 | 旧环境变量入口的显式兼容回归；生产读取集中于旧格式适配模块。 |
| `src/main/skills/firefly-skills.test.ts` | 28, 29, 32, 36, 37, 38, 42, 43, 50, 52 | 历史用户 Skill/提示词命名及新值优先的加载回归。 |
| `src/main/skills/skill-id-aliases.ts` | 2, 3, 4, 5, 6, 7, 8, 9 | 历史 Skill ID、slash 命令与设置键转换；设置转换后删除旧键，新值优先。 |
| `src/main/ui-icon.test.ts` | 7, 8 | 防止旧角色、图标、性能全局标识或安装路径重新出现的否定回归。 |
| `src/plugins/installer.test.ts` | 241 | 拒绝插件包伪造旧宿主市场安装元数据。 |
| `src/renderer/react-perf/react-perf-cleanup.test.ts` | 21 | 防止旧角色、图标、性能全局标识或安装路径重新出现的否定回归。 |
| `src/renderer/react/character-avatars.test.ts` | 15 | 防止旧角色、图标、性能全局标识或安装路径重新出现的否定回归。 |
| `src/renderer/react/features/chat/components/ChatMessageList.test.ts` | 200 | 防止旧角色、图标、性能全局标识或安装路径重新出现的否定回归。 |
| `src/renderer/react/features/chat/components/streamdown-file-link.test.ts` | 15, 23 | 历史文件链接解码及非法链接拒绝回归。 |
| `src/renderer/react/features/chat/components/streamdown-message-content-state.test.ts` | 75 | 历史内部目录/CLI 状态保护与历史路径读取回归。 |
| `src/renderer/settings/appearance-settings-markup.test.ts` | 39, 40, 67 | 防止旧角色、图标、性能全局标识或安装路径重新出现的否定回归。 |
| `src/renderer/types/legacy-firefly.d.ts` | 5, 6, 7, 8, 9, 10 | 旧外部窗口类型别名指向独立 Firefly 类型；当前消费者不依赖旧类型。 |
| `src/shared/legacy-firefly-contracts.ts` | 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 53, 54, 55, 64, 76, 77, 78, 79, 80, 81, 83, 84, 85, 86, 87, 88 | 集中旧格式解析：事件、环境变量、历史路径、凭据派生、朋友圈字段/身份、Window API 与外部插件协议；新数据不使用旧标识。 |
| `THIRD_PARTY_NOTICES.md` | 3, 5, 10, 11 | 上游源码与资源真实来源；当前 SDK/市场说明已更新。 |

共 105 个文件、1224 条匹配行。普通业务生产者、当前示例、当前产品说明不使用这些旧标识。
