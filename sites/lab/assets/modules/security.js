/**
 * 安全舱：本地密码学工具箱 + 经边缘代理的被动侦察。
 * 本地部分（JWT / 哈希 / 编码 / 泄露查询）只在浏览器里算；
 * 侦察部分走 api.8o.nz，因为浏览器拿不到 DNS 与 CT 日志。
 */

const API = "https://api.8o.nz";

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ==================== JWT ==================== */

function decodePart(part) {
  const pad = part.replace(/-/g, "+").replace(/_/g, "/");
  const json = dec.decode(Uint8Array.from(atob(pad + "=".repeat((4 - (pad.length % 4)) % 4)), (c) => c.charCodeAt(0)));
  return JSON.parse(json);
}

async function verifyHs256(token, secret) {
  const [head, body, sig] = token.split(".");
  if (!head || !body || !sig) throw new Error("不是一个完整的三段式 JWT");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${head}.${body}`));
  const expected = b64url(mac);
  return { ok: expected === sig, expected };
}

/* ==================== DOM ==================== */

export async function mount(root) {
  root.innerHTML = `
    <div class="module__head">
      <div>
        <p class="label">// BAY-02 · SECURITY</p>
        <h2>安全舱</h2>
        <p>左边的东西全在本机算，右边三样必须借助边缘代理（DNS、CT 日志拿不到浏览器接口），会记录目标域名与来源 IP 用于限速。</p>
      </div>
    </div>

    <div class="sec-grid">
      <div class="card">
        <div class="card__title"><span>JWT</span><span id="jwt-state">待解析</span></div>
        <div class="field">
          <label for="jwt">Token（三段式）</label>
          <textarea id="jwt" rows="4" spellcheck="false">eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4by5ueiIsIm5hbWUiOiJuYWdpc2EiLCJpYXQiOjE3NjQwMDAwMDB9.REPLACE_ME</textarea>
        </div>
        <div class="field">
          <label for="jwt-secret">HS256 密钥（仅用于本地验签）</label>
          <input type="text" id="jwt-secret" value="8o-lab" spellcheck="false" />
        </div>
        <div class="row">
          <button class="btn-sm" id="jwt-run" type="button">解析并验签</button>
        </div>
        <pre class="out" id="jwt-out" style="margin-top:12px">等待输入…</pre>
      </div>

      <div class="card">
        <div class="card__title"><span>HASH / KDF</span><span>WebCrypto</span></div>
        <div class="field">
          <label for="hash-in">输入</label>
          <textarea id="hash-in" rows="3" spellcheck="false">8o.nz</textarea>
        </div>
        <div class="field">
          <label for="kdf-iter">PBKDF2 迭代 · <span id="kdf-val">120000</span></label>
          <input type="range" id="kdf-iter" min="1" max="10" value="6" style="width:100%" />
        </div>
        <div class="row">
          <button class="btn-sm" id="hash-run" type="button">计算</button>
          <button class="btn-sm" id="pwn-run" type="button">查泄露（k-匿名）</button>
        </div>
        <pre class="out" id="hash-out" style="margin-top:12px">SHA-256 / SHA-512 / PBKDF2 结果会显示在这里</pre>
      </div>

      <div class="card">
        <div class="card__title"><span>DNS</span><span>DoH via edge</span></div>
        <div class="field">
          <label for="dns-name">域名</label>
          <input type="text" id="dns-name" value="8o.nz" spellcheck="false" />
        </div>
        <div class="field">
          <label for="dns-type">记录类型</label>
          <select id="dns-type">
            ${["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA"].map((t) => `<option>${t}</option>`).join("")}
          </select>
        </div>
        <div class="row"><button class="btn-sm" id="dns-run" type="button">查询</button></div>
        <pre class="out" id="dns-out" style="margin-top:12px">—</pre>
      </div>

      <div class="card">
        <div class="card__title"><span>CERT / PORT</span><span>CT · 限速</span></div>
        <div class="field">
          <label for="cert-host">主机名</label>
          <input type="text" id="cert-host" value="8o.nz" spellcheck="false" />
        </div>
        <div class="field">
          <label for="port">常用端口</label>
          <select id="port">
            ${[443, 80, 22, 8080, 8443, 3306, 5432, 6379, 9999].map((p) => `<option>${p}</option>`).join("")}
          </select>
        </div>
        <div class="row">
          <button class="btn-sm" id="cert-run" type="button">查证书</button>
          <button class="btn-sm" id="port-run" type="button">探端口</button>
        </div>
        <pre class="out" id="cert-out" style="margin-top:12px">—</pre>
      </div>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  const handlers = [];

  const on = (sel, ev, fn) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener(ev, fn);
    handlers.push([el, ev, fn]);
  };

  /** 统一的接口调用：超时、错误都转成人话 */
  async function api(path, params) {
    const url = new URL(API + path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- JWT ---------- */

  on("#jwt-run", "click", async () => {
    const out = $("#jwt-out");
    const state = $("#jwt-state");
    const token = $("#jwt").value.trim();
    try {
      const [h, p] = token.split(".");
      const header = decodePart(h);
      const payload = decodePart(p);

      const exp = payload.exp ? new Date(payload.exp * 1000) : null;
      const expired = exp ? exp.getTime() < Date.now() : null;

      out.innerHTML = [
        `<b>HEADER</b>\n${esc(JSON.stringify(header, null, 2))}`,
        `<b>PAYLOAD</b>\n${esc(JSON.stringify(payload, null, 2))}`,
        exp ? `<b>EXP</b> ${esc(exp.toISOString())}${expired ? "  ⚠ 已过期" : "  ✓ 在有效期内"}` : `<b>EXP</b> 无过期声明`,
      ].join("\n\n");

      if (header.alg === "HS256") {
        const { ok } = await verifyHs256(token, $("#jwt-secret").value);
        state.textContent = ok ? "签名有效" : "签名不匹配";
        state.style.color = ok ? "var(--mint)" : "var(--rose)";
      } else {
        state.textContent = `算法 ${header.alg || "?"} 不支持本地验签`;
        state.style.color = "var(--amber)";
      }
    } catch (err) {
      out.textContent = `解析失败：${err.message}`;
      state.textContent = "解析失败";
      state.style.color = "var(--rose)";
    }
  });

  /* ---------- 哈希 ---------- */

  on("#kdf-iter", "input", (e) => {
    const iter = 10 ** Number(e.target.value);
    $("#kdf-val").textContent = String(iter);
  });

  on("#hash-run", "click", async () => {
    const out = $("#hash-out");
    const text = $("#hash-in").value;
    const iter = 10 ** Number($("#kdf-iter").value);
    try {
      const data = enc.encode(text);
      const [sha256, sha512] = await Promise.all([
        crypto.subtle.digest("SHA-256", data),
        crypto.subtle.digest("SHA-512", data),
      ]);
      const base = await crypto.subtle.importKey("raw", data, "PBKDF2", false, ["deriveBits"]);
      const derived = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: enc.encode("8o.nz"), iterations: iter, hash: "SHA-256" },
        base,
        256
      );
      out.innerHTML = [
        `<b>SHA-256</b>\n${hex(sha256)}`,
        `<b>SHA-512</b>\n${hex(sha512)}`,
        `<b>PBKDF2</b> (salt "8o.nz", ${iter} 次)\n${hex(derived)}`,
      ].join("\n\n");
    } catch (err) {
      out.textContent = `计算失败：${err.message}`;
    }
  });

  /* ---------- HIBP k-匿名 ---------- */

  on("#pwn-run", "click", async () => {
    const out = $("#hash-out");
    const pwd = $("#hash-in").value;
    if (!pwd) {
      out.textContent = "先在上面填点东西";
      return;
    }
    out.textContent = "查询中…";
    try {
      const digest = hex(await crypto.subtle.digest("SHA-1", enc.encode(pwd))).toUpperCase();
      const prefix = digest.slice(0, 5);
      const suffix = digest.slice(5);
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
      const text = await res.text();
      const hit = text.split("\n").map((line) => line.trim().split(":")).find(([s]) => s === suffix);
      out.innerHTML = hit
        ? `<b>已泄露</b>\n这个字符串在已知泄露库中出现过 <b>${Number(hit[1]).toLocaleString()}</b> 次\n\n只发送了 SHA-1 前 5 位，完整密码没有离开浏览器。`
        : `<b>未见泄露</b>\n在 Have I Been Pwned 的现有库里没查到。\n\n只发送了 SHA-1 前 5 位，完整密码没有离开浏览器。`;
    } catch (err) {
      out.textContent = `查询失败：${err.message}`;
    }
  });

  /* ---------- DNS ---------- */

  on("#dns-run", "click", async () => {
    const out = $("#dns-out");
    out.textContent = "查询中…";
    try {
      const data = await api("/api/dns", { name: $("#dns-name").value.trim(), type: $("#dns-type").value });
      out.innerHTML = data.records?.length
        ? data.records.map((r) => `<b>${esc(r.type)}</b> ${esc(r.name)}\n  ${esc(r.data)}  (ttl ${r.ttl})`).join("\n\n")
        : "没有记录";
    } catch (err) {
      out.textContent = `查询失败：${err.message}`;
    }
  });

  /* ---------- 证书与端口 ---------- */

  on("#cert-run", "click", async () => {
    const out = $("#cert-out");
    out.textContent = "查询中…";
    try {
      const host = $("#cert-host").value.trim();
      const data = await api("/api/cert", { host });
      if (!data.certificates?.length) {
        out.textContent = "CT 日志里没有这个域名的记录";
        return;
      }
      const top = data.certificates[0];
      out.innerHTML = [
        `<b>证书数</b> ${data.count}（按序列号去重）`,
        `<b>最近一张</b> ${esc(top.commonName)}`,
        `<b>签发者</b> ${esc(top.issuer)}`,
        `<b>有效至</b> ${esc(top.notAfter)}`,
        `<b>覆盖域名</b>\n${esc(top.nameValue.split("\n").slice(0, 6).join(", "))}`,
      ].join("\n\n");
    } catch (err) {
      out.textContent = `查询失败：${err.message}`;
    }
  });

  on("#port-run", "click", async () => {
    const out = $("#cert-out");
    out.textContent = "探测中…";
    try {
      const data = await api("/api/probe", { host: $("#cert-host").value.trim(), port: $("#port").value });
      out.innerHTML = data.open
        ? `<b>${esc(data.host)}:${data.port}</b> 可达 · ${data.ms} ms${data.code ? ` · HTTP ${data.code}` : ""}`
        : `<b>${esc(data.host)}:${data.port}</b> 未连通 · ${data.ms} ms\n${esc(data.reason || "")}`;
    } catch (err) {
      out.textContent = `探测失败：${err.message}`;
    }
  });

  cleanup = () => handlers.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
}

let cleanup = null;

export function unmount() {
  if (cleanup) cleanup();
  cleanup = null;
}
