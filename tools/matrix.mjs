/**
 * 跨内核 + 移动端巡检：Chromium / WebKit / Firefox 三种内核，多种宽度与中英文。
 * 用法：node tools/matrix.mjs [url]
 *
 * 检查四类问题：
 *   1. 横向溢出（document 比视口宽）
 *   2. 文本被截断（scrollWidth 大于 clientWidth）
 *   3. 文本块相互覆盖（矩形相交）
 *   4. 关键 CSS 特性是否被支持（不支持时应有降级）
 */
import { chromium, webkit, firefox } from "playwright";
import { mkdir } from "node:fs/promises";

const url = process.argv[2] || "https://8o.nz/";
const OUT = "/tmp/matrix";

const ENGINE_LIST = [
  ["chromium", chromium],
  ["webkit", webkit],
  ["firefox", firefox],
];

const VIEWPORTS = [
  [375, 812],
  [768, 1024],
  [1440, 900],
];

const LANGS = ["zh", "en"];

/** 会参与覆盖检测的文本容器 */
const TEXT_SELECTORS = [
  ".site__host",
  ".site__title",
  ".site__desc",
  ".site__go",
  ".site__latency",
  ".project__name",
  ".project__desc",
  ".project__meta",
  ".feed__repo",
  ".feed__text",
  ".feed__time",
  ".hero__lede",
  ".section__sub",
  ".contact__v",
  ".contact__k",
  ".nav a",
  ".brand",
].join(",");

/** [名称, 属性, 值] —— 在页面里用 CSS.supports 判断 */
const FEATURES = [
  ["color-mix()", "color", "color-mix(in srgb, red, blue)"],
  ["backdrop-filter", "backdrop-filter", "blur(4px)"],
  ["-webkit-backdrop-filter", "-webkit-backdrop-filter", "blur(4px)"],
  ["mask-image", "mask-image", "linear-gradient(#000, transparent)"],
  ["-webkit-mask-image", "-webkit-mask-image", "linear-gradient(#000, transparent)"],
  [":has()", "selector(:has(a))", "1"],
  ["text-wrap:balance", "text-wrap", "balance"],
  ["aspect-ratio", "aspect-ratio", "1 / 1"],
  ["gap in flex", "gap", "1px"],
  ["inset", "inset", "0"],
  ["clamp()", "width", "clamp(1px, 2vw, 3px)"],
  ["dvh", "height", "100dvh"],
  ["100svh", "height", "100svh"],
  ["prefers-reduced-motion", "color", "red"],
];

await mkdir(OUT, { recursive: true });
const problems = [];
const featureMatrix = {};

for (const [engineName, engine] of ENGINE_LIST) {
  const browser = await engine.launch();
  featureMatrix[engineName] = {};

  for (const [w, h] of VIEWPORTS) {
    for (const lang of LANGS) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      await context.addInitScript((l) => {
        try {
          localStorage.setItem("8o-lang", l);
        } catch {
          /* ignore */
        }
      }, lang);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 80)));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 80)));

      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(700);

      // 特性支持只在第一轮收集
      if (w === VIEWPORTS[0][0] && lang === "zh") {
        featureMatrix[engineName] = await page.evaluate(
          (feats) => Object.fromEntries(feats.map(([name, prop, value]) => [name, CSS.supports(prop, value)])),
          FEATURES
        );
      }

      const audit = await page.evaluate((sel) => {
        const docOverflow = document.documentElement.scrollWidth - window.innerWidth;

        const clipped = [];
        for (const el of document.querySelectorAll(sel)) {
          if (!el.textContent.trim()) continue;
          if (el.scrollWidth > el.clientWidth + 1) {
            clipped.push(`${el.className || el.tagName}: "${el.textContent.trim().slice(0, 24)}" ${el.scrollWidth}>${el.clientWidth}`);
          }
        }

        const nodes = [...document.querySelectorAll(sel)].filter((el) => el.textContent.trim());
        const rects = nodes.map((el) => ({ el, r: el.getBoundingClientRect() })).filter((x) => x.r.width > 0 && x.r.height > 0);
        const overlaps = [];
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i].r;
            const b = rects[j].r;
            if (rects[i].el.contains(rects[j].el) || rects[j].el.contains(rects[i].el)) continue;
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 2 && oy > 2) {
              overlaps.push(`${rects[i].el.className}×${rects[j].el.className}`);
            }
          }
        }

        return {
          docOverflow,
          clipped: clipped.slice(0, 5),
          overlaps: [...new Set(overlaps)].slice(0, 5),
        };
      }, TEXT_SELECTORS);

      const tag = `${engineName}-${w}-${lang}`;
      await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: false });

      if (audit.docOverflow > 1 || audit.clipped.length || audit.overlaps.length || errors.length) {
        problems.push({ tag, ...audit, errors: errors.slice(0, 3) });
      }
      console.log(
        `${tag.padEnd(22)} overflow=${String(audit.docOverflow).padStart(3)}  clipped=${audit.clipped.length}  overlap=${audit.overlaps.length}  errors=${errors.length}`
      );

      await context.close();
    }
  }
  await browser.close();
}

console.log("\n=== 特性支持 ===");
for (const [engine, feats] of Object.entries(featureMatrix)) {
  const missing = Object.entries(feats).filter(([, v]) => !v).map(([k]) => k);
  console.log(`${engine.padEnd(10)} ${missing.length ? "缺: " + missing.join(", ") : "全部支持"}`);
}

console.log("\n=== 问题明细 ===");
if (!problems.length) console.log("无");
for (const p of problems) {
  console.log(`\n[${p.tag}] overflow=${p.docOverflow}`);
  if (p.clipped.length) console.log("  截断:", p.clipped.join(" | "));
  if (p.overlaps.length) console.log("  覆盖:", p.overlaps.join(" | "));
  if (p.errors.length) console.log("  报错:", p.errors.join(" | "));
}
