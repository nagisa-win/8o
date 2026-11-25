/**
 * 把一个 popo 作品迁进实验室：复制静态文件、剥掉平台运行时脚本、接上本地兼容层。
 * 用法：node tools/migrate-work.mjs <源目录> <目标名>
 *
 * 只做三件事：
 *   1. 复制文件到 sites/lab/arcade/<目标名>/
 *   2. 删除对平台运行时的 <script> 引用（popo.js 之类）
 *   3. 若页面用到 PopSDK，注入 /assets/popo-shim.js（本地实现，数据落 api.8o.nz）
 * 业务代码一行不改。
 */
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [src, name] = process.argv.slice(2);

if (!src || !name) {
  console.error("用法: node tools/migrate-work.mjs <源目录> <目标名>");
  process.exit(1);
}
if (!existsSync(join(src, "index.html"))) {
  console.error(`✗ ${src} 里没有 index.html`);
  process.exit(1);
}

const dest = join(root, "sites/lab/arcade", name);
await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });

/** 递归找出所有 html，统一处理脚本引用 */
async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (extname(entry.name) === ".html") yield full;
  }
}

/** 有些作品把 PopSDK 引用写在 js 里，html 里看不到，需要一起扫 */
async function dirUsesSdk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await dirUsesSdk(full)) return true;
    } else if ([".js", ".mjs", ".html"].includes(extname(entry.name))) {
      const text = await readFile(full, "utf8").catch(() => "");
      if (/PopSDK/.test(text)) return true;
    }
  }
  return false;
}

let touched = 0;
let injected = 0;

for await (const file of htmlFiles(dest)) {
  let html = await readFile(file, "utf8");
  const before = html;

  // 1) 去掉平台运行时脚本
  html = html.replace(/<script[^>]*src="[^"]*(popo|pop-sdk|popsdk)[^"]*"[^>]*>\s*<\/script>\s*/gi, "");

  // 2) 用到 PopSDK 就注入本地兼容层（放在 head 末尾，早于业务脚本执行）
  const usesSdk = /PopSDK/.test(html) || (await dirUsesSdk(dirname(file)));
  if (usesSdk && !html.includes("/assets/popo-shim.js")) {
    html = html.replace(/<\/head>/i, '  <script src="/assets/popo-shim.js"></script>\n</head>');
    injected += 1;
  }

  if (html !== before) {
    await writeFile(file, html);
    touched += 1;
  }
}

console.log(`迁入 ${name} → sites/lab/arcade/${name}（改动 ${touched} 个 html，注入兼容层 ${injected} 处）`);
