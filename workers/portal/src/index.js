/**
 * 8O Observatory · 边缘服务（portal worker）
 * 同一份脚本承担两个入口：
 *   8o.nz/*      → 静态门户（assets 绑定）+ /api/* 同源接口
 *   api.8o.nz/*  → 纯 API，给 lab / status 等子站跨域调用
 *
 * 设计原则：所有外部调用都带超时与缓存，任何依赖挂掉都返回可读的降级结果。
 */

import { connect } from "cloudflare:sockets";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

/** 允许跨域的来源：所有 8o.nz 子域 + 本地预览 */
const ORIGIN_RE = /^https?:\/\/([a-z0-9-]+\.)*8o\.nz$|^http:\/\/localhost:(5173|8787|3000)$/;

/** 端口探测白名单：只放常用端口，避免变成扫描器 */
const PROBE_PORTS = new Set([22, 80, 443, 3306, 5432, 6379, 8080, 8443, 9999]);

/** 私网与保留地址一律拒绝，防止被拿来做内网探测 */
const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,
];

function cors(origin) {
  const allow = origin && ORIGIN_RE.test(origin) ? origin : "https://8o.nz";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function json(data, { origin, status = 200, cache = "no-store" } = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...JSON_HEADERS, "cache-control": cache, ...cors(origin) },
  });
}

