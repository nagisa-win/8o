/**
 * 设备舱：用 WebUSB 直接跟安卓设备讲 ADB 协议（不经过 adb server）。
 * 能做：识别设备、发 CNXN 握手、用浏览器生成的 RSA 密钥完成 AUTH、跑一条 shell 命令。
 * 限制：只有 Chrome / Edge 桌面端支持 WebUSB；手机需要打开「USB 调试」。
 */

import {
  buildPacket,
  parsePackets,
  generateKey,
  signToken,
  cnxnPayload,
  servicePayload,
  findAdbInterface,
  text,
  CMD,
  AUTH_TYPE,
  hex,
} from "../adb.js";

const HOST_VERSION = 0x01000001;
const MAX_DATA = 4096;

/** 常见安卓厂商的 vendor id，用于把选择器的噪音压下去 */
const VENDORS = [
  { vendorId: 0x18d1, label: "Google / Pixel" },
  { vendorId: 0x2717, label: "Xiaomi" },
  { vendorId: 0x22d9, label: "OPPO / OnePlus" },
  { vendorId: 0x2a70, label: "OnePlus" },
  { vendorId: 0x04e8, label: "Samsung" },
  { vendorId: 0x12d1, label: "Huawei" },
  { vendorId: 0x2916, label: "vivo / iQOO" },
  { vendorId: 0x0bb4, label: "HTC" },
  { vendorId: 0x05c6, label: "Qualcomm" },
];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let cleanup = null;
let host = null;
let mode = "tools";

