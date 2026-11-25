/** 关卡之间共用的开屏广告外壳与交互零件 */
import { el, ICONS } from '../utils.js';
import { sensorErrorText } from '../sensors.js';

export const AD_IMAGE = (n) => `images/ad-${n}.jpg`;
/** 广告兜底时长，和 main.js 里的 AD_CAP 保持一致 */
export const AD_CAP = 30000;

export const AD_COPY = {
  1: { l1: '一句话', l2: '生成网页', sub: 'POPO · 说出想法，AI 帮你做出能分享的页面' },
  2: { l1: '写完就', l2: '上线', sub: 'POPO · 一键发布，链接马上能打开' },
  3: { l1: '发个链接', l2: '一起改', sub: 'POPO · 分享给同事，打开就能看、就能协作' },
  4: { l1: '不写后端', l2: '也能存数据', sub: 'POPO · 报名、投票、排行榜，数据帮你存好' },
};

/** 标题固定两行：第一行普通、第二行高亮，各自不换行 */
export function adTitle(copy) {
  return `<span class="t1">${copy.l1}</span><span class="t2">${copy.l2}</span>`;
}

/**
 * 搭一个开屏广告画面：素材 + 跳过按钮 + 「广告」角标 + 跳转按钮。
 * 跳过按钮和跳转按钮都是陷阱，点了直接失败。
 */
export function splash(root, api, {
  img = 1,
  dim = false,
  copy = true,
  skip = true,
  onSkip = null,
  capMs = AD_CAP,
  cta = { text: '点击跳转详情页或第三方应用' },
} = {}) {
  const creative = el('div', 'sp-creative');
  creative.style.backgroundImage = `url("${AD_IMAGE(img)}")`;
  root.appendChild(creative);
  root.appendChild(el('div', 'sp-light'));
  root.appendChild(el('div', 'sp-shade'));
  if (dim) {
    root.appendChild(el('div', 'sp-dim'));
  }

  if (copy && !dim) {
    const c = AD_COPY[img];
    root.appendChild(el('div', 'sp-copy', `<h2>${adTitle(c)}</h2><p>${c.sub}</p>`));
  }

  root.appendChild(el('div', 'sp-tag', '广告'));

  let skipNum = null;
  if (skip) {
    const skipNode = el('div', 'sp-skip', '跳过<span class="sp-skip-n num"><span>∞</span></span>');
    skipNum = skipNode.querySelector('.sp-skip-n');
    if (onSkip) {
      // 真实的跳过按钮：点它直接过关
      skipNode.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        onSkip();
      });
    } else {
      trap(skipNode, api, '「跳过」是假的，它是广告的一部分');
    }
    root.appendChild(skipNode);

    // 跳过按钮直接显示广告剩余秒数，看满 30 秒会自动过关
    if (api.onAdTick) {
      api.onAdTick((elapsed) => {
        const left = Math.max(0, Math.ceil((capMs - elapsed) / 1000));
        skipNum.querySelector('span').textContent = String(left);
        skipNum.style.setProperty('--p', String(Math.min(1, elapsed / capMs)));
      });
    }
  }

  let ctaNode = null;
  if (cta) {
    root.appendChild(el('div', 'sp-cta-ring'));
    ctaNode = el('div', 'sp-cta', `
      <span class="sp-cta-ico">${cta.icon || ICONS.hand}</span>
      <span class="sp-cta-txt">${cta.text}${cta.sub ? `<small>${cta.sub}</small>` : ''}</span>
      <span class="sp-cta-arrow">›</span>`);
    trap(ctaNode, api, '点进了广告详情页');
    root.appendChild(ctaNode);
  }

  return {
    cta: ctaNode,
    /** 更新跳过按钮里的数字与进度（0~1） */
    setSkip(text, progress = 0) {
      if (!skipNum) {
        return;
      }
      skipNum.querySelector('span').textContent = text;
      skipNum.style.setProperty('--p', String(progress));
    },
    /** 把计时器挂到画面顶部居中 */
    dock(node) {
      const wrap = el('div', 'dock-top');
      wrap.appendChild(node);
      root.appendChild(wrap);
      return wrap;
    },
  };
}

