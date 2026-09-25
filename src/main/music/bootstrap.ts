import * as path from "node:path";
import { app, ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { buildMusicTools } from "../orchestrator/tools/music-tools";
import { toolRegistry } from "../orchestrator/tools/registry/tool-registry";
import { createQqMusicExecutor, QqMusicService, type QqMusicAction } from "./qqmusic-service";

export interface MusicBootstrap {
  service: QqMusicService;
  isShuttingDown(): boolean;
  shutdown(): Promise<{ transportClosed: boolean; processTreeExited: boolean; runtimeRemoved: boolean }>;
}

export function resolveQqMusicScriptPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "music", "qqmusic_gsmtc.ps1")
    : path.join(app.getAppPath(), "src", "main", "music", "scripts", "qqmusic_gsmtc.ps1");
}

export function bootstrapMusicService(): MusicBootstrap {
  const service = new QqMusicService(createQqMusicExecutor(resolveQqMusicScriptPath()));
  const tools = buildMusicTools(service);
  for (const tool of tools) toolRegistry.register(tool);
  ipcMain.handle(IPC.MUSIC_QQ_GET_STATUS, () => service.getState());
  ipcMain.handle(IPC.MUSIC_QQ_CONTROL, (_event, action: QqMusicAction) => {
    if (!["play", "pause", "toggle", "next", "previous"].includes(action)) throw new Error("QQ_MUSIC_INVALID_ACTION");
    return service.control(action);
  });

  let shuttingDown = false;
  return {
    service,
    isShuttingDown: () => shuttingDown,
    shutdown: async () => {
      if (shuttingDown) {
        return {
          transportClosed: true,
          processTreeExited: true,
          runtimeRemoved: true,
        };
      }
      shuttingDown = true;
      ipcMain.removeHandler(IPC.MUSIC_QQ_GET_STATUS);
      ipcMain.removeHandler(IPC.MUSIC_QQ_CONTROL);
      for (const t of tools) toolRegistry.unregister(t.id);
      return service.shutdown();
    },
  };
}
