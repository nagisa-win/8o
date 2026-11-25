/**
 * 本地预览：构建一次后用 node 内置 http 起静态服务器，改文件自动重建。
 * 没有热更新，刷新页面即可；只用于看效果，不参与发布。
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { extname, join, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const PORT = Number(process.env.PORT || 8765);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/** 顺序构建三个站点，失败就打印出来但继续服务旧产物 */
function build() {
  const proc = spawn(process.execPath, [join(root, "scripts/build.mjs"), "all"], { stdio: "inherit" });
  proc.on("exit", (code) => code && console.error(`build 退出码 ${code}`));
}

build();

let timer = 0;
for (const dir of ["sites", "packages", "scripts"]) {
  watch(join(root, dir), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(build, 200);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let path = decodeURIComponent(url.pathname);

  // 根路径给一个三站入口，方便来回跳
  if (path === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<meta charset="utf-8"><body style="background:#05070d;color:#e6f0ff;font-family:system-ui;padding:40px">
      <h1>8O 本地预览</h1><ul>
      <li><a style="color:#4de1ff" href="/hub/">门户</a></li>
      <li><a style="color:#4de1ff" href="/lab/">实验室</a></li>
      <li><a style="color:#4de1ff" href="/skills/">技能包</a></li></ul></body>`);
    return;
  }

  // /hub/ 这种目录请求补 index.html
  if (path.endsWith("/")) path += "index.html";

  const file = normalize(join(dist, path));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  try {
    const info = await stat(file);
    if (info.isDirectory()) throw new Error("dir");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404");
  }
});

server.listen(PORT, () => console.log(`预览： http://127.0.0.1:${PORT}/`));
