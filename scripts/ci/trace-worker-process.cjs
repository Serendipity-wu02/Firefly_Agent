const { appendFileSync } = require("node:fs");
const path = require("node:path");
const { ChildProcess } = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");
const output = process.env.FIREFLY_VITEST_DIAGNOSTICS;
const write = (event, details = {}) => appendFileSync(path.join(output, `process-${process.pid}.jsonl`), JSON.stringify({ time: new Date().toISOString(), event, pid: process.pid, ppid: process.ppid, ...details }) + "\n");
const stack = () => new Error().stack.split("\n").slice(2, 10);
write("process-start", { node: process.version, uv: process.versions.uv });
process.on("exit", code => write("process-exit", { code }));
process.on("disconnect", () => write("process-disconnect"));
process.on("uncaughtExceptionMonitor", error => write("uncaught-exception", { name: error.name, code: error.code }));
for (const method of ["exit", "abort", "kill"]) {
  const original = process[method];
  process[method] = function (...args) {
    write(`process-${method}-request`, { values: args, stack: stack() });
    return original.apply(this, args);
  };
}
const originalSpawn = ChildProcess.prototype.spawn;
ChildProcess.prototype.spawn = function (...args) {
  const result = originalSpawn.apply(this, args);
  const executable = args[0].file;
  const isBash = path.basename(executable) === "bash.exe";
  write("child-spawn", {
    childPid: this.pid,
    executable: isBash ? executable : path.basename(executable),
    ...(isBash ? { phase: args[0].args.at(-1) === "printf firefly-bash-probe" ? "probe" : "command" } : {}),
  });
  this.on("exit", (code, signal) => write("child-exit", { childPid: this.pid, code, signal }));
  this.on("close", (code, signal) => write("child-close", { childPid: this.pid, code, signal }));
  return result;
};
const originalKill = ChildProcess.prototype.kill;
ChildProcess.prototype.kill = function (signal) {
  write("child-kill", { childPid: this.pid, signal, stack: stack() });
  return originalKill.call(this, signal);
};
syncBuiltinESMExports();
