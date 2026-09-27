import * as path from "node:path";

/** Stable Firefly application and user-data identities. */
export const FIREFLY_APPLICATION_NAME = "Firefly";
export const FIREFLY_USER_DATA_DIRECTORY = "Firefly";

export interface FireflyIdentityApp {
  getPath(name: "appData"): string;
  setName(name: string): void;
  setPath(name: "userData", value: string): void;
}

/**
 * Must run before the single-instance lock and before any settings store is
 * constructed. The user-data directory is independent of the technical npm
 * package name and the packaged product display name. Legacy data handling
 * belongs to migration/firefly-data, not to identity initialization.
 */
export function configureFireflyApplicationIdentity(app: FireflyIdentityApp): string {
  const userDataPath = path.join(app.getPath("appData"), FIREFLY_USER_DATA_DIRECTORY);
  app.setName(FIREFLY_APPLICATION_NAME);
  app.setPath("userData", userDataPath);
  return userDataPath;
}
