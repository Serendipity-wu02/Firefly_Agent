import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions, type NativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";

export interface TrayDependencies {
  togglePetWindow: () => void;
  createChatWindow: () => void;
  createStatusWindow: () => void;
  createSettingsWindow: () => void;
}

export function buildTrayMenuTemplate(deps: TrayDependencies): MenuItemConstructorOptions[] {
  return [
    {
      label: "💬 与流萤对话",
      click: () => deps.createChatWindow(),
    },
    {
      label: "⚙ 设置",
      click: () => deps.createSettingsWindow(),
    },
    {
      label: "✨ 显示/隐藏流萤",
      click: () => deps.togglePetWindow(),
    },
    { type: "separator" },
    {
      label: "❌ 退出",
      click: () => app.quit(),
    },
  ];
}

export function createTray(deps: TrayDependencies): Tray {
  // Use app icon or generate 16x16 fallback nativeImage
  const iconPath = path.join(app.getAppPath(), "assets", "icons", "tray.png");
  let icon: NativeImage;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Generate a default 16x16 RGBA buffer for tray
    const buffer = Buffer.alloc(16 * 16 * 4, 0);
    for (let i = 0; i < 16 * 16; i++) {
      buffer[i * 4] = 90;     // R
      buffer[i * 4 + 1] = 200; // G
      buffer[i * 4 + 2] = 160; // B
      buffer[i * 4 + 3] = 255; // A
    }
    icon = nativeImage.createFromBuffer(buffer, { width: 16, height: 16 });
  }

  const tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate(buildTrayMenuTemplate(deps));

  tray.setToolTip("流萤 Firefly-Agent");
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => deps.createChatWindow());
  return tray;
}
