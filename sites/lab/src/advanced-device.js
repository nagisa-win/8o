/**
 * 设备舱的「工具模式」：基于公开库 @yume-chan/adb（MIT，即 ya-webadb）实现。
 * 这个文件会被 vite 打成单文件放到 /assets/vendor/advanced-device.js，
 * 静态站点本身不需要打包器，只有这一块依赖第三方时才预编译。
 */

import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";

const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
const credentials = new AdbWebCredentialStore("8o-lab");

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmtSize = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

let adb = null;
let cleanup = null;

export async function mount(el) {
  if (!manager) {
    el.innerHTML = '<p class="hint" style="color:var(--rose)">当前浏览器不支持 WebUSB，工具模式不可用。</p>';
    return;
  }

  el.innerHTML = `
    <div class="device-tools">
      <div class="card">
        <div class="card__title"><span>CONNECTION</span><span id="adv-state">未连接</span></div>
        <div class="row">
          <button class="btn-sm" id="adv-connect" type="button">连接设备（ya-webadb）</button>
          <button class="btn-sm" id="adv-shot" type="button" disabled>截屏</button>
        </div>
        <pre class="out" id="adv-info" style="margin-top:12px;max-height:180px">连接后这里显示设备属性。</pre>
        <div id="adv-shot-box"></div>
      </div>

      <div class="card">
        <div class="card__title"><span>SHELL</span><span>adb subprocess</span></div>
        <div class="row">
          <input type="text" id="adv-cmd" value="getprop ro.build.version.release" spellcheck="false" style="flex:1" />
          <button class="btn-sm" id="adv-run" type="button" disabled>执行</button>
        </div>
        <pre class="out" id="adv-shell" style="margin-top:12px;max-height:200px">—</pre>
      </div>

      <div class="card">
        <div class="card__title"><span>APPS</span><span id="adv-apps-count">—</span></div>
        <div class="row"><button class="btn-sm" id="adv-apps" type="button" disabled>列出第三方应用</button></div>
        <pre class="out" id="adv-apps-out" style="margin-top:12px;max-height:200px">—</pre>
      </div>

      <div class="card">
        <div class="card__title"><span>FILES /sdcard</span><span id="adv-files-state">—</span></div>
        <div class="row" style="margin-bottom:10px">
          <input type="text" id="adv-path" value="/sdcard/Download" spellcheck="false" style="flex:1" />
          <button class="btn-sm" id="adv-ls" type="button" disabled>浏览</button>
        </div>
        <div id="adv-files" class="adv-files"><p class="hint">连接后可浏览</p></div>
        <div class="row" style="margin-top:12px">
          <input type="file" id="adv-upload" disabled />
          <button class="btn-sm" id="adv-push" type="button" disabled>推送到该目录</button>
        </div>
        <p class="hint" id="adv-push-info"></p>
      </div>
    </div>
  `;

  const $ = (s) => el.querySelector(s);
  const listeners = [];
  const on = (node, ev, fn) => {
    node.addEventListener(ev, fn);
    listeners.push([node, ev, fn]);
  };

  const setState = (t, color) => {
    const s = $("#adv-state");
    s.textContent = t;
    s.style.color = color || "";
  };

  const enable = (on_) => {
    ["#adv-run", "#adv-apps", "#adv-ls", "#adv-shot"].forEach((s) => ($(s).disabled = !on_));
    $("#adv-upload").disabled = !on_;
    $("#adv-push").disabled = !on_;
  };

  /* ---------- 连接 ---------- */

  on($("#adv-connect"), "click", async () => {
    setState("连接中…", "var(--amber)");
    try {
      const device = await manager.requestDevice();
      if (!device) {
        setState("已取消");
        return;
      }
      const connection = await device.connect();
      const transport = await AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore: credentials,
      });
      adb = new Adb(transport);
      setState("已连接", "var(--mint)");
      enable(true);

      const props = ["ro.product.brand", "ro.product.model", "ro.build.version.release", "ro.build.version.sdk", "ro.product.cpu.abi"];
      const values = await Promise.all(props.map((p) => adb.getProp(p).catch(() => "—")));
      $("#adv-info").innerHTML = [
        `<b>序列号</b>  ${esc(device.serial)}`,
        ...props.map((p, i) => `<b>${p.replace("ro.", "")}</b>  ${esc(values[i] || "—")}`),
      ].join("\n");
    } catch (err) {
      setState("失败", "var(--rose)");
      $("#adv-info").textContent = String(err.message || err);
    }
  });

  /* ---------- Shell / 应用 ---------- */

  on($("#adv-run"), "click", async () => {
    if (!adb) return;
    const cmd = $("#adv-cmd").value.trim();
    $("#adv-shell").textContent = "执行中…";
    try {
      const out = await adb.subprocess.noneProtocol.spawnWaitText(cmd);
      $("#adv-shell").textContent = out || "（无输出）";
    } catch (err) {
      $("#adv-shell").textContent = `失败：${err.message}`;
    }
  });

  on($("#adv-apps"), "click", async () => {
    if (!adb) return;
    $("#adv-apps-out").textContent = "读取中…";
    try {
      const out = await adb.subprocess.noneProtocol.spawnWaitText("pm list packages -3");
      const list = out.split("\n").map((l) => l.replace("package:", "").trim()).filter(Boolean).sort();
      $("#adv-apps-count").textContent = `${list.length} 个`;
      $("#adv-apps-out").textContent = list.join("\n") || "没有第三方应用";
    } catch (err) {
      $("#adv-apps-out").textContent = `失败：${err.message}`;
    }
  });

  /* ---------- 文件 ---------- */

  /** 把 stream 读成 Blob，顺便统计字节数 */
  async function streamToBlob(stream) {
    const reader = stream.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    return { blob: new Blob(chunks), size };
  }

  async function listDir(path) {
    const sync = await adb.sync();
    const entries = await sync.readdir(path);
    return entries
      .filter((e) => e.name !== "." && e.name !== "..")
      .sort((a, b) => Number(b.isDirectory?.() ?? false) - Number(a.isDirectory?.() ?? false));
  }

  on($("#adv-ls"), "click", async () => {
    if (!adb) return;
    const path = $("#adv-path").value.trim();
    $("#adv-files-state").textContent = "读取中…";
    try {
      const entries = await listDir(path);
      $("#adv-files-state").textContent = `${entries.length} 项`;
      $("#adv-files").innerHTML = entries
        .slice(0, 200)
        .map((e) => {
          const dir = typeof e.isDirectory === "function" ? e.isDirectory() : false;
          const size = typeof e.size === "bigint" ? Number(e.size) : e.size || 0;
          return `<div class="adv-file">
            <span class="mono">${dir ? "📁" : "📄"} ${esc(e.name)}</span>
            <span class="mono" style="opacity:.6">${dir ? "" : fmtSize(size)}</span>
            ${dir ? `<button class="btn-sm" data-enter="${esc(e.name)}" type="button">进入</button>` : `<button class="btn-sm" data-pull="${esc(e.name)}" type="button">下载</button>`}
          </div>`;
        })
        .join("") || '<p class="hint">空目录</p>';

      $("#adv-files").querySelectorAll("[data-enter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          $("#adv-path").value = `${path.replace(/\/$/, "")}/${btn.dataset.enter}`;
          $("#adv-ls").click();
        });
      });

      $("#adv-files").querySelectorAll("[data-pull]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.textContent = "拉取中";
          try {
            const sync = await adb.sync();
            const full = `${path.replace(/\/$/, "")}/${btn.dataset.pull}`;
            const { blob, size } = await streamToBlob(sync.read(full));
            const url = URL.createObjectURL(blob);
            btn.textContent = fmtSize(size);
            btn.replaceWith(
              Object.assign(document.createElement("a"), {
                href: url,
                download: btn.dataset.pull,
                textContent: "保存",
                className: "btn-sm",
              })
            );
          } catch (err) {
            btn.textContent = "失败";
            $("#adv-push-info").textContent = String(err.message || err);
          }
        });
      });
    } catch (err) {
      $("#adv-files-state").textContent = "失败";
      $("#adv-files").innerHTML = `<p class="hint" style="color:var(--rose)">${esc(err.message)}</p>`;
    }
  });

  on($("#adv-push"), "click", async () => {
    if (!adb) return;
    const file = $("#adv-upload").files?.[0];
    if (!file) {
      $("#adv-push-info").textContent = "先选一个文件";
      return;
    }
    const dir = $("#adv-path").value.trim().replace(/\/$/, "");
    $("#adv-push-info").textContent = `推送 ${file.name}…`;
    try {
      const sync = await adb.sync();
      await sync.write({
        filename: `${dir}/${file.name}`,
        file: file.stream(),
        permission: 0o644,
        mtime: Math.floor(Date.now() / 1000),
      });
      $("#adv-push-info").textContent = `已推送 ${file.name}（${fmtSize(file.size)}）`;
    } catch (err) {
      $("#adv-push-info").textContent = `推送失败：${err.message}`;
    }
  });

  /* ---------- 截屏 ---------- */

  on($("#adv-shot"), "click", async () => {
    if (!adb) return;
    const box = $("#adv-shot-box");
    box.textContent = "截屏中…";
    try {
      const fb = await adb.framebuffer();
      const canvas = document.createElement("canvas");
      canvas.width = fb.width;
      canvas.height = fb.height;
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(fb.width, fb.height);

      // framebuffer 一般是 RGBA_8888，个别老设备是 RGB_565，这里按 4 字节处理
      if (fb.data.length === fb.width * fb.height * 4) {
        img.data.set(fb.data);
        ctx.putImageData(img, 0, 0);
        const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
        const url = URL.createObjectURL(blob);
        box.innerHTML = `<a href="${url}" download="screenshot-${Date.now()}.png" class="btn-sm" style="display:inline-block;margin-top:10px">保存截图</a>
          <img src="${url}" alt="设备截图" style="margin-top:10px;border:1px solid var(--line);border-radius:8px;max-width:100%" />`;
      } else {
        box.textContent = `不支持的 framebuffer 格式：${fb.data.length} 字节 / ${fb.width}×${fb.height}`;
      }
    } catch (err) {
      box.textContent = `截屏失败：${err.message}`;
    }
  });

  cleanup = () => {
    listeners.forEach(([node, ev, fn]) => node.removeEventListener(ev, fn));
    if (adb) {
      try {
        adb.close?.();
      } catch {
        /* 忽略关闭异常 */
      }
      adb = null;
    }
  };
}

export function unmount() {
  if (cleanup) cleanup();
  cleanup = null;
}
