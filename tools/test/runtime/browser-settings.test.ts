import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SettingsManager } from "../../../dist/main/main/settings/settings-manager.js";

function withTemporarySettings(run: (settingsPath: string) => void): void {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "firefly-browser-settings-"));
  const settingsPath = path.join(directory, "settings.json");
  try {
    run(settingsPath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function readSettingsFile(settingsPath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
  assert.equal(Array.isArray(parsed), false);
  return parsed as Record<string, unknown>;
}

test("Browser settings default to direct when the existing settings file has no Browser field", () => {
  withTemporarySettings((settingsPath) => {
    const settings = new SettingsManager(settingsPath);
    const snapshot = settings.getSnapshot();

    assert.ok(snapshot.browser);
    assert.equal(snapshot.browser.status, "default");
    assert.equal(snapshot.browser.revision, 1);
    assert.equal(snapshot.browser.settings.transportMode, "direct");
    assert.deepEqual(snapshot.browser.settings.allowedOrigins, []);
    assert.equal(fs.existsSync(settingsPath), false);
  });
});

test("Direct and HTTP proxy settings use the existing Settings IPC persistence owner", () => {
  withTemporarySettings((settingsPath) => {
    const settings = new SettingsManager(settingsPath);

    assert.equal(settings.save({ browser: { transportMode: "direct" } }), true);
    const direct = settings.getBrowserSettingsSnapshot();
    assert.equal(direct.status, "configured");
    assert.equal(direct.revision, 1);
    assert.equal(direct.settings.transportMode, "direct");

    assert.equal(
      settings.save({ browser: { transportMode: "http_proxy", httpProxy: "http://127.0.0.1:18080/" } }),
      true,
    );
    const proxy = settings.load().browser;
    assert.ok(proxy);
    assert.equal(proxy.status, "configured");
    assert.equal(proxy.revision, 2);
    assert.equal(proxy.settings.transportMode, "http_proxy");
    if (proxy.settings.transportMode === "http_proxy") {
      assert.deepEqual(proxy.settings.httpProxy, {
        protocol: "http:",
        hostname: "127.0.0.1",
        port: 18080,
      });
    }

    const persisted = readSettingsFile(settingsPath);
    assert.deepEqual(persisted.browser, {
      transportMode: "http_proxy",
      allowedOrigins: [],
      httpProxy: { protocol: "http:", hostname: "127.0.0.1", port: 18080 },
    });
  });
});

test("Main rejects invalid Browser updates without changing the valid configuration", () => {
  withTemporarySettings((settingsPath) => {
    const settings = new SettingsManager(settingsPath);
    assert.equal(
      settings.save({ browser: { transportMode: "http_proxy", httpProxy: "http://127.0.0.1:18080" } }),
      true,
    );
    const beforeFile = fs.readFileSync(settingsPath, "utf8");
    const beforeSnapshot = settings.getBrowserSettingsSnapshot();

    const invalidEndpoints = [
      "",
      "http://127.0.0.1",
      "https://127.0.0.1:18080",
      "socks5://127.0.0.1:18080",
      "http://user:password@127.0.0.1:18080",
      "http://127.0.0.1:18080/query",
      "http://127.0.0.1:65536",
    ];
    for (const httpProxy of invalidEndpoints) {
      assert.equal(
        settings.save({ browser: { transportMode: "http_proxy", httpProxy } }),
        false,
        httpProxy,
      );
    }
    assert.equal(
      settings.save({ browser: { transportMode: "direct", httpProxy: "http://127.0.0.1:18080" } } as never),
      false,
    );
    assert.equal(
      settings.save({ browser: { transportMode: "invalid", httpProxy: 123 } } as never),
      false,
    );

    assert.equal(fs.readFileSync(settingsPath, "utf8"), beforeFile);
    assert.deepEqual(settings.getBrowserSettingsSnapshot(), beforeSnapshot);
  });
});

test("A damaged saved Browser section remains unavailable instead of falling back to direct", () => {
  withTemporarySettings((settingsPath) => {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        llm: { provider: "local" },
        browser: {
          transportMode: "http_proxy",
          httpProxy: { protocol: "https:", hostname: "127.0.0.1", port: 18080 },
        },
      }),
      "utf8",
    );

    const settings = new SettingsManager(settingsPath);
    const damaged = settings.getBrowserSettingsSnapshot();
    assert.equal(damaged.status, "unavailable");
    assert.equal(damaged.reason, "invalid_saved_configuration");
    assert.equal(damaged.revision, 1);

    assert.equal(settings.save({ ui: { fontSize: "large" } }), true);
    const afterUnrelatedSave = new SettingsManager(settingsPath).getSnapshot();
    assert.equal(afterUnrelatedSave.browser?.status, "unavailable");
    assert.equal(afterUnrelatedSave.ui?.fontSize, "large");

    assert.equal(settings.save({ browser: { transportMode: "direct" } }), true);
    const repaired = settings.getBrowserSettingsSnapshot();
    assert.equal(repaired.status, "configured");
    assert.equal(repaired.revision, 2);
    assert.equal(repaired.settings.transportMode, "direct");
  });
});

