/**
 * 8O Observatory · 门户脚本
 * 零依赖 ES module：星空背景、时钟、卡片渲染、动态流、⌘K 快速跳转。
 * 所有网络请求都做超时与降级，接口挂了页面依然完整可用。
 */

import { t, detectLang, saveLang } from "./i18n.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 当前语言：zh | en，初始值来自 localStorage 或浏览器语言 */
let LANG = detectLang();

/** 页面数据的缓存，切换语言时按新语言重画 */
const DATA = { sites: [], projects: [], feed: null, status: null };

/** 按语言取字段，缺英文时回退中文 */
const L = (obj, key) => (LANG === "en" ? obj[`${key}_en`] ?? obj[key] : obj[key]);

/** 带超时的 fetch，失败返回 null，避免任何接口拖垮首屏 */
async function safeJson(url, timeout = 3000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const ACCENTS = {
  cyan: "var(--accent)",
  violet: "var(--violet)",
  mint: "var(--mint)",
  amber: "var(--amber)",
  rose: "var(--rose)",
  steel: "var(--steel)",
};

/* ==================== 星空 ==================== */

function initStars() {
  const canvas = $("#stars");
  if (!canvas || canvas.dataset.inited === "1") return;
  canvas.dataset.inited = "1";

  const ctx = canvas.getContext("2d", { alpha: true });
  let dpr = Math.min(devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let stars = [];
  let raf = 0;
  let pointer = { x: 0.5, y: 0.5 };
  let visible = true;


  /** 透视线框地面：灭点在地平线上，随指针轻微偏移；辉光用径向渐变，避免出现硬边 */
  function drawFloor(t) {
    const hy = h * 0.8;
    const vpx = w * 0.5 + (pointer.x - 0.5) * 60;
    const sway = reduced ? 0 : Math.sin(t * 0.0004) * 8;

    // 地平线辉光：中心亮、两侧自然衰减
    const halo = ctx.createRadialGradient(vpx, hy, 0, vpx, hy, w * 0.62);
    halo.addColorStop(0, "rgba(77, 225, 255, 0.20)");
    halo.addColorStop(0.35, "rgba(77, 225, 255, 0.07)");
    halo.addColorStop(1, "rgba(77, 225, 255, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, hy - 26, w, 52);

    // 地平线本身：一条很细的亮线
    const line = ctx.createLinearGradient(0, 0, w, 0);
    line.addColorStop(0, "rgba(77, 225, 255, 0)");
    line.addColorStop(0.5, "rgba(150, 235, 255, 0.45)");
    line.addColorStop(1, "rgba(77, 225, 255, 0)");
    ctx.fillStyle = line;
    ctx.fillRect(0, hy, w, 1);

    ctx.lineWidth = 1;

    // 横向：越靠近观察者越稀疏
    for (let i = 1; i <= 12; i += 1) {
      const k = i / 12;
      const y = hy + Math.pow(k, 2.6) * (h - hy) * 1.15;
      ctx.strokeStyle = `rgba(77, 225, 255, ${(0.04 + k * 0.12).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 纵向：从灭点发散的射线
    for (let i = -12; i <= 12; i += 1) {
      const xBottom = vpx + i * (w * 0.14) + sway * (i / 12);
      const alpha = 0.11 - Math.min(0.09, Math.abs(i) * 0.006);
      ctx.strokeStyle = `rgba(77, 225, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(vpx, hy);
      ctx.lineTo(xBottom, h);
      ctx.stroke();
    }
  }

  /** 星星按深度分层：深层小且暗，浅层大且亮，鼠标视差只作用于浅层 */
  function seed() {
    const count = Math.round(Math.min(300, (w * h) / 5200));
    stars = Array.from({ length: count }, () => {
      const depth = Math.random();
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.5 + depth * 1.7,
        depth,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.2,
        drift: 0.01 + depth * 0.05,
      };
    });
  }

  function resize() {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    drawFloor(t);

    for (const s of stars) {
      // 缓慢向上漂移，走出版面后从底部回收
      if (!reduced) {
        s.y -= s.drift;
        if (s.y < -2) s.y = h + 2;
      }

      const ox = (pointer.x - 0.5) * 44 * s.depth;
      const oy = (pointer.y - 0.5) * 30 * s.depth;
      const twinkle = reduced ? 1 : 0.72 + Math.sin(t * 0.001 * s.speed + s.twinkle) * 0.28;
      // 内容区（左侧文案与右侧面板）里的星点压暗，保证文字可读
      const inCopy = s.x < w * 0.62 && s.y > h * 0.26 && s.y < h * 0.76;
      const alpha = (0.28 + s.depth * 0.62) * twinkle * (inCopy ? 0.32 : 1);

      ctx.beginPath();
      ctx.arc(s.x + ox, s.y + oy, s.r, 0, Math.PI * 2);
      ctx.fillStyle =
        s.depth > 0.78
          ? `rgba(176, 232, 255, ${alpha})`
          : s.depth > 0.45
            ? `rgba(150, 175, 220, ${alpha * 0.9})`
            : `rgba(120, 140, 180, ${alpha * 0.75})`;
      ctx.fill();

      // 最亮的一层加十字星芒，像仪器里的参考星
      if (s.depth > 0.9) {
        ctx.strokeStyle = `rgba(150, 215, 255, ${alpha * 0.5})`;
        ctx.lineWidth = 0.7;
        const arm = 3.5 + s.depth * 3;
        ctx.beginPath();
        ctx.moveTo(s.x + ox - arm, s.y + oy);
        ctx.lineTo(s.x + ox + arm, s.y + oy);
        ctx.moveTo(s.x + ox, s.y + oy - arm);
        ctx.lineTo(s.x + ox, s.y + oy + arm);
        ctx.stroke();
      }
    }
  }

  function loop(t) {
    if (!visible) return;
    draw(t);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduced) draw(0);
    else raf = requestAnimationFrame(loop);
  }

  addEventListener("resize", () => {
    resize();
    start();
  });

  addEventListener("pointermove", (e) => {
    pointer = { x: e.clientX / innerWidth, y: e.clientY / innerHeight };
  });

  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible) start();
    else cancelAnimationFrame(raf);
  });

  resize();
  start();
}

