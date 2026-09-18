import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const read = (relativePath: string): string => fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("A-G. Approval view renders requester, operation, capability, risk, side effect, scope, and expiry", () => {
  const source = read("src/renderer/ui/components/ApprovalView.tsx");
  assert.match(source, /requesterLabel/);
  assert.match(source, /摘要/);
  assert.match(source, /原因/);
  assert.match(source, /能力/);
  assert.match(source, /风险/);
  assert.match(source, /副作用/);
  assert.match(source, /有效沙箱范围/);
  assert.match(source, /expiresAt/);
  assert.match(source, /允许/);
  assert.match(source, /data-approval-view="true"/);
});

test("F-H. Approval view uses typed approve, deny, and native close paths", () => {
  const source = read("src/renderer/ui/components/ApprovalView.tsx");
  assert.match(source, /resolveApproval/);
  assert.match(source, /action/);
  assert.match(source, /"approve"/);
  assert.match(source, /"deny"/);
  assert.match(source, /window\.firefly\?\.close/);
});

test("I-Q. Approval renderer contains no policy, execution, second store, or persistent grant UI", () => {
  const source = read("src/renderer/ui/components/ApprovalView.tsx");
  for (const forbidden of [
    "ApprovalService",
    "SandboxPolicy",
    "ToolExecutionEngine",
    "FireflyHarness",
    "new Map",
    "Always",
    "Forever",
    "Trust",
    "永久",
    "信任",
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not be in ApprovalView`);
  }
  assert.match(source, /ONCE/);
  assert.match(source, /本进程范围/);
});

test("Approval card is anchored above the composer, outside the message scroll region", () => {
  const app = read("src/renderer/ui/App.tsx");
  const messagesStart = app.indexOf("{/* Messages List */}");
  const approvalAnchor = app.indexOf('data-approval-anchor="composer"');
  const composer = app.indexOf("<Composer");

  assert.ok(messagesStart >= 0, "message list marker must remain in the Chat renderer");
  assert.ok(approvalAnchor > messagesStart, "approval card must render after the message list");
  assert.ok(composer > approvalAnchor, "approval card must render before the composer");
  assert.doesNotMatch(app.slice(messagesStart, approvalAnchor), /InlineApprovalCard/u);
  assert.match(app, /data-approval-anchor="composer"/u);
});

test("T. Approval view is a dedicated renderer route and window", () => {
  const app = read("src/renderer/ui/App.tsx");
  const views = read("src/shared/window-types.ts");
  const windowManager = read("src/main/windows/window-manager.ts");
  assert.match(app, /rendererView === "approval"/);
  assert.match(views, /"approval"/);
  assert.match(windowManager, /getRendererDevUrl\("approval"\)/);
  assert.match(windowManager, /query: \{ \[RENDERER_VIEW_QUERY_PARAM\]: "approval" \}/);
});