/** 超时 fetch：外部服务不稳定时不让请求挂死 */
async function timed(url, { timeout = 4000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, {
      headers: { "user-agent": "8o-observatory/1.0 (+https://8o.nz)", ...headers },
      signal: ctrl.signal,
      cf: { cacheTtl: 300, cacheEverything: true },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 简单固定窗口限流，用 KV 计数；失败时放行，宁可少拦不误伤 */
async function rateLimit(env, key, limit, windowSec) {
  if (!env.RL) return { ok: true };
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `${key}:${bucket}`;
  try {
    const n = Number((await env.RL.get(k)) || 0) + 1;
    await env.RL.put(k, String(n), { expirationTtl: windowSec * 2 });
    return { ok: n <= limit, used: n, limit };
  } catch {
    return { ok: true };
  }
}

/* ==================== 各接口实现 ==================== */

/** 仓库数据由 profile 仓库的 Actions 每日生成，边缘只做静态分发 */
async function apiProjects(env, origin) {
  const res = await env.ASSETS.fetch(new URL("/data/projects.json", "https://8o.nz"));
  return new Response(res.body, {
    headers: { ...JSON_HEADERS, ...cors(origin), "cache-control": "public, max-age=600" },
  });
}

/** 最近提交：取公开事件流里的 PushEvent，折成一行一条 */
/** 动态流同样是静态快照：提交记录与 release 由 Actions 汇总 */
async function apiFeed(env, origin) {
  const res = await env.ASSETS.fetch(new URL("/data/feed.json", "https://8o.nz"));
  return new Response(res.body, {
    headers: { ...JSON_HEADERS, ...cors(origin), "cache-control": "public, max-age=300" },
  });
}

/** 状态数据由 status worker 写入同一个 KV，这里直接读 */
async function apiStatus(env, origin) {
  try {
    const data = await env.STATUS?.get("latest", "json");
    if (data) return json(data, { origin, cache: "public, max-age=60" });
  } catch {
    /* 忽略 */
  }
  return json({ sites: {}, at: null, note: "status worker 尚未产出数据" }, { origin });
}

/** DoH 解析：把域名解析结果按记录类型整理成平面数组 */
async function apiDns(env, url, origin) {
  const name = (url.searchParams.get("name") || "").trim();
  const type = (url.searchParams.get("type") || "A").toUpperCase();
  if (!/^[a-z0-9.-]{1,253}$/i.test(name)) return json({ error: "invalid name" }, { origin, status: 400 });
  if (!["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "CAA"].includes(type)) {
    return json({ error: "unsupported type" }, { origin, status: 400 });
  }

  try {
    const res = await timed(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { accept: "application/dns-json" } }
    );
    const data = await res.json();
    const records = (data.Answer || []).map((a) => ({
      name: a.name,
      type: a.type,
      ttl: a.TTL,
      data: a.data,
    }));
    return json({ name, type, records, status: data.Status }, { origin, cache: "public, max-age=60" });
  } catch {
    return json({ error: "upstream unavailable" }, { origin, status: 502 });
  }
}

/** 证书透明日志：查某个域名历史上签发过哪些证书 */
async function apiCert(env, url, origin) {
  const host = (url.searchParams.get("host") || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return json({ error: "invalid host" }, { origin, status: 400 });

  try {
    const res = await timed(`https://crt.sh/?q=${encodeURIComponent(host)}&output=json`, { timeout: 6000 });
    if (!res.ok) throw new Error("crt.sh");
    const rows = await res.json();

    // 同一个证书会因不同日志重复出现，先按 serial 去重
    const seen = new Map();
    for (const r of rows) {
      const key = r.serial_number;
      if (seen.has(key)) continue;
      seen.set(key, {
        commonName: r.common_name,
        issuer: r.issuer_name,
        notBefore: r.not_before,
        notAfter: r.not_after,
        nameValue: r.name_value,
      });
    }
    const list = [...seen.values()].sort((a, b) => (a.notAfter < b.notAfter ? 1 : -1)).slice(0, 20);
    return json({ host, count: seen.size, certificates: list }, { origin, cache: "public, max-age=600" });
  } catch {
    return json({ error: "ct log unavailable" }, { origin, status: 502 });
  }
}

/** 常用端口探测：白名单端口 + 3 秒超时 + 每 IP 每小时限额 */
async function apiProbe(env, url, origin, ip) {
  const host = (url.searchParams.get("host") || "").trim().toLowerCase();
  const port = Number(url.searchParams.get("port") || 443);

  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return json({ error: "invalid host" }, { origin, status: 400 });
  if (!PROBE_PORTS.has(port)) {
    return json({ error: "port not allowed", allowed: [...PROBE_PORTS] }, { origin, status: 400 });
  }
  if (PRIVATE_V4.some((re) => re.test(host))) return json({ error: "host not allowed" }, { origin, status: 400 });

  const limit = await rateLimit(env, `probe:${ip}`, 20, 3600);
  if (!limit.ok) return json({ error: "rate limited", limit }, { origin, status: 429 });

  const started = Date.now();

  // 80/443 只能用 HTTP 语义探测：Workers 主动禁止用 TCP socket 连 HTTP 端口
  if (port === 80 || port === 443) {
    const scheme = port === 443 ? "https" : "http";
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${scheme}://${host}/`, { method: "HEAD", signal: ctrl.signal, redirect: "manual" });
      clearTimeout(timer);
      return json({ host, port, open: true, code: res.status, ms: Date.now() - started }, { origin });
    } catch (err) {
      return json({ host, port, open: false, ms: Date.now() - started, reason: String(err.message || err) }, { origin });
    }
  }

  try {
    const socket = connect({ hostname: host, port });
    await Promise.race([
      socket.opened,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    socket.close();
    return json({ host, port, open: true, ms: Date.now() - started }, { origin });
  } catch (err) {
    return json({ host, port, open: false, ms: Date.now() - started, reason: String(err.message || err) }, { origin });
  }
}

/* ==================== 路由 ==================== */

const ROUTES = {
  "/health": (env, url, origin) => json({ ok: true, service: "8o-portal", at: new Date().toISOString() }, { origin }),
  "/projects": (env, url, origin) => apiProjects(env, origin),
  "/feed": (env, url, origin) => apiFeed(env, origin),
  "/status": (env, url, origin) => apiStatus(env, origin),
  "/dns": (env, url, origin) => apiDns(env, url, origin),
  "/cert": (env, url, origin) => apiCert(env, url, origin),
  "/probe": (env, url, origin, ip) => apiProbe(env, url, origin, ip),
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    // 兼容两种入口：8o.nz/api/xxx 与 api.8o.nz/xxx
    const path = url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
    const handler = ROUTES[path];

    if (handler) {
      if (request.method !== "GET") return json({ error: "method not allowed" }, { origin, status: 405 });
      return handler(env, url, origin, ip);
    }

    // api.8o.nz 根路径给出接口索引，方便别人直接看有什么
    if (url.hostname.startsWith("api.") && (path === "/" || path === "")) {
      return json(
        {
          service: "8o-edge-api",
          docs: "https://8o.nz/",
          endpoints: Object.keys(ROUTES).map((k) => `/api${k}`),
          limits: { probe: "20 req/h per IP, ports 22 80 443 3306 5432 6379 8080 8443 9999" },
        },
        { origin }
      );
    }

    // api 子域上未匹配到接口的路径直接 404，不再回落到门户静态资源
    if (url.hostname.startsWith("api.")) return json({ error: "not found" }, { origin, status: 404 });

    // 其余请求交给静态资源
    return env.ASSETS.fetch(request);
  },
};