/** 协议模式：手写 ADB 报文，用来展示协议细节 */
async function mountProtocol(root) {
  const supported = "usb" in navigator;

  root.innerHTML = `
    <div class="protocol-head">
      <div class="row">
        <button class="btn-sm" id="connect" type="button" ${supported ? "" : "disabled"}>连接设备（手写协议）</button>
      </div>
    </div>

    ${
      supported
        ? ""
        : `<p class="hint" style="color:var(--rose)">当前浏览器不支持 WebUSB。请用 Chrome / Edge 的桌面版打开本页。</p>`
    }

    <div class="module__body">
      <div class="card">
        <div class="card__title"><span>DEVICE</span><span id="dev-state">未连接</span></div>
        <pre class="out" id="dev-info" style="max-height:200px">点右上角「连接设备」，在弹窗里选中你的手机。

手机端需要先打开：设置 → 关于手机 → 连点版本号进入开发者模式 → 打开「USB 调试」。</pre>
      </div>

      <div class="card">
        <div class="card__title"><span>ADB HANDSHAKE</span><span id="adb-state">待握手</span></div>
        <pre class="out" id="adb-log" style="max-height:220px">—</pre>
      </div>

      <div class="card">
        <div class="card__title"><span>KEY</span><span id="key-state">未生成</span></div>
        <div class="row" style="margin-bottom:10px">
          <button class="btn-sm" id="genkey" type="button">生成浏览器密钥</button>
          <button class="btn-sm" id="copykey" type="button" disabled>复制 adbkey.pub</button>
        </div>
        <pre class="out" id="key-out" style="max-height:120px">首次连接时设备会弹「允许 USB 调试吗」，点允许即可，密钥会留在手机里。</pre>
      </div>

      <div class="card">
        <div class="card__title"><span>SHELL</span><span id="shell-state">未执行</span></div>
        <div class="field">
          <label for="cmd">命令</label>
          <input type="text" id="cmd" value="getprop ro.product.model" spellcheck="false" />
        </div>
        <div class="row"><button class="btn-sm" id="run" type="button" disabled>执行</button></div>
        <pre class="out" id="shell-out" style="margin-top:12px;max-height:200px">连接成功后可执行 shell 命令</pre>
      </div>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  const listeners = [];
  const on = (el, ev, fn) => {
    el.addEventListener(ev, fn);
    listeners.push([el, ev, fn]);
  };

  const log = (line) => {
    const el = $("#adb-log");
    el.textContent = el.textContent === "—" ? line : `${el.textContent}\n${line}`;
    el.scrollTop = el.scrollHeight;
  };

  let device = null;
  let endpoints = null;
  let key = null;
  let localId = 1;
  let readerStopped = false;
  let buffer = new Uint8Array(0);
  const inflight = new Map(); // localId → { resolve, chunks }

  /* ---------- USB 小工具 ---------- */

  /** 发一整包（必要时按 16KB 切块），WebUSB 单次传输有长度限制 */
  async function send(packet) {
    const CHUNK = 16384;
    for (let i = 0; i < packet.length; i += CHUNK) {
      await device.transferOut(endpoints.outEp.endpointNumber, packet.subarray(i, i + CHUNK));
    }
  }

  /** 读循环：把 USB 里的字节拼成 ADB 包，分发给等待中的通道 */
  async function readLoop() {
    while (device && !readerStopped) {
      let result;
      try {
        result = await device.transferIn(endpoints.inEp.endpointNumber, 16384);
      } catch (err) {
        if (!readerStopped) log(`读取中断：${err.message}`);
        return;
      }
      if (!result?.data || result.data.byteLength === 0) continue;

      const merged = new Uint8Array(buffer.length + result.data.byteLength);
      merged.set(buffer);
      merged.set(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength), buffer.length);

      let parsed;
      try {
        parsed = parsePackets(merged);
      } catch (err) {
        log(`协议错误：${err.message}`);
        buffer = new Uint8Array(0);
        continue;
      }

      buffer = parsed.rest;
      for (const pkt of parsed.packets) handlePacket(pkt);
    }
  }

  function handlePacket(pkt) {
    switch (pkt.command) {
      case CMD.CNXN:
        log(`← CNXN  ${text(pkt.payload).slice(0, 80)}`);
        $("#adb-state").textContent = "已连接";
        $("#adb-state").style.color = "var(--mint)";
        $("#run").disabled = false;
        break;

      case CMD.AUTH:
        handleAuth(pkt);
        break;

      case CMD.OKAY: {
        log(`← OKAY  local=${pkt.arg1}`);
        const channel = inflight.get(pkt.arg1);
        if (channel) channel.remoteId = pkt.arg0;
        break;
      }

      case CMD.WRTE: {
        const channel = inflight.get(pkt.arg1);
        if (channel) channel.chunks.push(pkt.payload.slice());
        // 收到数据要回一个 OKAY，否则设备会停住
        send(buildPacket(CMD.OKAY, pkt.arg0, pkt.arg1)).catch(() => {});
        break;
      }

      case CMD.CLSE: {
        log(`← CLSE  local=${pkt.arg1}`);
        const channel = inflight.get(pkt.arg1);
        if (channel) {
          inflight.delete(pkt.arg1);
          const total = channel.chunks.reduce((n, c) => n + c.length, 0);
          const out = new Uint8Array(total);
          let off = 0;
          for (const c of channel.chunks) {
            out.set(c, off);
            off += c.length;
          }
          channel.resolve(text(out));
        }
        break;
      }

      default:
        log(`← ${pkt.name} arg0=${pkt.arg0} arg1=${pkt.arg1} len=${pkt.length}`);
    }
  }

  /** AUTH 是唯一需要密码学的一步：设备给随机 token，主机用私钥签名回敬 */
  async function handleAuth(pkt) {
    if (pkt.arg0 === AUTH_TYPE.TOKEN) {
      const token = pkt.payload.slice(0, 20);
      if (!key) {
        key = await generateKey("8o-lab@webusb");
        $("#key-state").textContent = "已生成（256 位）";
        $("#copykey").disabled = false;
        $("#key-out").textContent = key.adbPublicKey;
      }
      const signature = await signToken(key.privateKey, token);
      log(`← AUTH TOKEN（20 字节）→ 用浏览器密钥签名 ${signature.length} 字节`);
      await send(buildPacket(CMD.AUTH, AUTH_TYPE.SIGNATURE, 0, signature));
      log("→ AUTH SIGNATURE");
    } else if (pkt.arg0 === AUTH_TYPE.RSAPUBLICKEY) {
      // 设备还没记住这把钥匙，把公钥推过去，手机会弹授权框
      log("设备要求公钥，已发送 —— 请在手机上点「允许」");
      $("#adb-state").textContent = "等待手机授权";
      $("#adb-state").style.color = "var(--amber)";
      await send(buildPacket(CMD.AUTH, AUTH_TYPE.RSAPUBLICKEY, 0, new TextEncoder().encode(`${key.adbPublicKey}\0`)));
    } else {
      log(`← AUTH 未知类型 ${pkt.arg0}`);
    }
  }

  /* ---------- 连接流程 ---------- */

  async function connect() {
    $("#connect").disabled = true;
    try {
      device = await navigator.usb.requestDevice({
        filters: VENDORS.map((v) => ({ vendorId: v.vendorId })),
      });
    } catch {
      $("#connect").disabled = false;
      $("#dev-state").textContent = "已取消";
      return;
    }

    try {
      await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);

      const found = findAdbInterface(device);
      if (!found) {
        throw new Error("这台设备没有暴露 ADB 接口。确认已打开「USB 调试」，并把 USB 模式从「仅充电」改成「传输文件」。");
      }
      await device.claimInterface(found.interfaceNumber);
      endpoints = { inEp: found.inEp, outEp: found.outEp };

      const vendor = VENDORS.find((v) => v.vendorId === device.vendorId)?.label || "未知厂商";
      $("#dev-state").textContent = "已打开";
      $("#dev-info").innerHTML = [
        `<b>型号</b>   ${esc(device.productName || "—")}`,
        `<b>厂商</b>   ${esc(device.manufacturerName || "—")}  (${vendor})`,
        `<b>序列号</b> ${esc(device.serialNumber || "—")}`,
        `<b>VID:PID</b> ${hex(device.vendorId, 4)}:${hex(device.productId, 4)}`,
        `<b>USB</b>    ${device.usbVersionMajor}.${device.usbVersionMinor}`,
        `<b>接口</b>   #${found.interfaceNumber}  IN ${hex(found.inEp.endpointNumber)}  OUT ${hex(found.outEp.endpointNumber)}`,
      ].join("\n");

      readerStopped = false;
      readLoop();

      log(`→ CNXN host::  version=${hex(HOST_VERSION, 8)} maxdata=${MAX_DATA}`);
      $("#adb-state").textContent = "握手中";
      $("#adb-state").style.color = "var(--amber)";
      await send(buildPacket(CMD.CNXN, HOST_VERSION, MAX_DATA, cnxnPayload(MAX_DATA)));
    } catch (err) {
      $("#adb-state").textContent = "失败";
      $("#adb-state").style.color = "var(--rose)";
      log(`✗ ${err.message}`);
    } finally {
      $("#connect").disabled = false;
    }
  }

  /** 打开一个 service 通道并把设备回的数据收集起来 */
  function openService(service, timeout = 8000) {
    const id = localId++;
    return new Promise((resolve, reject) => {
      const channel = { chunks: [], remoteId: 0, resolve, reject };
      inflight.set(id, channel);

      const timer = setTimeout(() => {
        inflight.delete(id);
        reject(new Error("设备在 8 秒内没有回完，命令可能卡住了"));
      }, timeout);

      const done = channel.resolve;
      channel.resolve = (v) => {
        clearTimeout(timer);
        done(v);
      };

      send(buildPacket(CMD.OPEN, id, 0, servicePayload(service)))
        .then(() => {
          // OKAY 之后立刻发一个空 WRTE，让设备开始吐输出
          setTimeout(() => {
            if (channel.remoteId) send(buildPacket(CMD.WRTE, channel.remoteId, id, new Uint8Array(0))).catch(() => {});
          }, 120);
        })
        .catch((err) => {
          clearTimeout(timer);
          inflight.delete(id);
          reject(err);
        });
    });
  }

  /* ---------- 交互 ---------- */

  on($("#connect"), "click", connect);

  on($("#genkey"), "click", async () => {
    $("#key-state").textContent = "生成中…";
    key = await generateKey("8o-lab@webusb");
    $("#key-state").textContent = "已生成（256 位）";
    $("#copykey").disabled = false;
    $("#key-out").textContent = `${key.adbPublicKey}\n\n自检 n0inv·n ≡ -1 (mod 2^32)：${key.selfCheck ? "通过" : "失败"}`;
  });

  on($("#copykey"), "click", async () => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key.adbPublicKey);
      $("#copykey").textContent = "已复制";
      setTimeout(() => ($("#copykey").textContent = "复制 adbkey.pub"), 1500);
    } catch {
      $("#key-out").textContent = key.adbPublicKey;
    }
  });

  on($("#run"), "click", async () => {
    const cmd = ($("#cmd").value || "").trim();
    if (!cmd) return;
    $("#shell-state").textContent = "执行中…";
    $("#shell-out").textContent = "…";
    try {
      const out = await openService(`shell:${cmd}`);
      $("#shell-state").textContent = "完成";
      $("#shell-out").textContent = out || "（设备没有输出）";
    } catch (err) {
      $("#shell-state").textContent = "失败";
      $("#shell-out").textContent = err.message;
    }
  });

  on($("#dev-info"), "dblclick", () => $("#dev-info").textContent);

  cleanup = () => {
    readerStopped = true;
    listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    if (device?.opened) device.close().catch(() => {});
    device = null;
  };
}

