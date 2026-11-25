/**
 * 设备舱 · 工具模式：基于公开库 @yume-chan/adb（MIT，即 ya-webadb）实现。
 * 由 vite 预编译成 /assets/vendor/advanced-device.js，静态站点本身不带打包器。
 *
 * 能力：设备属性、交互终端（shell 协议）、第三方应用列表与管理、
 *       文件浏览/拉取/推送、APK 安装、系统控制（重启/分辨率/密度/按键/电池）、截屏。
 * 所有命令都在浏览器与手机之间直连完成，没有服务器中转。
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

const KEYCODES = [
  ["返回", 4],
  ["主页", 3],
  ["菜单", 82],
  ["任务", 187],
  ["音量+", 24],
  ["音量-", 25],
  ["电源", 26],
  ["截屏", 120],
  ["上", 19],
  ["下", 20],
  ["左", 21],
  ["右", 22],
  ["确定", 66],
];

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
        <div class="card__title"><span>TERMINAL</span><span id="term-state">未连接</span></div>
        <pre class="out" id="term-out" style="height:240px;max-height:240px;margin-bottom:10px">连接后点「启动 shell」，这里是设备上的输出。</pre>
        <div class="row">
          <span class="mono" style="color:var(--accent)">$</span>
          <input type="text" id="term-in" placeholder="输入命令后回车，例如 ls -l /sdcard" spellcheck="false" style="flex:1" disabled />
          <button class="btn-sm" id="term-start" type="button" disabled>启动 shell</button>
          <button class="btn-sm" id="term-stop" type="button" disabled>结束</button>
        </div>
      </div>

      <div class="card">
        <div class="card__title"><span>APPS</span><span id="adv-apps-count">—</span></div>
        <div class="row" style="margin-bottom:10px">
          <button class="btn-sm" id="adv-apps" type="button" disabled>列出第三方应用</button>
          <input type="text" id="adv-pkg" placeholder="包名，例如 com.tencent.mm" spellcheck="false" style="flex:1" />
        </div>
        <div class="row" style="margin-bottom:10px">
          <button class="btn-sm" id="pkg-stop" type="button" disabled>强制停止</button>
          <button class="btn-sm" id="pkg-clear" type="button" disabled>清数据</button>
          <button class="btn-sm" id="pkg-disable" type="button" disabled>禁用</button>
          <button class="btn-sm" id="pkg-enable" type="button" disabled>启用</button>
          <button class="btn-sm" id="pkg-uninstall" type="button" disabled>卸载</button>
        </div>
        <pre class="out" id="adv-apps-out" style="max-height:180px">—</pre>
      </div>

      <div class="card">
        <div class="card__title"><span>APK INSTALL</span><span id="apk-state">—</span></div>
        <div class="row">
          <input type="file" id="apk-file" accept=".apk" disabled />
          <button class="btn-sm" id="apk-install" type="button" disabled>推送到设备并安装</button>
        </div>
        <p class="hint" id="apk-info" style="margin-top:8px">安装走 /data/local/tmp + pm install -r，不需要 root。</p>
      </div>

      <div class="card">
        <div class="card__title"><span>SYSTEM</span><span id="sys-state">—</span></div>
        <div class="row" style="margin-bottom:10px">
          <button class="btn-sm" id="sys-info" type="button" disabled>读取显示与电池</button>
        </div>
        <pre class="out" id="sys-out" style="max-height:160px">—</pre>
        <div class="row" style="margin-top:10px">
          <input type="text" id="sys-size" placeholder="分辨率 1080x2340" spellcheck="false" style="flex:1" />
          <button class="btn-sm" id="sys-size-set" type="button" disabled>设置</button>
          <button class="btn-sm" id="sys-size-reset" type="button" disabled>重置</button>
        </div>
        <div class="row" style="margin-top:8px">
          <input type="text" id="sys-dpi" placeholder="密度 420" spellcheck="false" style="flex:1" />
          <button class="btn-sm" id="sys-dpi-set" type="button" disabled>设置</button>
          <button class="btn-sm" id="sys-dpi-reset" type="button" disabled>重置</button>
        </div>
        <div class="row" style="margin-top:8px" id="key-row"></div>
        <div class="row" style="margin-top:8px">
          <input type="text" id="sys-tap" placeholder="点按坐标 x y" spellcheck="false" style="flex:1" />
          <button class="btn-sm" id="sys-tap-go" type="button" disabled>点按</button>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn-sm" id="sys-bat" type="button" disabled>模拟电量 50%</button>
          <button class="btn-sm" id="sys-bat-reset" type="button" disabled>恢复真实电量</button>
          <button class="btn-sm" id="sys-reboot" type="button" disabled>重启</button>
          <button class="btn-sm" id="sys-bootloader" type="button" disabled>进 fastboot</button>
          <button class="btn-sm" id="sys-recovery" type="button" disabled>进 recovery</button>
        </div>
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

  const BTN_IDS = [
    "#adv-run", "#adv-apps", "#adv-ls", "#adv-shot", "#term-start", "#apk-install", "#sys-info",
    "#sys-size-set", "#sys-size-reset", "#sys-dpi-set", "#sys-dpi-reset", "#sys-tap-go", "#sys-bat",
    "#sys-bat-reset", "#sys-reboot", "#sys-bootloader", "#sys-recovery",
    "#pkg-stop", "#pkg-clear", "#pkg-disable", "#pkg-enable", "#pkg-uninstall",
  ];

  const setState = (id, t, color) => {
    const s = $(id);
    if (!s) return;
    s.textContent = t;
    s.style.color = color || "";
  };

  const enable = (on_) => {
    BTN_IDS.forEach((id) => {
      const node = $(id);
      if (node) node.disabled = !on_;
    });
    ["#apk-file", "#adv-upload", "#term-in"].forEach((id) => {
      const node = $(id);
      if (node) node.disabled = !on_;
    });
    el.querySelectorAll("#key-row .btn-sm").forEach((b) => (b.disabled = !on_));
  };

  /** 所有 shell 命令都走这里：统一错误呈现，省得每处都写 try */
  const shell = async (cmd) => adb.subprocess.noneProtocol.spawnWaitText(cmd);

  const needConnect = () => {
    setState("#adv-state", "请先连接设备", "var(--amber)");
  };

  /* ---------- 连接 ---------- */

  on($("#adv-connect"), "click", async () => {
    setState("#adv-state", "连接中…", "var(--amber)");
    try {
      const device = await manager.requestDevice();
      if (!device) {
        setState("#adv-state", "已取消");
        return;
      }
      const connection = await device.connect();
      const transport = await AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore: credentials,
      });
      adb = new Adb(transport);
      setState("#adv-state", "已连接", "var(--mint)");
      setState("#term-state", "就绪");
      enable(true);

      const props = ["ro.product.brand", "ro.product.model", "ro.build.version.release", "ro.build.version.sdk", "ro.product.cpu.abi"];
      const values = await Promise.all(props.map((p) => adb.getProp(p).catch(() => "—")));
      $("#adv-info").innerHTML = [
        `<b>序列号</b>  ${esc(device.serial)}`,
        ...props.map((p, i) => `<b>${p.replace("ro.", "")}</b>  ${esc(values[i] || "—")}`),
      ].join("\n");
    } catch (err) {
      setState("#adv-state", "失败", "var(--rose)");
      $("#adv-info").textContent = String(err.message || err);
    }
  });

  /* ---------- 交互终端 ---------- */

  let termProc = null;
  let termWriter = null;

  const termWrite = (text) => {
    const out = $("#term-out");
    out.textContent += text;
    out.scrollTop = out.scrollHeight;
  };

  on($("#term-start"), "click", async () => {
    if (!adb) return needConnect();
    const spawner = adb.subprocess.shellProtocol;
    if (!spawner) {
      setState("#term-state", "设备不支持 shell v2", "var(--amber)");
      return;
    }
    try {
      termProc = await spawner.spawn("sh");
      termWriter = termProc.stdin.getWriter();
      setState("#term-state", "shell 已启动", "var(--mint)");
      $("#term-out").textContent = "";

      // 持续读取设备输出，直到进程结束
      const reader = termProc.output.getReader();
      const decoder = new TextDecoder();
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          termWrite(decoder.decode(value, { stream: true }));
        }
        setState("#term-state", "shell 已结束");
        $("#term-in").disabled = true;
      })();
    } catch (err) {
      setState("#term-state", `启动失败：${err.message}`, "var(--rose)");
    }
  });

  on($("#term-stop"), "click", async () => {
    if (termWriter) {
      try {
        await termWriter.close();
      } catch {
        /* 已经关闭 */
      }
      termWriter = null;
      termProc = null;
      setState("#term-state", "已结束");
      $("#term-in").disabled = true;
    }
  });

  const submitCommand = async () => {
    const input = $("#term-in");
    const cmd = input.value;
    if (!termWriter) return;
    termWrite(`$ ${cmd}\n`);
    try {
      await termWriter.write(new TextEncoder().encode(`${cmd}\n`));
    } catch (err) {
      termWrite(`[写入失败] ${err.message}\n`);
    }
    input.value = "";
  };

  on($("#term-in"), "keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitCommand();
    }
  });

  /* ---------- 应用列表与管理 ---------- */

  on($("#adv-apps"), "click", async () => {
    if (!adb) return needConnect();
    $("#adv-apps-out").textContent = "读取中…";
    try {
      const out = await shell("pm list packages -3");
      const list = out
        .split("\n")
        .map((l) => l.replace("package:", "").trim())
        .filter(Boolean)
        .sort();
      setState("#adv-apps-count", `${list.length} 个`);
      $("#adv-apps-out").innerHTML = list
        .map((p) => `<span class="pkg-item" data-pkg="${esc(p)}" style="cursor:pointer">${esc(p)}</span>`)
        .join("\n");
      $("#adv-apps-out").querySelectorAll("[data-pkg]").forEach((n) => {
        n.addEventListener("click", () => {
          $("#adv-pkg").value = n.dataset.pkg;
        });
      });
    } catch (err) {
      $("#adv-apps-out").textContent = `失败：${err.message}`;
    }
  });

  const pkgAction = (cmd, verb) => async () => {
    if (!adb) return needConnect();
    const pkg = $("#adv-pkg").value.trim();
    if (!pkg) {
      $("#adv-apps-out").textContent = "先在上面填一个包名（点列表里的条目也能填）";
      return;
    }
    $("#adv-apps-out").textContent = `${verb} ${pkg}…`;
    try {
      const out = await shell(cmd(pkg));
      $("#adv-apps-out").textContent = out.trim() || `${verb}完成`;
    } catch (err) {
      $("#adv-apps-out").textContent = `${verb}失败：${err.message}`;
    }
  };

  on($("#pkg-stop"), "click", pkgAction((p) => `am force-stop ${p}`, "强制停止"));
  on($("#pkg-clear"), "click", pkgAction((p) => `pm clear ${p}`, "清数据"));
  on($("#pkg-disable"), "click", pkgAction((p) => `pm disable-user --user 0 ${p}`, "禁用"));
  on($("#pkg-enable"), "click", pkgAction((p) => `pm enable ${p}`, "启用"));
  on($("#pkg-uninstall"), "click", pkgAction((p) => `pm uninstall --user 0 ${p}`, "卸载"));

  /* ---------- APK 安装 ---------- */

  on($("#apk-install"), "click", async () => {
    if (!adb) return needConnect();
    const file = $("#apk-file").files?.[0];
    if (!file) {
      setState("#apk-state", "先选一个 apk", "var(--amber)");
      return;
    }
    const remote = `/data/local/tmp/${Date.now()}-${file.name}`;
    setState("#apk-state", `推送 ${file.name}（${fmtSize(file.size)}）…`, "var(--amber)");
    try {
      const sync = await adb.sync();
      await sync.write({ filename: remote, file: file.stream(), permission: 0o644, mtime: Math.floor(Date.now() / 1000) });

      setState("#apk-state", "安装中…", "var(--amber)");
      const out = await shell(`pm install -r "${remote}"`);
      await shell(`rm -f "${remote}"`).catch(() => {});
      const ok = /Success/i.test(out);
      setState("#apk-state", ok ? "安装成功" : "安装失败", ok ? "var(--mint)" : "var(--rose)");
      $("#apk-info").textContent = out.trim() || "（设备没有输出）";
    } catch (err) {
      setState("#apk-state", "失败", "var(--rose)");
      $("#apk-info").textContent = String(err.message || err);
    }
  });

  /* ---------- 系统控制 ---------- */

  const sysOut = (t) => ($("#sys-out").textContent = t);

  on($("#sys-info"), "click", async () => {
    if (!adb) return needConnect();
    sysOut("读取中…");
    try {
      const [size, density, battery] = await Promise.all([shell("wm size"), shell("wm density"), shell("dumpsys battery")]);
      const level = battery.match(/level:\s*(\d+)/)?.[1] ?? "—";
      const status = battery.match(/status:\s*(\d+)/)?.[1] ?? "—";
      sysOut([size.trim(), density.trim(), `level: ${level}  status: ${status}`].join("\n"));
    } catch (err) {
      sysOut(`失败：${err.message}`);
    }
  });

  const runAndShow = (cmd, label) => async () => {
    if (!adb) return needConnect();
    setState("#sys-state", `${label}…`, "var(--amber)");
    try {
      const out = await shell(cmd);
      setState("#sys-state", `${label}完成`, "var(--mint)");
      if (out.trim()) sysOut(out.trim());
    } catch (err) {
      setState("#sys-state", `${label}失败`, "var(--rose)");
      sysOut(String(err.message || err));
    }
  };

  on($("#sys-size-set"), "click", async () => {
    const v = $("#sys-size").value.trim();
    if (!/^\d{3,5}x\d{3,5}$/.test(v)) return sysOut("分辨率写成 1080x2340 这样");
    await runAndShow(`wm size ${v}`, "设置分辨率")();
  });
  on($("#sys-size-reset"), "click", runAndShow("wm size reset", "重置分辨率"));

  on($("#sys-dpi-set"), "click", async () => {
    const v = $("#sys-dpi").value.trim();
    if (!/^\d{2,4}$/.test(v)) return sysOut("密度填数字，例如 420");
    await runAndShow(`wm density ${v}`, "设置密度")();
  });
  on($("#sys-dpi-reset"), "click", runAndShow("wm density reset", "重置密度"));

  on($("#sys-tap-go"), "click", async () => {
    const v = $("#sys-tap").value.trim();
    if (!/^\d+\s+\d+$/.test(v)) return sysOut("写成 x y，例如 540 1200");
    await runAndShow(`input tap ${v}`, "点按")();
  });

  on($("#sys-bat"), "click", runAndShow("dumpsys battery set level 50", "模拟电量"));
  on($("#sys-bat-reset"), "click", runAndShow("dumpsys battery reset", "恢复电量"));

  on($("#sys-reboot"), "click", async () => {
    if (!adb) return needConnect();
    setState("#sys-state", "重启中…", "var(--amber)");
    try {
      await adb.power.reboot();
    } catch (err) {
      setState("#sys-state", `重启失败：${err.message}`, "var(--rose)");
    }
  });
  on($("#sys-bootloader"), "click", async () => {
    if (!adb) return needConnect();
    try {
      await adb.power.bootloader();
      setState("#sys-state", "已切到 fastboot", "var(--mint)");
    } catch (err) {
      setState("#sys-state", `失败：${err.message}`, "var(--rose)");
    }
  });
  on($("#sys-recovery"), "click", async () => {
    if (!adb) return needConnect();
    try {
      await adb.power.recovery();
      setState("#sys-state", "已切到 recovery", "var(--mint)");
    } catch (err) {
      setState("#sys-state", `失败：${err.message}`, "var(--rose)");
    }
  });

  // 常用按键一次性铺开，点一下发一个 keyevent
  $("#key-row").innerHTML = KEYCODES.map(
    ([label, code]) => `<button class="btn-sm" data-key="${code}" type="button" disabled>${label}</button>`
  ).join("");
  el.querySelectorAll("#key-row [data-key]").forEach((btn) => {
    on(btn, "click", async () => {
      if (!adb) return needConnect();
      try {
        await shell(`input keyevent ${btn.dataset.key}`);
        setState("#sys-state", `已发送按键 ${btn.textContent}`, "var(--mint)");
      } catch (err) {
        setState("#sys-state", `按键失败：${err.message}`, "var(--rose)");
      }
    });
  });

  /* ---------- 文件 ---------- */

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

  on($("#adv-ls"), "click", async () => {
    if (!adb) return needConnect();
    const path = $("#adv-path").value.trim();
    setState("#adv-files-state", "读取中…");
    try {
      const sync = await adb.sync();
      const entries = (await sync.readdir(path))
        .filter((e) => e.name !== "." && e.name !== "..")
        .sort((a, b) => Number(b.isDirectory?.() ?? false) - Number(a.isDirectory?.() ?? false));
      setState("#adv-files-state", `${entries.length} 项`);
      $("#adv-files").innerHTML =
        entries
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
            const sync2 = await adb.sync();
            const full = `${path.replace(/\/$/, "")}/${btn.dataset.pull}`;
            const { blob, size } = await streamToBlob(sync2.read(full));
            const url = URL.createObjectURL(blob);
            btn.textContent = fmtSize(size);
            btn.replaceWith(
              Object.assign(document.createElement("a"), { href: url, download: btn.dataset.pull, textContent: "保存", className: "btn-sm" })
            );
          } catch (err) {
            btn.textContent = "失败";
            $("#adv-push-info").textContent = String(err.message || err);
          }
        });
      });
    } catch (err) {
      setState("#adv-files-state", "失败");
      $("#adv-files").innerHTML = `<p class="hint" style="color:var(--rose)">${esc(err.message)}</p>`;
    }
  });

  on($("#adv-push"), "click", async () => {
    if (!adb) return needConnect();
    const file = $("#adv-upload").files?.[0];
    if (!file) {
      $("#adv-push-info").textContent = "先选一个文件";
      return;
    }
    const dir = $("#adv-path").value.trim().replace(/\/$/, "");
    $("#adv-push-info").textContent = `推送 ${file.name}…`;
    try {
      const sync = await adb.sync();
      await sync.write({ filename: `${dir}/${file.name}`, file: file.stream(), permission: 0o644, mtime: Math.floor(Date.now() / 1000) });
      $("#adv-push-info").textContent = `已推送 ${file.name}（${fmtSize(file.size)}）`;
    } catch (err) {
      $("#adv-push-info").textContent = `推送失败：${err.message}`;
    }
  });

  /* ---------- 截屏 ---------- */

  on($("#adv-shot"), "click", async () => {
    if (!adb) return needConnect();
    const box = $("#adv-shot-box");
    box.textContent = "截屏中…";
    try {
      const fb = await adb.framebuffer();
      const canvas = document.createElement("canvas");
      canvas.width = fb.width;
      canvas.height = fb.height;
      const ctx = canvas.getContext("2d");

      if (fb.data.length === fb.width * fb.height * 4) {
        const img = ctx.createImageData(fb.width, fb.height);
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
    if (termWriter) {
      try {
        termWriter.close();
      } catch {
        /* 已经关闭 */
      }
      termWriter = null;
    }
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
