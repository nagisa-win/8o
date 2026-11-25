/**
 * 把 profile 仓库同步出来的公开仓库数据搬进门户，并补上英文文案。
 * 用法：node tools/sync-profile-data.mjs [profile 仓库路径]
 *
 * 门户的 /api/projects 与 /api/feed 读的是这里的静态快照，所以 profile 那边
 * 白名单一改，跑一次这个脚本就能让门户跟上。中文文案全部来自 profile 的数据，
 * 英文只在下面的 EN 表里维护；表里没有的仓库回退用中文，不会留空。
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const profileDir = process.argv[2] || join(root, "../profile");

/** 仓库名 → 英文简介 */
const EN = {
  "agent-relay": "A self-hosted relay for agent-to-agent requests, with the receiving human as the only reviewer",
  skkill: "A skill manager for every agent, using package.json as the version control",
  "fanzha-skill": "An anti-fraud skill pack: scam signals and a decision flow agents can follow",
  "cli-tools": "Small command-line scripts in bash and Python that survived daily use",
  "mermaid-render": "Turn Mermaid source into diagrams and export PNG or JPG",
  "advanced-js-calculator": "A Jison expression calculator that shows the parsing steps",
  "web-router": "A tiny client-side router with no dependencies",
  "gold-board": "A macOS floating widget: gold price, wake timer, trackpad haptics",
  "mobile-photo-cleanup-kit": "Web-first photo dedupe and thumbnail cleanup for Android over ADB",
  "better-coloros": "An LSPosed plugin collection for ColorOS: write the missing features yourself",
  "oppo-camera-normalization": "Normalize the file names coming out of the OPPO camera",
  "Rime-Pro-Dict": "Automatically generated professional dictionaries for the Rime IME",
  "dsh-animal-island-theme": "An Animal Island style theme for DeepSeek Harness",
  "userscript.js": "Browser userscripts, original or rewritten",
  "NB-Rename": "Cross-platform batch renaming, in the spirit of PowerRename",
  "algo-ts": "Algorithm exercises in TypeScript with a test harness",
  webhook: "A webhook receiver and forwarder for personal use",
  "node-proxy": "A lightweight proxy for CORS and forwarding",
  "openclaw-uninstaller": "Remove OpenClaw from a system completely",
};

/** 分类中文 → 英文 */
const CATEGORY_EN = {
  "AGENT 工具": "Agent tooling",
  "WEB 与工具": "Web & tools",
  端侧: "Devices",
  输入与主题: "Input & themes",
  基础设施: "Infra",
};

const srcProjects = JSON.parse(await readFile(join(profileDir, "src/data/projects.json"), "utf8"));
const srcFeed = JSON.parse(await readFile(join(profileDir, "src/data/feed.json"), "utf8"));

const projects = [];
for (const group of srcProjects.groups) {
  for (const item of group.items) {
    projects.push({
      ...item,
      category: group.label,
      desc_en: EN[item.repo] || item.desc,
      category_en: CATEGORY_EN[group.label] || group.label,
    });
  }
}

const feed = {
  updated: srcFeed.updated.map((u) => ({ ...u, desc_en: EN[u.repo] || u.desc })),
  releases: srcFeed.releases,
};

await writeFile(
  join(root, "sites/hub/data/projects.json"),
  JSON.stringify(
    {
      synced: projects.reduce((latest, p) => (p.updated > latest ? p.updated : latest), ""),
      note: "由 profile 仓库同步生成，勿手改；英文文案维护在 tools/sync-profile-data.mjs",
      projects,
    },
    null,
    2
  ) + "\n"
);

await writeFile(join(root, "sites/hub/data/feed.json"), JSON.stringify({ ...feed, note: "同上" }, null, 2) + "\n");

console.log(`门户数据已更新：${projects.length} 个项目，${feed.updated.length} 条动态，${feed.releases.length} 条 release`);
const missing = projects.filter((p) => !EN[p.repo]).map((p) => p.repo);
if (missing.length) console.log(`缺英文简介（已回退中文）：${missing.join(", ")}`);