test("Browser settings revisions track normalized changes and snapshots are immutable", () => {
  withTemporarySettings((settingsPath) => {
    const settings = new SettingsManager(settingsPath);
    assert.equal(settings.getBrowserSettingsSnapshot().revision, 1);

    assert.equal(
      settings.save({ browser: { transportMode: "http_proxy", httpProxy: "http://127.0.0.1:18080" } }),
      true,
    );
    assert.equal(settings.getBrowserSettingsSnapshot().revision, 2);
    assert.equal(
      settings.save({ browser: { transportMode: "http_proxy", httpProxy: "HTTP://127.0.0.1:18080/" } }),
      true,
    );
    assert.equal(settings.getBrowserSettingsSnapshot().revision, 2);

    assert.equal(
      settings.save({ browser: { transportMode: "http_proxy", httpProxy: "http://127.0.0.1:18081" } }),
      true,
    );
    assert.equal(settings.getBrowserSettingsSnapshot().revision, 3);
    assert.equal(
      settings.save({ browser: { transportMode: "http_proxy", httpProxy: "http://127.0.0.1:18080" } }),
      true,
    );
    assert.equal(settings.getBrowserSettingsSnapshot().revision, 4);
    assert.equal(settings.save({ browser: { transportMode: "direct" } }), true);
    assert.equal(settings.getBrowserSettingsSnapshot().revision, 5);
    assert.equal(
      settings.save({ browser: { transportMode: "http_proxy", httpProxy: "http://127.0.0.1:18080" } }),
      true,
    );
    assert.equal(settings.getBrowserSettingsSnapshot().revision, 6);

    const snapshot = settings.getBrowserSettingsSnapshot();
    assert.equal(Object.isFrozen(snapshot), true);
    if (snapshot.status !== "unavailable") {
      assert.equal(Object.isFrozen(snapshot.settings), true);
      assert.equal(Reflect.set(snapshot, "revision", 999), false);
      assert.equal(Reflect.set(snapshot.settings, "transportMode", "direct"), false);
      if (snapshot.settings.transportMode === "http_proxy") {
        assert.equal(Object.isFrozen(snapshot.settings.httpProxy), true);
        assert.equal(Reflect.set(snapshot.settings.httpProxy, "port", 1), false);
      }
    }

    const revisionBeforeUnrelatedSave = settings.getBrowserSettingsSnapshot().revision;
    assert.equal(settings.save({ ui: { fontSize: "small" } }), true);
    assert.equal(settings.getBrowserSettingsSnapshot().revision, revisionBeforeUnrelatedSave);
  });
});

