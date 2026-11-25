/**
 * 视觉校验用的零依赖截图工具：直接走 Chrome DevTools Protocol。
 * 用法：node tools/shot.mjs <url> <out.png> [宽] [高] [--full] [--mobile]
 * 依赖本机已安装的 Chrome；不参与站点构建，只在开发时手动调用。
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [, , url, out, w = "1440", h = "900", ...flags] = process.argv;
const full = flags.includes("--full");
const mobile = flags.includes("--mobile");
const port = 9333 + Math.floor(Math.random() * 200);

if (!url || !out) {
  console.error("用法: node tools/shot.mjs <url> <out.png> [宽] [高] [--full] [--mobile]");
  process.exit(1);
}

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-prefers-reduced-motion",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/8o-shot-${Date.now()}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

/** 等 DevTools 端口就绪 */
async function endpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return (await res.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(120);
    }
  }
  throw new Error("Chrome DevTools 端口未就绪");
}

const ws = new WebSocket(await endpoint());
let seq = 0;
const pending = new Map();

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  const task = pending.get(msg.id);
  if (!task) return;
  pending.delete(msg.id);
  msg.error ? task.reject(new Error(msg.error.message)) : task.resolve(msg.result);
});

await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

await send("Page.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", {
  width: Number(w),
  height: Number(h),
  deviceScaleFactor: mobile ? 2 : 1,
  mobile,
}, sessionId);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);

await send("Page.navigate", { url }, sessionId);
await sleep(1800);

const { result } = await send(
  "Runtime.evaluate",
  { expression: "JSON.stringify({h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth})" },
  sessionId
);
const page = JSON.parse(result.value);

const shot = await send(
  "Page.captureScreenshot",
  {
    format: "png",
    captureBeyondViewport: full,
    ...(full ? { clip: { x: 0, y: 0, width: page.w, height: page.h, scale: 1 } } : {}),
  },
  sessionId
);

await writeFile(out, Buffer.from(shot.data, "base64"));
console.log(`${out} ← ${url} (${full ? `${page.w}x${page.h}` : `${w}x${h}`})`);

ws.close();
chrome.kill();