/* ==================== 时钟与遥测 ==================== */

function initClock() {
  const clock = $("#clock");
  const uptime = $("#tm-uptime");
  const started = performance.now();

  const pad = (n) => String(n).padStart(2, "0");

  const tick = () => {
    const now = new Date();
    if (clock) {
      clock.textContent = now.toLocaleTimeString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });
    }
    if (uptime) {
      const s = Math.floor((performance.now() - started) / 1000);
      uptime.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    }
  };

  tick();
  setInterval(tick, 1000);
}

/** 探测一次自身资源的往返时间，作为 LATENCY 的真实数据而非假的装饰 */
async function probeLatency() {
  const el = $("#tm-latency");
  if (!el) return;
  const t0 = performance.now();
  try {
    await fetch(`data/sites.json?t=${Date.now()}`, { cache: "no-store" });
    el.textContent = `${Math.round(performance.now() - t0)} ms`;
  } catch {
    el.textContent = "n/a";
  }
}

/* ==================== 主题 ==================== */

const THEME_KEY = "8o-theme";

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.querySelector("[data-theme-toggle]");
  if (btn) {
    btn.setAttribute("aria-label", theme === "light" ? "切换到暗色主题" : "切换到亮色主题");
    btn.dataset.theme = theme;
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === "light" ? "light" : "dark");

  const btn = document.querySelector("[data-theme-toggle]");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
    // 星场在暗色下才画，切换回来要重新初始化一次
    if (next === "dark") initStars();
  });
}

/* ==================== 语言 ==================== */

/** 把界面上的静态文案按当前语言刷一遍 */
function applyI18n() {
  const html = document.documentElement;
  html.lang = LANG === "en" ? "en" : "zh-CN";

  document.title = t(LANG, "meta.title");
  const desc = $('meta[name="description"]');
  if (desc) desc.setAttribute("content", t(LANG, "meta.desc"));

  // 纯文本节点
  $$("[data-i18n]").forEach((el) => {
    el.textContent = t(LANG, el.dataset.i18n);
  });

  // 带内联标签的段落
  $$("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(LANG, el.dataset.i18nHtml);
  });

  // 输入框占位符
  $$("[data-i18n-ph]").forEach((el) => {
    el.setAttribute("placeholder", t(LANG, el.dataset.i18nPh));
  });

  const langBtn = $("[data-lang-toggle]");
  if (langBtn) {
    langBtn.textContent = LANG === "en" ? "中" : "EN";
    langBtn.setAttribute("aria-label", t(LANG, "lang.toggle"));
    langBtn.setAttribute("title", t(LANG, "lang.toggle"));
  }

  const paletteBtn = $("[data-palette-open]");
  if (paletteBtn) paletteBtn.setAttribute("aria-label", t(LANG, "palette.open"));

  const themeBtn = $("[data-theme-toggle]");
  if (themeBtn) {
    themeBtn.setAttribute("aria-label", t(LANG, document.documentElement.dataset.theme === "light" ? "theme.toDark" : "theme.toLight"));
  }
}

