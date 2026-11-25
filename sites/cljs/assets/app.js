/**
 * ClojureScript 自学站：章节渲染 + 浏览器内执行。
 * 解释器是本地 vendor 的 scittle（SCI），代码不出浏览器。
 */

import chapters from "./chapters.js";

const $ = (sel) => document.querySelector(sel);

const state = { index: 0 };

/* ---------- 执行 ---------- */

/** scittle 的 println 走 console，这里临时接管，把打印内容收进结果区 */
function runCode(source) {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
    originalLog.apply(console, args);
  };

  try {
    // 用 pr-str 包一层，把 CLJS 数据结构变成可读字符串
    const value = window.scittle.core.eval_string(`(pr-str (do\n${source}\n))`);
    return { logs, value };
  } finally {
    console.log = originalLog;
  }
}

function renderOutput({ logs, value }) {
  const parts = [];
  if (logs.length) parts.push(`<span class="log">${escapeHtml(logs.join("\n"))}</span>`);
  if (value !== undefined && value !== null && value !== "nil") {
    parts.push(`<span class="ok">=&gt; ${escapeHtml(String(value))}</span>`);
  }
  return parts.join("\n") || '<span class="log">（没有输出）</span>';
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function execute(code, target) {
  const box = target || $("#out");
  try {
    const result = runCode(code);
    box.innerHTML = renderOutput(result);
    $("#status").textContent = "执行完成 · 本地解释";
  } catch (err) {
    const message = String(err?.message || err).split("\n").slice(0, 6).join("\n");
    box.innerHTML = `<span class="err">${escapeHtml(message)}</span>`;
    $("#status").textContent = "执行出错";
  }
}

/* ---------- 渲染 ---------- */

function renderSidebar() {
  const list = $("#chapters");
  list.replaceChildren(
    ...chapters.map((ch, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = ch.title;
      btn.setAttribute("aria-current", String(i === state.index));
      btn.addEventListener("click", () => {
        state.index = i;
        renderSidebar();
        renderChapter();
        location.hash = ch.id;
      });
      li.append(btn);
      return li;
    })
  );
}

function renderChapter() {
  const ch = chapters[state.index];
  const content = $("#content");

  const blocks = ch.blocks
    .map((b) => {
      if (b.type === "text") return `<p class="prose">${b.body}</p>`;
      // runnable: false 的块是配置或示意代码，本浏览器解释器跑不了
      const canRun = b.runnable !== false;
      const action = canRun
        ? '<button class="btn-sm" type="button" data-run>运行</button>'
        : '<span class="btn-sm btn-sm--static">仅示意</span>';
      return `<div class="codeblock${canRun ? "" : " codeblock--static"}">
        <div class="codeblock__head"><span>${canRun ? "CLOJURESCRIPT" : "CONFIG"}</span>${action}</div>
        <pre>${escapeHtml(b.body)}</pre>
      </div>`;
    })
    .join("");

  content.innerHTML = `
    <p class="label">// 第 ${state.index + 1} 章 / 共 ${chapters.length} 章</p>
    <h1>${escapeHtml(ch.title)}</h1>
    <p class="summary">${escapeHtml(ch.summary)}</p>
    ${blocks}
    <div class="nav-row">
      <button class="btn-sm" type="button" id="prev" ${state.index === 0 ? "disabled" : ""}>← 上一章</button>
      <button class="btn-sm" type="button" id="next" ${state.index === chapters.length - 1 ? "disabled" : ""}>下一章 →</button>
    </div>
  `;

  // 每段代码都能一键送进 Playground 并立即执行
  const runnableBlocks = ch.blocks.filter((b) => b.type === "code" && b.runnable !== false);
  content.querySelectorAll(".codeblock [data-run]").forEach((btn, i) => {
    const code = runnableBlocks[i].body;
    btn.addEventListener("click", () => {
      $("#code").value = code;
      execute(code);
    });
  });

  const prev = content.querySelector("#prev");
  const next = content.querySelector("#next");
  if (prev) prev.addEventListener("click", () => go(state.index - 1));
  if (next) next.addEventListener("click", () => go(state.index + 1));

  document.title = `${ch.title} · ClojureScript 自学站`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function go(index) {
  state.index = Math.max(0, Math.min(chapters.length - 1, index));
  renderSidebar();
  renderChapter();
  location.hash = chapters[state.index].id;
}

/* ---------- 主题 ---------- */

function initTheme() {
  const btn = $("[data-theme-toggle]");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("8o-theme", next);
    } catch {
      /* 隐私模式忽略 */
    }
  });
}

/* ---------- 启动 ---------- */

function init() {
  if (!window.scittle?.core?.eval_string) {
    $("#out").innerHTML = '<span class="err">解释器没加载成功，刷新一次试试。</span>';
    $("#status").textContent = "解释器加载失败";
    return;
  }

  initTheme();

  const fromHash = location.hash.replace(/^#/, "");
  const idx = chapters.findIndex((c) => c.id === fromHash);
  state.index = idx >= 0 ? idx : 0;

  renderSidebar();
  renderChapter();

  $("#run").addEventListener("click", () => execute($("#code").value));
  $("#code").addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      execute($("#code").value);
    }
  });
}

// scittle 是普通 script，可能还没执行完，等一个宏任务再初始化
if (document.readyState === "complete") setTimeout(init, 0);
else window.addEventListener("load", () => setTimeout(init, 0));
