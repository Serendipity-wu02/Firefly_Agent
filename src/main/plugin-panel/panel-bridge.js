/**
 * 插件设置面板官方桥（cyrene-panel/1）。
 *
 * 由宿主经保留路径 /.cyrene/panel-bridge.js 统一分发，插件面板 HTML 内一行引入：
 *   <script src="/.cyrene/panel-bridge.js"></script>
 *
 * 职责：
 * - invoke(channel, ...args)：面板 → 宿主受控 IPC 转发（pluginId 由宿主按
 *   iframe 归属绑定，面板无法指定其他插件）；
 * - onTheme(cb) / init / theme-changed：主题唯一链路，宿主下发的 CSS 变量
 *   写入面板 :root；
 * - 高度自动上报：ResizeObserver 必须在 iframe 内部运行（宿主对沙箱 iframe
 *   无法可靠观察文档尺寸），插件无感知。
 */
(function () {
  "use strict";

  var PROTOCOL = "cyrene-panel/1";
  var seq = 0;
  var pending = new Map();
  var themeCallbacks = [];

  function post(message) {
    message.protocol = PROTOCOL;
    // 面板→宿主方向用 "*"：宿主 origin 在打包（file://）与开发（localhost）
    // 间不同，安全由接收方 source+origin 双校验保证，不依赖投递目标
    window.parent.postMessage(message, "*");
  }

  function applyTheme(theme) {
    if (!theme || typeof theme !== "object") return;
    var root = document.documentElement;
    var tokens = theme.tokens;
    if (tokens && typeof tokens === "object") {
      Object.keys(tokens).forEach(function (key) {
        root.style.setProperty(key, tokens[key]);
      });
    }
    themeCallbacks.slice().forEach(function (cb) {
      try { cb(theme); } catch (e) { /* 订阅者异常不影响其余回调 */ }
    });
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.protocol !== PROTOCOL) return;
    if (data.kind === "invoke-result") {
      var entry = pending.get(data.seq);
      if (entry) {
        pending.delete(data.seq);
        if (data.ok) entry.resolve(data.data);
        else entry.reject(new Error(typeof data.error === "string" ? data.error : "面板调用失败"));
      }
      return;
    }
    if (data.kind === "init" || data.kind === "theme-changed") {
      applyTheme(data.theme);
    }
  });

  function reportHeight() {
    post({ kind: "height", height: document.documentElement.scrollHeight });
  }

  window.addEventListener("load", function () {
    reportHeight();
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(reportHeight).observe(document.documentElement);
    }
  });

  window.CyrenePanel = {
    invoke: function (channel) {
      var args = Array.prototype.slice.call(arguments, 1);
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        pending.set(id, { resolve: resolve, reject: reject });
        post({ kind: "invoke", seq: id, channel: channel, args: args });
      });
    },
    onTheme: function (cb) {
      if (typeof cb !== "function") return function () {};
      themeCallbacks.push(cb);
      return function () {
        var index = themeCallbacks.indexOf(cb);
        if (index >= 0) themeCallbacks.splice(index, 1);
      };
    },
    ready: function () {
      reportHeight();
    },
  };
})();