/** 切换语言后需要重画的部分（列表都来自 JSON） */
function renderAll() {
  if (DATA.sites.length) renderSites(DATA.sites);
  initProjects(DATA.projects);
  initPalette({ sites: DATA.sites, projects: DATA.projects });
  if (DATA.feed) renderFeed(DATA.feed);
  if (DATA.status) applyStatus(DATA.status);
}

function initLang() {
  applyI18n();
  const btn = $("[data-lang-toggle]");
  if (!btn) return;
  btn.addEventListener("click", () => {
    LANG = LANG === "zh" ? "en" : "zh";
    saveLang(LANG);
    applyI18n();
    renderAll();
  });
}

/* ==================== 滚动显现 ==================== */

function initReveal() {
  const items = $$("[data-reveal]");
  if (!items.length || reduced) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
  );

  items.forEach((el) => io.observe(el));
}

/* ==================== 站点卡片 ==================== */

function siteCard(site) {
  const article = document.createElement("article");
  article.className = "site";
  article.style.setProperty("--accent-local", ACCENTS[site.accent] || "var(--accent)");
  article.dataset.site = site.host;

  const tags = (L(site, "tags") || []).map((x) => `<li>${x}</li>`).join("");
  const status = site.status === "planned" ? "planned" : "";

  article.innerHTML = `
    <div class="site__top">
      <i class="site__dot" data-status="${status}" data-host="${site.host}"></i>
      <span class="site__host">${site.host}</span>
      <span class="site__kind">${site.kind || "site"}</span>
    </div>
    <h3 class="site__title">${L(site, "title")}</h3>
    <p class="site__desc">${L(site, "desc")}</p>
    <ul class="site__tags">${tags}</ul>
    <div class="site__foot">
      <span data-latency="${site.host}">${site.status === "planned" ? t(LANG, "site.planned") : t(LANG, "site.probe")}</span>
      <span class="site__go">${t(LANG, "site.open")} <span aria-hidden="true">→</span></span>
    </div>
    <a class="site__link" href="${site.url}" aria-label="打开 ${site.title}（${site.host}）"></a>
  `;

  // 指针坐标喂给 CSS 柔光
  article.addEventListener("pointermove", (e) => {
    const r = article.getBoundingClientRect();
    article.style.setProperty("--mx", `${e.clientX - r.left}px`);
    article.style.setProperty("--my", `${e.clientY - r.top}px`);
  });

  return article;
}

const siteMeta = new Map();

function renderSites(sites) {
  const grid = $("#sites-grid");
  if (!grid || !sites?.length) return;

  siteMeta.clear();
  sites.forEach((s) => siteMeta.set(s.host, s));

  const frag = document.createDocumentFragment();
  sites.forEach((s) => frag.append(siteCard(s)));
  grid.replaceChildren(frag);

  const meta = $("#meta-sites");
  if (meta) meta.textContent = String(sites.filter((s) => s.status === "live").length);
}

/* ==================== 开源档案 ==================== */

let projectState = { all: [], category: null };

function projectRow(p) {
  const li = document.createElement("article");
  li.className = "project";
  const stars = p.stars || 0;
  const pct = Math.max(6, Math.min(100, (stars / (projectState.maxStars || 1)) * 100));

  li.innerHTML = `
    <div class="project__main">
      <div class="project__name">
        <a href="${p.url}" target="_blank" rel="noreferrer">${p.repo}</a>
        ${p.live ? `<span class="project__live">LIVE</span>` : ""}
      </div>
      <div class="project__desc">${L(p, "desc") || ""}</div>
    </div>
    <div class="project__side">
      <span>${p.language || "—"}</span>
      <span class="project__stars"><span aria-hidden="true">★</span> ${stars}
        <span class="project__bar" aria-hidden="true"><i style="transform: scaleX(${pct / 100})"></i></span>
      </span>
      <span>${p.updated ? p.updated.slice(0, 10) : ""}</span>
    </div>
  `;
  return li;
}

