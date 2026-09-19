import { dialog, ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { WindowManager } from "../windows/window-manager";
import { WorkTaskCoordinator } from "./work-task-coordinator";

export interface WorkIpcRegistration {
  readonly dispose: () => void;
}

export function registerWorkIpc(options: {
  readonly coordinator: WorkTaskCoordinator;
  readonly windowManager: WindowManager;
}): WorkIpcRegistration {
  let disposed = false;
  const registeredChannels = new Set<string>();
  const requireWorkSender = (sender: unknown): void => {
    if (!options.windowManager.isWorkWindowSender(sender)) {
      throw new Error("Work IPC is only available in the Work window.");
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const channel of registeredChannels) {
      ipcMain.removeHandler(channel);
    }
    registeredChannels.clear();
  };

  try {
    ipcMain.handle(IPC.WORK_GET_STATE, (event) => {
      requireWorkSender(event.sender);
      return options.coordinator.getSnapshot();
    });
    registeredChannels.add(IPC.WORK_GET_STATE);

    ipcMain.handle(IPC.WORK_GET_FILE_SELECTION, (event) => {
      requireWorkSender(event.sender);
      return options.coordinator.getCurrentFileSelection();
    });
    registeredChannels.add(IPC.WORK_GET_FILE_SELECTION);

    ipcMain.handle(IPC.WORK_SELECT_FILES, async (event) => {
      requireWorkSender(event.sender);
      const selected = await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "Text and Markdown", extensions: ["txt", "md", "markdown"] }],
      });
      if (selected.canceled) {
        const current = options.coordinator.getCurrentFileSelection();
        return {
          ok: true,
          cancelled: true,
          ...(current === undefined ? {} : { selection: current }),
        };
      }
      return options.coordinator.selectFiles(selected.filePaths);
    });
    registeredChannels.add(IPC.WORK_SELECT_FILES);

    ipcMain.handle(IPC.WORK_CREATE_PLAN, (event, task: unknown) => {
      requireWorkSender(event.sender);
      return options.coordinator.createPlan(task);
    });
    registeredChannels.add(IPC.WORK_CREATE_PLAN);

    ipcMain.handle(IPC.WORK_CONFIRM_PLAN, (event, proposalId: unknown) => {
      requireWorkSender(event.sender);
      return options.coordinator.confirmPlan(proposalId);
    });
    registeredChannels.add(IPC.WORK_CONFIRM_PLAN);

    ipcMain.handle(IPC.WORK_CANCEL, (event) => {
      requireWorkSender(event.sender);
      return options.coordinator.cancel();
    });
    registeredChannels.add(IPC.WORK_CANCEL);

    ipcMain.handle(IPC.WORK_EXPORT_MARKDOWN, async (event) => {
      requireWorkSender(event.sender);
      const selected = await dialog.showSaveDialog({
        title: "导出 Work Markdown",
        defaultPath: "work-result.md",
        filters: [{ name: "Markdown", extensions: ["md"] }],
        properties: ["showOverwriteConfirmation"],
      });
      if (selected.canceled) return { ok: true, cancelled: true };
      return options.coordinator.exportMarkdown(selected.filePath);
    });
    registeredChannels.add(IPC.WORK_EXPORT_MARKDOWN);
  } catch (error: unknown) {
    dispose();
    throw error;
  }

  return { dispose };
}
