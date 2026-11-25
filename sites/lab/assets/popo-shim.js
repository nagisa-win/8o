/**
 * popo 运行时兼容层：把作品里用到的 PopSDK 子集接到 8o.nz 自己的接口上。
 *
 * 覆盖的接口（从迁移过来的作品里实际用到的就这些）：
 *   PopSDK.ready()
 *   PopSDK.user.info()                       → { userName, nickname, avatar }
 *   PopSDK.data.find(obj, { filter, order, page, pageSize }) → [{ id, data, created_at }]
 *   PopSDK.data.create(obj, data)            → record
 *   PopSDK.data.update(obj, id, patch)       → record
 *
 * 身份用本机随机 id + 昵称，存在 localStorage；不需要登录，也不上报个人信息。
 * 数据落在 api.8o.nz 的 KV 里（每条 ≤2KB，每个对象保留最近 400 条）。
 */
(() => {
  if (window.PopSDK) return;

  const API = "https://api.8o.nz";
  const UID_KEY = "8o-lab-uid";
  const NAME_KEY = "8o-lab-name";

  /** 本机访客身份：首次生成后固定下来，排行榜靠它区分彼此 */
  function loadIdentity() {
    let uid = localStorage.getItem(UID_KEY);
    if (!uid) {
      uid = `v-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(UID_KEY, uid);
    }
    let nickname = localStorage.getItem(NAME_KEY);
    if (!nickname) {
      nickname = `访客 ${uid.slice(2, 6)}`;
      localStorage.setItem(NAME_KEY, nickname);
    }
    return { userName: uid, nickname, avatar: "" };
  }

  const identity = loadIdentity();

  async function call(path, options) {
    const res = await fetch(`${API}${path}`, {
      headers: { "content-type": "application/json" },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /** 只支持作品里实际出现的形态：$.field == "value" */
  function matchFilter(record, filter) {
    const expr = filter?.jsonPath;
    if (!expr) return true;
    const m = String(expr).match(/^\$\.(\w+)\s*==\s*["']([^"']*)["']$/);
    if (!m) return true; // 认不出的表达式一律放行，避免把数据藏起来
    return String(record.data?.[m[1]] ?? "") === m[2];
  }

  const data = {
    async find(obj, options = {}) {
      const { page = 1, pageSize = 100 } = options;
      const res = await call(`/recs?obj=${encodeURIComponent(obj)}&limit=400`);
      const items = (res.items || []).filter((r) => matchFilter(r, options.filter));
      const start = (page - 1) * pageSize;
      return items.slice(start, start + pageSize);
    },

    async create(obj, record) {
      const res = await call("/recs", {
        method: "POST",
        body: JSON.stringify({ obj, data: record }),
      });
      return res;
    },

    async update(obj, id, patch) {
      const res = await call("/recs/update", {
        method: "POST",
        body: JSON.stringify({ obj, id, patch }),
      });
      return res;
    },
  };

  window.PopSDK = {
    ready: async () => true,
    user: {
      info: async () => identity,
      /** 让访客改昵称，排行榜上显示的名字 */
      rename(name) {
        const clean = String(name || "").trim().slice(0, 20);
        if (!clean) return identity.nickname;
        localStorage.setItem(NAME_KEY, clean);
        identity.nickname = clean;
        return clean;
      },
    },
    data,
  };

  // 作品里常见 <script> 在 head 后立即读取，这里补一个 ready 事件方便它们等
  document.dispatchEvent(new CustomEvent("popsdk-ready"));
})();
