/**
 * 泡泡平台接入：用户身份 + 排行榜数据。
 * 页面单独打开（没有注入 PopSDK）时自动降级为本地体验模式。
 */

const OBJECT = 'score';
// 关卡数上限，和 levels/index.js 的 TOTAL 一致
const MAX_LEVELS = 18;
const findPageSize = 100;
const maxPages = 10;

let sdkPromise = null;

export function sdk() {
  return typeof window !== 'undefined' ? window.PopSDK : undefined;
}

export function waitForSDK(timeout = 1500) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (sdk()) return resolve(sdk());
    const started = Date.now();
    const timer = setInterval(() => {
      if (sdk() || Date.now() - started > timeout) {
        clearInterval(timer);
        resolve(sdk() || null);
      }
    }, 80);
  });
  return sdkPromise;
}

/** 当前访问者信息，拿不到时返回 null */
export async function getMe() {
  const api = await waitForSDK();
  if (!api || !api.user || typeof api.user.info !== 'function') return null;
  try {
    const info = await api.user.info();
    return {
      userName: String(info.userName || '').trim(),
      nickname: String(info.nickname || '').trim() || String(info.userName || '').trim() || '匿名玩家',
      avatar: typeof info.avatar === 'string' ? info.avatar : '',
    };
  } catch (_) {
    return null;
  }
}

function safeUserName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9_.\-@]/g, '').slice(0, 96);
}

/** 成绩更好：通关数更高，或通关数相同时广告停留更短 */
export function isBetter(a, b) {
  if (!b) return true;
  const la = Number(a.levelsCleared) || 0;
  const lb = Number(b.levelsCleared) || 0;
  if (la !== lb) return la > lb;
  return (Number(a.adMs) || 0) < (Number(b.adMs) || 0);
}

function normalize(rec) {
  const d = rec && rec.data ? rec.data : rec || {};
  return {
    userName: String(d.userName || ''),
    nickname: String(d.nickname || d.userName || '匿名玩家'),
    avatar: typeof d.avatar === 'string' ? d.avatar : '',
    levelsCleared: Math.max(0, Math.min(MAX_LEVELS, Number(d.levelsCleared) || 0)),
    adMs: Math.max(0, Number(d.adMs) || 0),
    fullClear: !!d.fullClear,
    updatedAt: (rec && (rec.updatedAt || rec.createdAt)) || '',
  };
}

/** 同一用户只保留最佳成绩，按「通关数降序 -> 广告停留升序」排序 */
export function rank(records) {
  const map = new Map();
  for (const raw of records || []) {
    const r = normalize(raw);
    if (!r.userName) continue;
    const cur = map.get(r.userName);
    if (!cur || isBetter(r, cur)) map.set(r.userName, r);
  }
  return [...map.values()].sort((a, b) => {
    if (b.levelsCleared !== a.levelsCleared) return b.levelsCleared - a.levelsCleared;
    if (a.adMs !== b.adMs) return a.adMs - b.adMs;
    return String(a.updatedAt).localeCompare(String(b.updatedAt));
  });
}

export async function fetchScores() {
  const api = await waitForSDK();
  if (!api || !api.data) return { ok: false, reason: 'nosdk', list: [] };
  const all = [];
  try {
    for (let page = 1; page <= maxPages; page++) {
      const rows = await api.data.find(OBJECT, {
        order: [{ expression: 'created_at DESC' }],
        page,
        pageSize: findPageSize,
      });
      if (!Array.isArray(rows) || rows.length === 0) break;
      all.push(...rows);
      if (rows.length < findPageSize) break;
    }
    return { ok: true, list: rank(all) };
  } catch (error) {
    return { ok: false, reason: (error && error.code) || 'error', list: [] };
  }
}

/**
 * 提交一次成绩：只保留个人最好成绩。
 * 返回 { ok, updated, best }
 */
export async function submitRun(run) {
  const api = await waitForSDK();
  const me = await getMe();
  if (!api || !api.data || !me || !me.userName) {
    return { ok: false, reason: 'nosdk', best: null };
  }

  const payload = {
    userName: safeUserName(me.userName),
    nickname: me.nickname.slice(0, 40),
    avatar: (me.avatar || '').slice(0, 512),
    levelsCleared: Math.max(0, Math.min(MAX_LEVELS, Number(run.levelsCleared) || 0)),
    adMs: Math.max(0, Math.round(Number(run.adMs) || 0)),
    fullClear: !!run.fullClear,
  };

  try {
    const existing = await api.data.find(OBJECT, {
      filter: { jsonPath: `$.userName == "${payload.userName}"` },
      order: [{ expression: 'created_at DESC' }],
      page: 1,
      pageSize: 20,
    });
    const rows = Array.isArray(existing) ? existing : [];
    const bestRow = rows.map(normalize).sort((a, b) => (isBetter(a, b) ? -1 : 1))[0];

    if (bestRow && !isBetter(payload, bestRow)) {
      return { ok: true, updated: false, best: bestRow };
    }
    if (rows.length > 0) {
      await api.data.update(OBJECT, rows[0].id, payload);
    } else {
      await api.data.create(OBJECT, payload);
    }
    return { ok: true, updated: true, best: normalize({ data: payload }) };
  } catch (error) {
    return {
      ok: false,
      reason: (error && error.code) || 'error',
      message: error && error.message,
      best: null,
    };
  }
}