function renderProjects() {
  const list = $("#projects-list");
  if (!list) return;

  const filtered =
    projectState.category === null
      ? projectState.all
      : projectState.all.filter((p) => L(p, "category") === projectState.category);

  if (!filtered.length) {
    list.innerHTML = `<p class="projects__empty mono">${t(LANG, "empty.projects")}</p>`;
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach((p) => frag.append(projectRow(p)));
  list.replaceChildren(frag);
}

function initProjects(projects) {
  projectState.all = projects || [];
  projectState.maxStars = Math.max(1, ...projectState.all.map((p) => p.stars || 0));

  const allLabel = LANG === "en" ? "All" : "全部";
  const cats = [allLabel, ...new Set(projectState.all.map((p) => L(p, "category") || (LANG === "en" ? "Other" : "其他")))];

  // null 表示「全部」；换语言后分类名变了，非空但匹配不上就回落到全部
  if (projectState.category !== null && !cats.includes(projectState.category)) projectState.category = null;
  const bar = $("#project-filters");
  if (bar) {
    bar.replaceChildren(
      ...cats.map((c) => {
        const b = document.createElement("button");
        b.className = "chip";
        b.type = "button";
        b.textContent = c;
        const isAll = c === allLabel;
        b.setAttribute("aria-pressed", String(isAll ? projectState.category === null : c === projectState.category));
        b.addEventListener("click", () => {
          projectState.category = isAll ? null : c;
          $$(".chip", bar).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          renderProjects();
        });
        return b;
      })
    );
  }

  renderProjects();
}

/* ==================== 动态流 ==================== */

function ago(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return `${Math.round(diff / 86400)} d ago`;
}

function renderFeed(feed) {
  const left = $("#feed-commits");
  const right = $("#feed-posts");
  if (!left || !right) return;

  /** 一行一条：左侧仓库名，右侧时间 */
  const row = (key, text, url, time) => {
    const li = document.createElement("li");
    li.className = "feed__item";
    li.innerHTML = `
      <span class="feed__main">
        <span class="feed__repo">${key}</span>
        <span class="feed__text"><a href="${url}" target="_blank" rel="noreferrer">${text}</a></span>
      </span>
      <span class="feed__time">${time}</span>
    `;
    return li;
  };

  if (feed?.updated?.length) {
    left.replaceChildren(
      ...feed.updated.slice(0, 8).map((u) => row(u.repo, L(u, "desc") || u.language || "updated", u.url, ago(u.at)))
    );
  } else {
    left.innerHTML = `<li class="feed__empty mono">${t(LANG, "feed.standby")}</li>`;
  }

  if (feed?.releases?.length) {
    right.replaceChildren(
      ...feed.releases.slice(0, 8).map((r) => row(r.repo, `${r.tag} ${r.name}`.trim(), r.url, ago(r.at)))
    );
  } else {
    right.innerHTML = `<li class="feed__empty mono">${t(LANG, "feed.norelease")}</li>`;
  }
}

/* ==================== 状态升级与信号灯 ==================== */

function applyStatus(status) {
  const signal = $("#signal");
  const text = $("#signal-text");
  const probe = $("#tm-probe");
  if (!status?.sites) return;

  let up = 0;
  let total = 0;

  for (const [host, info] of Object.entries(status.sites)) {
    // 尚未上线的舱段保持"计划中"，不显示成故障
    if (siteMeta.get(host)?.status === "planned") {
      const d = $(`.site__dot[data-host="${host}"]`);
      if (d) d.dataset.status = "planned";
      continue;
    }
    total += 1;
    if (info.up) up += 1;

    const dot = $(`.site__dot[data-host="${host}"]`);
    if (dot) dot.dataset.status = info.up ? (info.ms > 800 ? "slow" : "up") : "down";

    const lat = $(`[data-latency="${host}"]`);
    if (lat) lat.textContent = info.up ? `${info.ms} ms` : "OFFLINE";
  }

  if (signal && text) {
    signal.dataset.state = up === total ? "ok" : up > 0 ? "warn" : "down";
    text.textContent = `${up}/${total} UP`;
  }
  if (probe) probe.textContent = up === total ? "all clear" : `${total - up} degraded`;
}

/* ==================== ⌘K 快速跳转 ==================== */

/** ⌘K 面板的条目，切换语言时会被重算 */
let paletteEntries = [];
let paletteResults = [];
let paletteActive = 0;
let paletteBound = false;

/** 按当前语言重建条目（站点名、固定链接都跟着语言走） */
function buildPaletteEntries(sites, projects) {
  paletteEntries = [
    ...sites.map((x) => ({ kind: "SITE", label: L(x, "title"), meta: x.host, url: x.url })),
    ...projects.map((x) => ({ kind: "REPO", label: x.repo, meta: x.language || "—", url: x.url })),
    { kind: "LINK", label: "GitHub", meta: "nagisa-win", url: "https://github.com/nagisa-win" },
    { kind: "LINK", label: "RyzenX", meta: "ryzenx.com", url: "https://ryzenx.com" },
    { kind: "LINK", label: "Telegram", meta: "@IrisXe", url: "https://t.me/IrisXe" },
  ];
}

function paintPalette() {
  const list = $("#palette-list");
  if (!list) return;
  list.replaceChildren(
    ...paletteResults.slice(0, 8).map((e, i) => {
      const li = document.createElement("li");
      li.className = "palette__item";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === paletteActive));
      li.innerHTML = `<span class="label">${e.kind}</span><span>${e.label}</span><kbd>${e.meta}</kbd>`;
      li.addEventListener("pointerenter", () => {
        paletteActive = i;
        paintPalette();
      });
      li.addEventListener("click", () => {
        location.href = e.url;
      });
      return li;
    })
  );
}

