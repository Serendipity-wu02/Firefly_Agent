import "../../../src/main/memory-core/worker";
import fs from "node:fs";
import path from "node:path";
import {workerData,threadId} from "node:worker_threads";
import {within,canonicalPath} from "../../../src/main/runtime-profile";
const cwd=path.resolve("E:/Codex/Firefly_Agent-skills-layout/output/task-b-memory-core");
if(process.cwd()!==cwd||!within(path.join(cwd,"output","memory-core"),canonicalPath(workerData.probeReport)))throw new Error("PROBE_WORKER_ROOT_INVALID");
fs.writeFileSync(workerData.probeReport,JSON.stringify({electron:process.versions.electron,node:process.versions.node,sqlite:process.versions.sqlite,uv:process.versions.uv,threadId}));