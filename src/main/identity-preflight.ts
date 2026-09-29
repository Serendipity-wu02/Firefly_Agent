import { app } from "electron";
import { configureFireflyApplicationIdentity } from "./app-identity";

export const userDataDir = configureFireflyApplicationIdentity(app, process.env.FIREFLY_ISOLATED_SMOKE_APPDATA);
