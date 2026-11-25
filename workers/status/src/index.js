/**
 * 8O Observatory · 状态巡检（status worker）
 * Cron 每 15 分钟探测所有子域，把结果写进 KV；对外提供 JSON 与状态页。
 * 不依赖任何第三方监控服务，历史数据自己攒。
 */

const SITES = [
  { host: "8o.nz", url: "https://8o.nz/" },
  { host: "www.8o.nz", url: "https://www.8o.nz/" },
  { host: "lab.8o.nz", url: "https://lab.8o.nz/", optional: true },
  { host: "mermaid.8o.nz", url: "https://mermaid.8o.nz/", optional: true },
  { host: "calc.8o.nz", url: "https://calc.8o.nz/", optional: true },
  { host: "skills.8o.nz", url: "https://skills.8o.nz/", optional: true },
  { host: "api.8o.nz", url: "https://api.8o.nz/health" },
  { host: "status.8o.nz", url: "https://status.8o.nz/", self: true },
];

/** 单点探测：先 HEAD，失败再 GET，记录状态码与耗时 */
async function probe(site) {
  // 自己探自己会打到边缘回环，直接按"在线"记账
  if (site.self) {
    return { host: site.host, up: true, code: 200, ms: 0, at: new Date().toISOString(), optional: false };
  }

  const started = Date.now();
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(site.url, {
        method,
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "user-agent": "8o-status/1.0 (+https://status.8o.nz)" },
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      return res.status;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let code = await attempt("HEAD").catch(() => 0);
    if (code === 405 || code === 501 || code === 0) code = await attempt("GET");
    const ms = Date.now() - started;
    return {
      host: site.host,
      up: code > 0 && code < 500,
      code,
      ms,
      at: new Date().toISOString(),
      optional: !!site.optional,
    };
  } catch (err) {
    return {
      host: site.host,
      up: false,
      code: 0,
      ms: Date.now() - started,
      at: new Date().toISOString(),
      optional: !!site.optional,
      reason: String(err.message || err),
    };
  }
}

/** 把一次巡检的结果折叠进 latest 与每个站点的历史环 */
async function runChecks(env) {
  const results = await Promise.all(SITES.map(probe));

  const sites = {};
  for (const r of results) sites[r.host] = r;

  const at = new Date().toISOString();
  await env.STATUS.put("latest", JSON.stringify({ at, sites }));

  await Promise.all(
    results.map(async (r) => {
      const key = `hist:${r.host}`;
      const hist = (await env.STATUS.get(key, "json")) || [];
      hist.push({ t: r.at, up: r.up, ms: r.ms, code: r.code });
      // 只留最近 96 次（15 分钟一次 = 24 小时）
      await env.STATUS.put(key, JSON.stringify(hist.slice(-96)), { expirationTtl: 60 * 60 * 24 * 8 });
    })
  );

  return { at, sites };
}

/* ==================== HTTP ==================== */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS },
  });
}