/** 每帧执行 fn(now)，fn 返回 false 时停止；返回停止函数 */
export function every(fn) {
  let on = true;
  let raf = 0;
  const frame = (now) => {
    if (!on) {
      return;
    }
    if (fn(now) === false) {
      on = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    on = false;
    cancelAnimationFrame(raf);
  };
}

/**
 * 点到 allow 以外的任何地方都算失败。delay 内的点击忽略，避免转场时误触。
 * 返回解除函数。
 */
export function guardTaps(target, api, reason, { delay = 600, allow = '' } = {}) {
  let armed = false;
  const timer = setTimeout(() => {
    armed = true;
  }, delay);
  const onDown = (e) => {
    if (!armed) {
      return;
    }
    if (allow && e.target.closest && e.target.closest(allow)) {
      return;
    }
    api.fail(reason);
  };
  target.addEventListener('pointerdown', onDown, true);
  return () => {
    clearTimeout(timer);
    target.removeEventListener('pointerdown', onDown, true);
  };
}

/** 诱饵：点了就失败 */
export function trap(node, api, reason) {
  node.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    api.fail(reason);
  });
  return node;
}

export function bait(root, api, { text, reason, bottom = '30%', ico }) {
  const node = el('div', 'bait', text);
  node.style.bottom = bottom;
  if (ico) {
    node.dataset.ico = ico;
  }
  trap(node, api, reason);
  root.appendChild(node);
  return node;
}

export function hintPill(root, text) {
  const node = el('div', 'hint-pill', text);
  root.appendChild(node);
  return {
    node,
    set(value, tone = '') {
      node.textContent = value;
      node.className = `hint-pill${tone ? ` ${tone}` : ''}`;
    },
  };
}

export function closeBtn(extra = '') {
  return el('div', `close-btn ${extra}`.trim(), ICONS.close);
}

export const ANCHORS = {
  tl: [0.1, 0.16],
  tc: [0.5, 0.2],
  tr: [0.9, 0.16],
  ml: [0.09, 0.48],
  mr: [0.91, 0.48],
  bl: [0.1, 0.72],
  bc: [0.5, 0.62],
  br: [0.9, 0.72],
};

export function placeAt(node, anchor, size = 30) {
  const [x, y] = ANCHORS[anchor] || ANCHORS.tc;
  node.style.left = `calc(${x * 100}% - ${size / 2}px)`;
  node.style.top = `calc(${y * 100}% - ${size / 2}px)`;
}

/**
 * 权限申请卡片。run() 成功则 resolve；失败允许重试一次，第二次失败 reject。
 */
export function askPermission(root, api, { icon, title, desc, action = '授权并开始', run, errorText = sensorErrorText }) {
  // 用户读说明、等系统弹窗的时间不算看广告
  api.pauseClock();
  return new Promise((resolve, reject) => {
    const card = el('div', 'overlay-card', `
      <div>
        <div class="oc-ico">${icon}</div>
        <h3>${title}</h3>
        <p>${desc}</p>
        <button class="btn" type="button" data-allow>${action}</button>
        <div class="oc-warn"></div>
      </div>`);
    root.appendChild(card);
    card.addEventListener('pointerdown', (e) => e.stopPropagation());

    const btn = card.querySelector('button');
    const warn = card.querySelector('.oc-warn');
    let attempts = 0;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.disabled) {
        return;
      }
      btn.disabled = true;
      warn.textContent = '正在请求权限…';
      try {
        const value = await run();
        card.style.animation = 'fadeOut .25s ease both';
        setTimeout(() => card.remove(), 240);
        api.resumeClock();
        resolve(value);
      } catch (error) {
        attempts += 1;
        if (attempts >= 2) {
          warn.textContent = `${errorText(error && error.code)}，本关判定失败`;
          setTimeout(() => {
            card.remove();
            // 授权失败也要恢复广告计时：有的关卡拿不到权限不判负，要继续算广告时长
            api.resumeClock();
            reject(error);
          }, 900);
          return;
        }
        btn.disabled = false;
        btn.textContent = '重试授权';
        warn.textContent = `${errorText(error && error.code)}，还能再试一次`;
      }
    });
  });
}