test("Browser allowed Origins are exact, normalized, revisioned, and do not perform network I/O", () => {
  withTemporarySettings((settingsPath) => {
    const settings = new SettingsManager(settingsPath);
    assert.equal(settings.save({
      browser: {
        transportMode: "direct",
        allowedOrigins: [
          "HTTPS://Example.com:443/",
          "https://example.com",
          "https://docs.example.com/",
        ],
      },
    }), true);
    const first = settings.getBrowserSettingsSnapshot();
    assert.equal(first.revision, 2);
    assert.equal(first.status, "configured");
    if (first.status === "configured") {
      assert.deepEqual(first.settings.allowedOrigins, [
        "https://docs.example.com",
        "https://example.com",
      ]);
    }

    assert.equal(settings.save({
      browser: {
        transportMode: "direct",
        allowedOrigins: ["https://example.com/", "https://docs.example.com"],
      },
    }), true);
    assert.equal(settings.getBrowserSettingsSnapshot().revision, 2);

    const beforeInvalid = settings.getBrowserSettingsSnapshot();
    const beforeFile = fs.readFileSync(settingsPath, "utf8");
    for (const allowedOrigins of [
      ["https://example.com/path"],
      ["https://example.com?query=1"],
      ["https://*.example.com"],
      ["example.com"],
    ]) {
      assert.equal(settings.save({
        browser: { transportMode: "direct", allowedOrigins },
      }), false);
    }
    assert.deepEqual(settings.getBrowserSettingsSnapshot(), beforeInvalid);
    assert.equal(fs.readFileSync(settingsPath, "utf8"), beforeFile);

    assert.equal(settings.save({
      browser: {
        transportMode: "direct",
        allowedOrigins: ["https://other.example"],
      },
    }), true);
    assert.equal(settings.getBrowserSettingsSnapshot().revision, 3);
    assert.equal(settings.save({
      browser: {
        transportMode: "direct",
        allowedOrigins: ["https://example.com"],
      },
    }), true);
    assert.equal(settings.getBrowserSettingsSnapshot().revision, 4);
  });
});

test("A legacy Browser section without allowed Origins migrates to an empty list", () => {
  withTemporarySettings((settingsPath) => {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        browser: {
          transportMode: "http_proxy",
          httpProxy: { protocol: "http:", hostname: "127.0.0.1", port: 18080 },
        },
      }),
      "utf8",
    );
    const settings = new SettingsManager(settingsPath);
    const snapshot = settings.getBrowserSettingsSnapshot();
    assert.equal(snapshot.status, "configured");
    if (snapshot.status === "configured") {
      assert.deepEqual(snapshot.settings.allowedOrigins, []);
      assert.equal(snapshot.settings.transportMode, "http_proxy");
    }
  });
});

test("Settings validation performs no Browser network I/O and production registration is explicit", () => {
  const managerSource = fs.readFileSync(
    path.join(process.cwd(), "src", "main", "settings", "settings-manager.ts"),
    "utf8",
  );
  const dependenciesSource = fs.readFileSync(
    path.join(process.cwd(), "src", "main", "application", "default-dependencies.ts"),
    "utf8",
  );
  const settingsViewSource = fs.readFileSync(
    path.join(process.cwd(), "src", "renderer", "ui", "components", "SettingsView.tsx"),
    "utf8",
  );

  assert.doesNotMatch(managerSource, /node:dns|net\.connect|http\.request|https\.request/u);
  assert.match(managerSource, /normalizeBrowserProxyEndpoint/u);
  assert.match(dependenciesSource, /createBrowserReadTool/u);
  assert.match(dependenciesSource, /BROWSER_STATIC_READ_CAPABILITY_ID/u);
  assert.match(settingsViewSource, /data-browser-network-settings/u);
  assert.doesNotMatch(settingsViewSource, /Browser 工具尚未开放/u);
  assert.match(settingsViewSource, /当前用户在 Chat 消息/u);
  assert.doesNotMatch(settingsViewSource, /测试连接|test connection/u);
});