/** 工具模式：基于公开库 @yume-chan/adb 的完整功能面板（预编译产物） */
async function mountTools(el) {
  try {
    const mod = await import("/assets/vendor/advanced-device.js");
    await mod.mount(el);
    cleanup = () => mod.unmount?.();
  } catch (err) {
    el.innerHTML = `<p class="hint" style="color:var(--rose)">工具模式加载失败：${String(err.message || err)}</p>
      <p class="hint">可以先切到「协议模式」，它不依赖任何第三方包。</p>`;
  }
}

export async function mount(root) {
  root.innerHTML = `
    <div class="module__head">
      <div>
        <p class="label">// BAY-03 · DEVICE</p>
        <h2>设备舱</h2>
        <p>WebUSB 直连安卓设备。工具模式基于公开库 ya-webadb：交互终端、应用管理、APK 安装、系统控制、文件传输、截屏；协议模式是手写的 ADB 报文，用来把握手过程看清楚。</p>
      </div>
    </div>

    <div class="mode-bar" role="tablist" aria-label="设备舱模式">
      <button class="mode-btn" data-mode="tools" role="tab" type="button">
        工具模式<span class="mode-hint">完整功能 · ya-webadb</span>
      </button>
      <button class="mode-btn" data-mode="protocol" role="tab" type="button">
        协议模式<span class="mode-hint">手写报文 · 看握手细节</span>
      </button>
    </div>
    <div id="mode-host"></div>
  `;

  host = root.querySelector("#mode-host");

  async function show(next) {
    if (cleanup) cleanup();
    cleanup = null;
    mode = next;
    root.querySelectorAll("[data-mode]").forEach((b) => {
      const active = b.dataset.mode === next;
      if (active) b.setAttribute("aria-selected", "true");
      else b.removeAttribute("aria-selected");
    });
    host.replaceChildren();
    if (next === "tools") await mountTools(host);
    else await mountProtocol(host);
  }

  root.querySelectorAll("[data-mode]").forEach((b) => {
    b.addEventListener("click", () => show(b.dataset.mode));
  });

  await show(mode);
  cleanupHook = () => {
    if (cleanup) cleanup();
    cleanup = null;
  };
}

let cleanupHook = null;

export function unmount() {
  if (cleanupHook) cleanupHook();
  cleanupHook = null;
}
