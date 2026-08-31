import { app } from "electron";

export function getAutoLaunch(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

export function setAutoLaunch(openAtLogin: boolean): boolean {
  try {
    app.setLoginItemSettings({
      openAtLogin,
      path: process.execPath,
      args: ["--hidden"],
    });
    return true;
  } catch (err) {
    console.warn("[Startup] Failed to set auto launch:", err);
    return false;
  }
}