function filterPalette() {
  const input = $("#palette-input");
  const q = (input?.value || "").trim().toLowerCase();
  paletteResults = q
    ? paletteEntries.filter((e) => `${e.label} ${e.meta} ${e.kind}`.toLowerCase().includes(q))
    : paletteEntries;
  paletteActive = 0;
  paintPalette();
}

function openPalette() {
  const dialog = $("#palette");
  const input = $("#palette-input");
  if (!dialog || !input || dialog.open) return;
  input.value = "";
  filterPalette();
  dialog.showModal();
  input.focus();
}

function initPalette({ sites, projects }) {
  const dialog = $("#palette");
  const input = $("#palette-input");
  if (!dialog || !input) return;

  buildPaletteEntries(sites, projects);

  // 语言切换后重建条目即可，事件不重复绑定
  if (paletteBound) {
    filterPalette();
    return;
  }
  paletteBound = true;

  input.addEventListener("input", filterPalette);

  input.addEventListener("keydown", (e) => {
    const step = Math.min(8, paletteResults.length || 1);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      paletteActive = (paletteActive + 1) % step;
      paintPalette();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      paletteActive = (paletteActive - 1 + step) % step;
      paintPalette();
    } else if (e.key === "Enter" && paletteResults[paletteActive]) {
      e.preventDefault();
      location.href = paletteResults[paletteActive].url;
    }
  });

  addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
  });

  $$("[data-palette-open]").forEach((b) => b.addEventListener("click", openPalette));

  filterPalette();
}

/* ==================== 交互特效 ==================== */
/**
 * 四类交互：指针柔光、点击水波、键盘脉冲、滚动进度。
 * 全部走 transform/opacity，指针事件用 passive，reduced-motion 时整体跳过。
 */
