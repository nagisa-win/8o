/**
 * 提交前自检：扫描源码里不应出现的信息（真实姓名、公司域名、内网地址、绝对路径）。
 * 用法：npm run check
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// 规则文件自身就含这些正则，跳过
const SKIP = new Set(["node_modules", "dist", ".git", ".wrangler", "package-lock.json", "check.mjs"]);
const TEXT = new Set([".js", ".mjs", ".css", ".html", ".json", ".toml", ".md", ".yml", ".yaml"]);

const RULES = [
  [/(^|[^a-z])(yanjunzhu|steven ?yan)([^a-z]|$)/i, "疑似真实姓名"],
  [/baidu-int|\bbaidu\.com\b/i, "公司域名"],
  [/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, "内网 IP"],
  [/\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/, "内网 IP"],
  [/\/Users\/[a-z]/, "本机绝对路径"],
  [/(api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i, "疑似密钥"],
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (TEXT.has(extname(entry.name))) yield full;
  }
}

const hits = [];
for await (const file of walk(root)) {
  const text = await readFile(file, "utf8");
  for (const [re, why] of RULES) {
    const m = text.match(re);
    if (m) hits.push(`${file.replace(root + "/", "")}: ${why}（${m[0].slice(0, 32)}）`);
  }
}

if (hits.length) {
  console.error(`✗ 检查未通过：\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log("✓ 隐私检查通过");
