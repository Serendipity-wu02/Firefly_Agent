import fs from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { expect, it } from "vitest";

interface WorkflowContract {
  on: { pull_request: { branches: string[] }; push: { branches: string[] } };
  permissions: Record<string, string>;
}

it.each(["test.yml", "plugin-sdk.yml"])("%s checks PRs targeting the release branch with read-only permissions", file => {
  const workflow = load(fs.readFileSync(path.resolve(".github/workflows", file), "utf8")) as WorkflowContract;
  expect(workflow.on.pull_request.branches).toEqual([
    "main", "chore/project-structure-finalize", "firefly-mini-v1.1.x",
  ]);
  expect(workflow.on.push.branches).toEqual(["main", "firefly-mini-v1.1.x"]);
  expect(workflow.permissions).toEqual({ contents: "read" });
});
