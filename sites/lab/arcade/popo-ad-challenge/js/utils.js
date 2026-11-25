export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 毫秒 -> 两位小数的秒数字符串 */
export const fmtSec = (ms) => (Math.max(0, ms) / 1000).toFixed(2);

export const isMobile = (() => {
  const ua = navigator.userAgent || '';
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|MicroMessenger/i.test(ua);
  const touch = (navigator.maxTouchPoints || 0) > 0;
  return mobileUA || (touch && /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
})();

export const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;

/** 两点间距离（米） */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * 环形计时器。数字和单位用绝对定位的 flex 容器居中，和圆环共用同一个盒子。
 * update(elapsed, total) 显示剩余秒数；setText() 可显示任意内容（如 ∞）。
 */
export function ringTimer(size = 64, stroke = 5, unit = '秒') {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const wrap = el('div', 'ring');
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;
  wrap.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}">
      <circle class="rg-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"></circle>
      <circle class="rg-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"
        stroke-dasharray="${c}" stroke-dashoffset="0"></circle>
    </svg>
    <div class="ring-label"><b style="font-size:${Math.round(size * 0.36)}px">0</b><span>${unit}</span></div>`;
  const fg = wrap.querySelector('.rg-fg');
  const label = wrap.querySelector('b');
  let lastText = '';

  const setText = (text) => {
    if (text === lastText) {
      return;
    }
    lastText = text;
    label.textContent = text;
    wrap.classList.remove('tick');
    void wrap.offsetWidth;
    wrap.classList.add('tick');
  };

  return {
    node: wrap,
    update(elapsed, total) {
      const p = clamp(elapsed / total, 0, 1);
      fg.style.strokeDashoffset = String(c * p);
      setText(String(Math.max(0, Math.ceil((total - elapsed) / 1000))));
    },
    progress(p) {
      fg.style.strokeDashoffset = String(c * (1 - clamp(p, 0, 1)));
    },
    setText,
    setColor(color) {
      wrap.style.setProperty('--ring-color', color);
    },
  };
}

/** 数字滚动到目标值 */
export function countUp(node, to, { from = 0, ms = 700, decimals = 0, suffix = '' } = {}) {
  const start = performance.now();
  const step = (now) => {
    const t = clamp((now - start) / ms, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = (from + (to - from) * eased).toFixed(decimals) + suffix;
    if (t < 1) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

const CONFETTI_COLORS = ['#b8ed6e', '#74facb', '#66d6ff', '#ffcbe9', '#f5eb66', '#ffffff'];

/** 品牌色彩纸，画在独立 canvas 上，结束后自动移除 */
export function confetti(host, { count = 90, originY = 0.45, ms = 1600 } = {}) {
  const canvas = el('canvas', 'fx-canvas');
  host.appendChild(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = host.clientWidth;
  const H = host.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const parts = Array.from({ length: count }, () => {
    const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const speed = rand(5, 13);
    return {
      x: W / 2,
      y: H * originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: rand(5, 10),
      h: rand(8, 14),
      rot: rand(0, Math.PI),
      vr: rand(-0.3, 0.3),
      color: pick(CONFETTI_COLORS),
      round: Math.random() < 0.3,
    };
  });

  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = clamp(1 - (t - ms * 0.6) / (ms * 0.4), 0, 1);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
      }
      ctx.restore();
    }
    if (t < ms) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}

export const ICONS = {
  close: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 3.5a1.5 1.5 0 0 1 3 0V10l.6-.1a1.5 1.5 0 0 1 1.9 1.1l.1-.1a1.5 1.5 0 0 1 2.4 1l.2-.1A1.5 1.5 0 0 1 19 13v3.2a5.8 5.8 0 0 1-5.8 5.8h-.9a5.8 5.8 0 0 1-4.6-2.3l-2.9-3.8a1.6 1.6 0 0 1 2.4-2.1L9 15.4z"/></svg>',
  shake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M3 9v6M21 9v6"/></svg>',
};

export function vibrate(ms) {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(ms);
    }
  } catch (_) {
    /* 部分浏览器禁止振动 */
  }
}