function initEffects() {
  if (reduced) return;

  const hero = $(".hero");
  const bar = $(".scroll-bar i");
  const brand = $(".brand");
  const signal = $("#signal");

  /* ---------- 指针：hero 内柔光跟随 ---------- */
  let rafId = 0;
  let pending = null;

  const paintSpot = () => {
    rafId = 0;
    if (!pending || !hero) return;
    hero.style.setProperty("--spot-x", `${pending.x}px`);
    hero.style.setProperty("--spot-y", `${pending.y}px`);
  };

  if (hero && matchMedia("(pointer: fine)").matches) {
    hero.addEventListener(
      "pointermove",
      (e) => {
        const r = hero.getBoundingClientRect();
        pending = { x: e.clientX - r.left, y: e.clientY - r.top };
        hero.dataset.pointer = "on";
        // 一帧只画一次，指针再快也不会堆任务
        if (!rafId) rafId = requestAnimationFrame(paintSpot);
      },
      { passive: true }
    );

    hero.addEventListener("pointerleave", () => {
      hero.dataset.pointer = "off";
    });
  }

  /* ---------- 点击：水波从落点扩散 ---------- */
  const RIPPLE_TARGETS = ".btn, .site, .chip, .contact__link, .nav a, .kbd-btn, .theme-btn, .lang-btn";

  document.addEventListener(
    "pointerdown",
    (e) => {
      const host = e.target.closest(RIPPLE_TARGETS);
      if (!host || !host.offsetParent) return;
      const r = host.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 1.6;
      const dot = document.createElement("span");
      dot.className = "ripple";
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - r.left}px`;
      dot.style.top = `${e.clientY - r.top}px`;

      // 宿主没有定位上下文时临时补一个，水波才不会跑到页面上
      const prevPosition = host.style.position;
      const prevOverflow = host.style.overflow;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.style.overflow = "hidden";
      host.append(dot);

      // 动画结束把临时样式还回去，避免长期裁掉阴影与聚焦描边
      dot.addEventListener(
        "animationend",
        () => {
          dot.remove();
          host.style.position = prevPosition;
          host.style.overflow = prevOverflow;
        },
        { once: true }
      );
    },
    { passive: true }
  );

  /* ---------- 键盘：轻脉冲提示页面在响应 ---------- */
  let kbTimer = 0;
  addEventListener(
    "keydown",
    (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1 && !["Enter", " ", "Escape"].includes(e.key)) return;
      if (e.target.closest("input, textarea, [contenteditable]")) return;

      if (brand) brand.classList.add("kb-pulse");
      if (signal) signal.classList.add("kb-pulse");
      clearTimeout(kbTimer);
      kbTimer = setTimeout(() => {
        brand?.classList.remove("kb-pulse");
        signal?.classList.remove("kb-pulse");
      }, 220);
    },
    { passive: true }
  );

  /* ---------- 滚动：顶部进度 + hero 轻微视差 ---------- */
  const glyph = $(".hero__glyph");
  let scrollTick = 0;

  const onScroll = () => {
    if (scrollTick) return;
    scrollTick = requestAnimationFrame(() => {
      scrollTick = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      const ratio = max > 0 ? Math.min(1, scrollY / max) : 0;
      document.documentElement.style.setProperty("--scroll-progress", ratio.toFixed(4));

      // hero 淡出时的轻微位移，幅度控制在 24px 内
      if (glyph && scrollY < innerHeight) {
        glyph.style.transform = `translate3d(0, ${(scrollY * 0.06).toFixed(1)}px, 0)`;
      }
    });
  };

  if (bar) {
    document.documentElement.style.setProperty("--scroll-progress", "0");
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ==================== 启动 ==================== */

async function main() {
  initTheme();
  initLang();
  initEffects();
  if (document.documentElement.dataset.theme !== "light") initStars();
  initClock();
  initReveal();
  probeLatency();

  const [registry, projects, build] = await Promise.all([
    safeJson("data/sites.json"),
    safeJson("data/projects.json"),
    safeJson("build.json", 1500),
  ]);

  const sites = registry?.sites || [];
  const projectsList = projects?.projects || [];
  DATA.sites = sites;
  DATA.projects = projectsList;

  if (sites.length) renderSites(sites);
  initProjects(projectsList);
  initPalette({ sites, projects: projectsList });

  if (registry?.updated) {
    const meta = $("#meta-sync");
    if (meta) meta.textContent = registry.updated;
  }

  if (build?.short) {
    const tmBuild = $("#tm-build");
    const ft = $("#footer-build");
    if (tmBuild) tmBuild.textContent = build.short;
    if (ft) ft.textContent = `build ${build.short} · ${build.at || ""}`;
  }

  // 状态与动态流是增强项，失败不影响页面
  const status = await safeJson("/api/status", 2500);
  DATA.status = status;
  applyStatus(status);

  const feed = (await safeJson("data/feed.json")) || (await safeJson("/api/feed", 3000));
  DATA.feed = feed;
  renderFeed(feed);

  const health = await safeJson("/api/health", 1500);
  const signal = $("#signal");
  if (!status?.sites && signal) {
    signal.dataset.state = health ? "ok" : "warn";
    const text = $("#signal-text");
    if (text) text.textContent = health ? "EDGE OK" : "LOCAL";
  }
}

main();
