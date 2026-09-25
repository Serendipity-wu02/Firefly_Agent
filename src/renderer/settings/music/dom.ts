// Music 面板 DOM 引用
// 从 settings.ts 抽离。ESM 静态导入保证查询在 settings.ts 顶层代码之前执行。

export const musicToggle = document.getElementById("plugin-music-toggle") as HTMLButtonElement | null;
export const musicAccordionCard = document.getElementById("plugin-music-card");
export const musicAccordionBody = document.getElementById("plugin-music-body");