/** 状态页：把要点说清楚，视觉沿用 8O token */
function renderPage(payload, history) {
  const rows = Object.values(payload.sites || {})
    .map((s) => {
      const state = s.up ? (s.ms > 900 ? "slow" : "up") : "down";
      const bars = (history[s.host] || [])
        .map((h) => `<i class="${h.up ? (h.ms > 900 ? "s" : "u") : "d"}" title="${h.t}"></i>`)
        .join("");
      return `<tr>
        <td class="host"><i class="dot ${state}"></i><span>${s.host}</span></td>
        <td class="mono">${s.code || "—"}</td>
        <td class="mono">${s.host === "status.8o.nz" ? "—" : `${s.ms} ms`}</td>
        <td class="bars"><div>${bars || '<i class="d"></i>'}</div></td>
        <td class="mono ${state}">${s.up ? (state === "slow" ? "DEGRADED" : "OPERATIONAL") : "OFFLINE"}</td>
      </tr>`;
    })
    .join("");

  const upCount = Object.values(payload.sites || {}).filter((s) => s.up).length;
  const total = Object.keys(payload.sites || {}).length;

  return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>站点状态 — 8O OBSERVATORY</title>
<meta name="description" content="8o.nz 下所有子域的实时状态与最近 24 小时巡检记录。">
<link rel="icon" href="https://8o.nz/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://8o.nz/ui/8o.css">
<style>
  body{padding:clamp(24px,6vw,72px) 0}
  .wrap{display:grid;gap:32px}
  h1{font-size:clamp(26px,4vw,38px);margin:8px 0 4px}
  .sub{color:var(--ink-dim);margin:0}
  .summary{display:flex;gap:24px;flex-wrap:wrap;padding:20px 24px}
  .summary b{display:block;font-family:var(--font-mono);font-size:22px}
  .ok{color:var(--mint)}.slow{color:var(--amber)}.down{color:var(--rose)}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{text-align:left;font-family:var(--font-mono);font-size:10px;letter-spacing:.18em;color:var(--ink-dim);
     padding:10px 12px;border-bottom:1px solid var(--line)}
  td{padding:14px 12px;border-bottom:1px solid rgba(124,170,255,.07);vertical-align:middle}
  .host{display:flex;align-items:center;gap:10px;font-family:var(--font-mono)}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--steel)}
  .dot.up{background:var(--mint);box-shadow:0 0 10px var(--mint)}
  .dot.slow{background:var(--amber);box-shadow:0 0 10px var(--amber)}
  .dot.down{background:var(--rose);box-shadow:0 0 10px var(--rose)}
  .bars div{display:flex;gap:2px;align-items:flex-end;height:22px}
  .bars i{display:block;width:5px;height:100%;border-radius:1px;background:rgba(124,170,255,.12)}
  .bars i.u{background:var(--mint);opacity:.7}
  .bars i.s{background:var(--amber);opacity:.75}
  .bars i.d{background:var(--rose);opacity:.8}
  .foot{color:var(--ink-dim);font-size:12px;font-family:var(--font-mono)}
  .foot a{color:var(--accent)}
  @media(max-width:640px){td:nth-child(2),th:nth-child(2){display:none}}
</style></head>
<body><div class="wrap">
    <header>
      <p class="label">// 8O · STATUS</p>
      <h1>站点状态</h1>
      <p class="sub">每 15 分钟巡检一次，右侧色块是最近 24 小时的记录，最新的一格在最右。</p>
    </header>
    <div class="summary panel">
      <div><span class="label">UP</span><b class="ok">${upCount}/${total}</b></div>
      <div><span class="label">CHECKED</span><b class="mono">${payload.at ? new Date(payload.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—"}</b></div>
      <div><span class="label">SOURCE</span><b class="mono">CF CRON</b></div>
    </div>
    <table>
      <thead><tr><th>HOST</th><th>CODE</th><th>LATENCY</th><th>24H</th><th>STATE</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="foot">JSON: <a href="/api/status">/api/status</a> · 历史: <a href="/api/history?host=8o.nz">/api/history</a> · 返回 <a href="https://8o.nz/">观测站</a></p>
  </div></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/api/status") {
      const latest = (await env.STATUS.get("latest", "json")) || { sites: {}, at: null };
      return json(latest);
    }

    if (url.pathname === "/api/history") {
      const host = url.searchParams.get("host") || "8o.nz";
      const hist = (await env.STATUS.get(`hist:${host}`, "json")) || [];
      return json({ host, points: hist });
    }

    // 手动触发一次巡检，方便调试（有 404 保护，不影响正常访问）
    if (url.pathname === "/api/check" && url.searchParams.has("now")) {
      const result = await runChecks(env);
      return json(result);
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      const latest = (await env.STATUS.get("latest", "json")) || { sites: {}, at: null };
      const history = {};
      for (const site of SITES) {
        history[site.host] = (await env.STATUS.get(`hist:${site.host}`, "json")) || [];
      }
      return new Response(renderPage(latest, history), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  /** Cron Trigger：每 15 分钟一次 */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runChecks(env));
  },
};
