import * as path from "node:path";

/** New identity for the Firefly build that is based on the Firefly runtime. */
export const FIREFLY_APPLICATION_NAME = "Firefly";
export const FIREFLY_USER_DATA_DIRECTORY = "Firefly";

export interface FireflyIdentityApp {
  getPath(name: "appData"): string;
  setName(name: string): void;
  setPath(name: "userData", value: string): void;
}

/**
 * Must run before the single-instance lock and before any settings store is
 * constructed. This keeps settings, chats, memories, permissions, prompts,
 * and lock ownership separate from upstream Firefly and the original
 * Firefly application, whose data is stored under the old package name.
 */
export function configureFireflyApplicationIdentity(app: FireflyIdentityApp): string {
  const userDataPath = path.join(app.getPath("appData"), FIREFLY_USER_DATA_DIRECTORY);
  app.setName(FIREFLY_APPLICATION_NAME);
  app.setPath("userData", userDataPath);
  return userDataPath;
}
