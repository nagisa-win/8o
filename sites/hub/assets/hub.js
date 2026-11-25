/**
 * 8O Observatory · 门户脚本
 * 零依赖 ES module：星空背景、时钟、卡片渲染、动态流、⌘K 快速跳转。
 * 所有网络请求都做超时与降级，接口挂了页面依然完整可用。
 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  const tags = (site.tags || []).map((t) => `<li>${t}</li>`).join("");
  const status = site.status === "planned" ? "planned" : "";

  article.innerHTML = `
    <div class="site__top">
      <i class="site__dot" data-status="${status}" data-host="${site.host}"></i>
      <span class="site__host">${site.host}</span>
      <span class="site__kind">${site.kind || "site"}</span>
    </div>
    <h3 class="site__title">${site.title}</h3>
    <p class="site__desc">${site.desc}</p>
    <ul class="site__tags">${tags}</ul>
    <div class="site__foot">
      <span data-latency="${site.host}">${site.status === "planned" ? "计划中" : "probe…"}</span>
      <span class="site__go">OPEN <span aria-hidden="true">→</span></span>
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

let projectState = { all: [], category: "全部" };

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
      <div class="project__desc">${p.desc || ""}</div>
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
    projectState.category === "全部"
      ? projectState.all
      : projectState.all.filter((p) => (p.category || "其他") === projectState.category);

  if (!filtered.length) {
    list.innerHTML = `<p class="projects__empty mono">NO ENTRY</p>`;
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach((p) => frag.append(projectRow(p)));
  list.replaceChildren(frag);
}

function initProjects(projects) {
  projectState.all = projects || [];
  projectState.maxStars = Math.max(1, ...projectState.all.map((p) => p.stars || 0));

  const cats = ["全部", ...new Set(projectState.all.map((p) => p.category || "其他"))];
  const bar = $("#project-filters");
  if (bar) {
    bar.replaceChildren(
      ...cats.map((c) => {
        const b = document.createElement("button");
        b.className = "chip";
        b.type = "button";
        b.textContent = c;
        b.setAttribute("aria-pressed", String(c === projectState.category));
        b.addEventListener("click", () => {
          projectState.category = c;
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
      ...feed.updated.slice(0, 8).map((u) => row(u.repo, u.desc || u.language || "更新", u.url, ago(u.at)))
    );
  } else {
    left.innerHTML = `<li class="feed__empty mono">standby</li>`;
  }

  if (feed?.releases?.length) {
    right.replaceChildren(
      ...feed.releases.slice(0, 8).map((r) => row(r.repo, `${r.tag} ${r.name}`.trim(), r.url, ago(r.at)))
    );
  } else {
    right.innerHTML = `<li class="feed__empty mono">no release yet</li>`;
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

function initPalette({ sites, projects }) {
  const dialog = $("#palette");
  const input = $("#palette-input");
  const list = $("#palette-list");
  if (!dialog || !input || !list) return;

  const entries = [
    ...sites.map((s) => ({ kind: "SITE", label: s.title, meta: s.host, url: s.url })),
    ...projects.map((p) => ({ kind: "REPO", label: p.repo, meta: p.language || "—", url: p.url })),
    { kind: "LINK", label: "GitHub", meta: "nagisa-win", url: "https://github.com/nagisa-win" },
    { kind: "LINK", label: "RyzenX 博客", meta: "ryzenx.com", url: "https://ryzenx.com" },
    { kind: "LINK", label: "笔记站", meta: "v.8o.nz", url: "https://v.8o.nz" },
    { kind: "LINK", label: "Telegram", meta: "@IrisXe", url: "https://t.me/IrisXe" },
  ];

  let results = entries;
  let active = 0;

  function paint() {
    list.replaceChildren(
      ...results.slice(0, 8).map((e, i) => {
        const li = document.createElement("li");
        li.className = "palette__item";
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === active));
        li.innerHTML = `<span class="label">${e.kind}</span><span>${e.label}</span><kbd>${e.meta}</kbd>`;
        li.addEventListener("pointerenter", () => {
          active = i;
          paint();
        });
        li.addEventListener("click", () => {
          location.href = e.url;
        });
        return li;
      })
    );
  }

  function filter() {
    const q = input.value.trim().toLowerCase();
    results = q
      ? entries.filter((e) => `${e.label} ${e.meta} ${e.kind}`.toLowerCase().includes(q))
      : entries;
    active = 0;
    paint();
  }

  function open() {
    if (dialog.open) return;
    input.value = "";
    filter();
    dialog.showModal();
    input.focus();
  }

  input.addEventListener("input", filter);

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = (active + 1) % Math.min(8, results.length || 1);
      paint();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = (active - 1 + Math.min(8, results.length || 1)) % Math.min(8, results.length || 1);
      paint();
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      location.href = results[active].url;
    }
  });

  addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      open();
    }
  });

  $$("[data-palette-open]").forEach((b) => b.addEventListener("click", open));
}

/* ==================== 启动 ==================== */

async function main() {
  initTheme();
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
  applyStatus(status);

  const feed = (await safeJson("data/feed.json")) || (await safeJson("/api/feed", 3000));
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
