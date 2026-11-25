/**
 * 8O Observatory · 构建脚本
 * 把 sites/ 与 packages/ 组装成 dist/，零第三方依赖，CI 与本地走同一套逻辑。
 * 用法：node scripts/build.mjs [hub|all]
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

/** 取 git 短 sha，拿不到就用时间戳，保证 build.json 永远可读 */
function buildId() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

/** 站点清单是 sitemap 的唯一来源 */
const HOSTS = [
  "https://8o.nz/",
  "https://www.8o.nz/",
  "https://lab.8o.nz/",
  "https://mermaid.8o.nz/",
  "https://calc.8o.nz/",
  "https://skills.8o.nz/",
  "https://status.8o.nz/",
];

async function buildHub() {
  const out = join(dist, "hub");
  await cp(join(root, "sites/hub"), out, { recursive: true });

  // token 层单独拷到 /ui/，避免页面里出现 ../packages 这种耦合路径
  await mkdir(join(out, "ui"), { recursive: true });
  await cp(join(root, "packages/tokens/8o.css"), join(out, "ui/8o.css"));

  const htmlPath = join(out, "index.html");
  const html = (await readFile(htmlPath, "utf8")).replace("../packages/tokens/8o.css", "/ui/8o.css");
  await writeFile(htmlPath, html);

  const id = buildId();
  await writeFile(
    join(out, "build.json"),
    JSON.stringify({ short: id, at: new Date().toISOString().slice(0, 16).replace("T", " ") + "Z" })
  );

  await writeFile(join(out, "robots.txt"), "User-agent: *\nAllow: /\n\nSitemap: https://8o.nz/sitemap.xml\n");

  const urls = HOSTS.map((u) => `  <url><loc>${u}</loc><changefreq>weekly</changefreq></url>`).join("\n");
  await writeFile(
    join(out, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );

  // 404 页沿用门户的视觉，只是换掉内容
  const notFound = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>404 · 信号丢失 — 8O OBSERVATORY</title>
<link rel="stylesheet" href="/ui/8o.css">
<style>
  body{display:grid;place-items:center;min-height:100svh;text-align:center;padding:24px}
  .code{font-family:var(--font-mono);font-size:clamp(64px,18vw,140px);font-weight:700;line-height:1;
        background:linear-gradient(155deg,#fff,var(--accent) 50%,var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent}
  p{color:var(--ink-dim);max-width:34ch;margin:16px auto 28px}
</style></head>
<body>
  <main>
    <div class="code">404</div>
    <p class="mono label">SIGNAL LOST · 这个坐标上没有舱段</p>
    <p>可能是链接写错，也可能是那个站点已经退役。回到观测站重新定位。</p>
    <a class="btn" href="/"><span>返回观测站</span><span aria-hidden="true">→</span></a>
  </main>
</body></html>`;
  await writeFile(join(out, "404.html"), notFound);

  console.log(`built hub → dist/hub (build ${id})`);
}

/** 技能包页面：结构与门户同源，只是资产不同 */
async function buildSkills() {
  const out = join(dist, "skills");
  await cp(join(root, "sites/skills"), out, { recursive: true });
  await mkdir(join(out, "ui"), { recursive: true });
  await cp(join(root, "packages/tokens/8o.css"), join(out, "ui/8o.css"));
  const htmlPath = join(out, "index.html");
  const html = (await readFile(htmlPath, "utf8")).replace("/ui/8o.css", "/ui/8o.css");
  await writeFile(htmlPath, html);
  await writeFile(join(out, ".nojekyll"), "");
  console.log("built skills → dist/skills");
}

/** 实验室：静态外壳 + 按需加载的模块 */
async function buildLab() {
  const out = join(dist, "lab");
  await cp(join(root, "sites/lab"), out, { recursive: true });
  await mkdir(join(out, "ui"), { recursive: true });
  await mkdir(join(out, "assets"), { recursive: true });
  await cp(join(root, "packages/tokens/8o.css"), join(out, "ui/8o.css"));
  await cp(join(root, "sites/hub/assets/favicon.svg"), join(out, "assets/favicon.svg"));
  console.log("built lab → dist/lab");
}

const target = process.argv[2] || "all";
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

if (target === "hub" || target === "all") await buildHub();
if (target === "skills" || target === "all") await buildSkills();
if (target === "lab" || target === "all") await buildLab();
if (target === "lab") console.log("lab: 尚未接入构建（第二批交付）");
