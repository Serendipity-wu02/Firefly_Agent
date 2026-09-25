import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  FIREFLY_APPLICATION_NAME,
  FIREFLY_USER_DATA_DIRECTORY,
  configureFireflyApplicationIdentity,
} from "./app-identity";

describe("Firefly application identity", () => {
  it("binds the Cyrene-based build to an independent userData directory before startup", () => {
    const setName = vi.fn();
    const setPath = vi.fn();
    const appData = path.join("C:\\Users", "tester", "AppData", "Roaming");

    const userDataPath = configureFireflyApplicationIdentity({
      getPath: (name) => {
        expect(name).toBe("appData");
        return appData;
      },
      setName,
      setPath,
    });

    expect(FIREFLY_APPLICATION_NAME).toBe("Firefly");
    expect(FIREFLY_USER_DATA_DIRECTORY).toBe("Firefly");
    expect(userDataPath).toBe(path.join(appData, FIREFLY_USER_DATA_DIRECTORY));
    expect(setName).toHaveBeenCalledWith(FIREFLY_APPLICATION_NAME);
    expect(setPath).toHaveBeenCalledWith("userData", userDataPath);
    expect(userDataPath.toLowerCase()).not.toContain("firefly-agent");
  });
});
