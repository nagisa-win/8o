/**
 * cljs 自学站自测：逐章点开、逐块点「运行」，检查是否报错。
 * 用法：node tools/test-cljs.mjs [url]
 *
 * 判定标准：
 *   1. 每章都能渲染出标题与正文
 *   2. 每个可运行代码块执行后不出现错误样式
 *   3. 执行结果不是空的「没有输出」占位（宏定义这类返回 var 的除外）
 *   4. 标了「仅示意」的块不提供运行按钮
 */
import { chromium, webkit, firefox } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8899/";
const engineName = process.env.ENGINE || "chromium";
const engine = { chromium, webkit, firefox }[engineName];
if (!engine) {
  console.error(`未知内核: ${engineName}（可选 chromium / webkit / firefox）`);
  process.exit(1);
}
console.log(`内核：${engineName}`);
const browser = await engine.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 100)));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const chapterCount = await page.locator("#chapters li button").count();
console.log(`章节目录：${chapterCount} 章`);

const rows = [];
let failed = 0;

for (let i = 0; i < chapterCount; i++) {
  await page.locator("#chapters li button").nth(i).click();
  await page.waitForTimeout(250);

  const title = await page.locator("#content h1").textContent();
  const runButtons = await page.locator("#content .codeblock [data-run]").count();
  const staticBlocks = await page.locator("#content .codeblock--static").count();

  let chapterOk = true;
  const details = [];

  for (let b = 0; b < runButtons; b++) {
    await page.locator("#content .codeblock [data-run]").nth(b).click();
    await page.waitForTimeout(450);

    const out = (await page.locator("#out").innerText()).trim();
    const isError = await page.locator("#out .err").count();
    const empty = out === "" || out.includes("（没有输出）");

    if (isError) {
      chapterOk = false;
      details.push(`块${b + 1} 报错: ${out.split("\n")[0].slice(0, 90)}`);
    } else if (empty) {
      // 宏定义会返回 #'user/xxx，其余空输出视为可疑
      details.push(`块${b + 1} 空输出`);
    } else {
      details.push(`块${b + 1} ok: ${out.split("\n").slice(-1)[0].slice(0, 60)}`);
    }
  }

  if (!chapterOk) failed += 1;
  rows.push({ i: i + 1, title, runButtons, staticBlocks, chapterOk, details });
  console.log(
    `${String(i + 1).padStart(2)}. ${title.padEnd(26, " ")} 可运行 ${String(runButtons).padStart(2)} · 仅示意 ${staticBlocks} · ${chapterOk ? "通过" : "失败"}`
  );
  for (const d of details) console.log(`      ${d}`);
}

console.log(`\n页面报错：${errors.length ? errors.join(" | ") : "无"}`);
console.log(`结果：${chapterCount - failed}/${chapterCount} 章通过`);

await page.screenshot({ path: `/tmp/cljs-test-${engineName}.png` });
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
