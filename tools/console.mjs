/**
 * 抓浏览器控制台与未捕获异常，排查"页面没反应"这类问题。
 * 用法：node tools/console.mjs <url> [等待毫秒]
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const url = process.argv[2];
const wait = Number(process.argv[3] || 2500);
const port = 9400 + Math.floor(Math.random() * 200);

const chrome = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`,
   `--user-data-dir=/tmp/8o-console-${Date.now()}`, "about:blank"],
  { stdio: "ignore" }
);

async function endpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return (await res.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(120);
    }
  }
  throw new Error("DevTools 端口未就绪");
}

const ws = new WebSocket(await endpoint());
let seq = 0;
const pending = new Map();
const events = [];

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const task = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? task.reject(new Error(msg.error.message)) : task.resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    events.push(`EXCEPTION ${d.text} ${d.exception?.description?.split("\n")[0] || ""}`);
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    events.push(`CONSOLE.${msg.params.type} ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
  }
  if (msg.method === "Log.entryAdded") {
    const e = msg.params.entry;
    if (e.level !== "verbose") events.push(`LOG.${e.level} ${e.text} ${e.url || ""}`);
  }
});

await new Promise((r) => ws.addEventListener("open", r, { once: true }));
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Runtime.enable", {}, sessionId);
await send("Log.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);
await send("Page.navigate", { url }, sessionId);
await sleep(wait);

// 可选：先执行一段动作脚本（例如点击按钮），再读状态
const action = process.argv[4];
if (action) {
  const r = await send("Runtime.evaluate", { expression: action, awaitPromise: true }, sessionId);
  console.log("action:", r.result?.value ?? r.result?.description ?? "");
  await sleep(Number(process.env.ACTION_WAIT || 2500));
  const after = await send("Runtime.evaluate", {
    expression: "JSON.stringify({epoch: document.querySelector('#epoch')?.textContent, loss: document.querySelector('#loss')?.textContent, acc: document.querySelector('#acc')?.textContent})",
  }, sessionId);
  console.log("after:", after.result?.value || "");
}

const state = await send("Runtime.evaluate", {
  expression: "JSON.stringify({title: document.title, tokens: document.querySelector('#tokens')?.children.length ?? null, result: document.querySelector('#result')?.textContent?.slice(0,60) ?? null})",
}, sessionId);

console.log("state:", state.result.value);
console.log(events.length ? events.join("\n") : "（没有控制台输出）");
ws.close();
chrome.kill();
