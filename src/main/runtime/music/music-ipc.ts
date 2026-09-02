import { ipcMain, BrowserWindow } from "electron";
import { IPC } from "../../../shared/ipc-channels";
import { MusicService } from "./music-service";
import type { MusicTrack } from "../../../shared/music-types";

export function registerMusicIpc(musicService: MusicService): () => void {
  ipcMain.handle(IPC.MUSIC_SEARCH, async (_event, payload: { query: string; limit?: number }) => {
    try {
      const tracks = await musicService.search(payload.query, payload.limit);
      return { ok: true, tracks };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err), tracks: [] };
    }
  });

  ipcMain.handle(IPC.MUSIC_GET_RECOMMENDATIONS, async (_event, payload?: { limit?: number }) => {
    try {
      const tracks = await musicService.getRecommendations(payload?.limit);
      return { ok: true, tracks };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err), tracks: [] };
    }
  });

  ipcMain.handle(IPC.MUSIC_PLAY, async (_event, payload: { track?: MusicTrack; selection?: string | number }) => {
    try {
      if (payload.track) {
        await musicService.playTrack(payload.track);
        return { ok: true };
      }
      if (payload.selection !== undefined) {
        await musicService.playSelection(payload.selection);
        return { ok: true };
      }
      return { ok: false, error: "未指定播放曲目或序号。" };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle(IPC.MUSIC_PAUSE, async () => {
    try {
      await musicService.pause();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle(IPC.MUSIC_RESUME, async () => {
    try {
      await musicService.resume();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle(IPC.MUSIC_NEXT, async () => {
    try {
      const ok = await musicService.next();
      return { ok };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle(IPC.MUSIC_PREV, async () => {
    try {
      const ok = await musicService.prev();
      return { ok };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle(IPC.MUSIC_STOP, async () => {
    try {
      await musicService.stop();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle(IPC.MUSIC_SET_VOLUME, async (_event, volume: number) => {
    try {
      await musicService.setVolume(volume);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle(IPC.MUSIC_GET_STATE, async () => {
    return musicService.getSnapshot();
  });

  // Broadcast state changes to all windows
  const unsubscribe = musicService.onStateChange((snapshot) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.MUSIC_STATE_CHANGED, snapshot);
      }
    }
  });

  return unsubscribe;
}
