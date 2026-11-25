/** 稳定长按：按住中间按钮 3 秒，手指不能挪动 */
import { el, clamp } from '../utils.js';
import { splash, bait, hintPill, every, guardTaps } from './shared.js';

const HOLD_MS = 3000;
const MAX_MOVE = 12;

export default {
  name: '稳定长按',
  sub: '广告 30 秒',
  tip: '按住中间按钮 3 秒跳过广告',
  mount(root, api) {
    splash(root, api, { img: 3, copy: false });
    bait(root, api, { text: '点一下立即跳过', reason: '「立即跳过」是假的', bottom: '64%', ico: '⚡' });
    const hint = hintPill(root, '按住中间的按钮');

    const size = 168;
    const r = 76;
    const c = 2 * Math.PI * r;
    const wrap = el('div');
    wrap.style.cssText = `position:absolute;left:50%;top:56%;width:${size}px;height:${size}px;margin:-${size / 2}px 0 0 -${size / 2}px;z-index:9;animation:popIn .6s .3s var(--ease-spring) both`;
    wrap.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}" style="position:absolute;inset:0;transform:rotate(-90deg);overflow:visible">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="6"/>
        <circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--lime)" stroke-width="6"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" style="filter:drop-shadow(0 0 8px var(--lime))"/>
      </svg>
      <div class="hold-btn" data-allow style="position:absolute;inset:22px;border-radius:50%;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:4px;background:var(--ink);color:var(--lime);
        box-shadow:0 18px 40px rgba(10,15,2,.45),inset 0 0 0 1px rgba(184,237,110,.35);transition:transform .25s var(--ease-spring)">
        <b style="font-size:17px;line-height:1">按住跳过</b>
        <span class="num" style="font-size:12px;line-height:1;color:var(--t2)">3.0 秒</span>
      </div>
      <div class="pulse" style="position:absolute;inset:22px;border-radius:50%;pointer-events:none;animation:ripple 1.8s ease-out infinite"></div>`;
    root.appendChild(wrap);
    const fg = wrap.querySelector('.fg');
    const btn = wrap.querySelector('.hold-btn');
    const left = btn.querySelector('span');

    let holding = false;
    let holdStart = 0;
    let origin = null;

    const offGuard = guardTaps(root, api, '这里点一下就是广告落地页', { allow: '.hold-btn' });

    const onDown = (e) => {
      if (!e.target.closest('.hold-btn')) {
        return;
      }
      holding = true;
      holdStart = performance.now();
      origin = { x: e.clientX, y: e.clientY };
      btn.style.transform = 'scale(.94)';
      hint.set('按住别动…');
    };
    const onMove = (e) => {
      if (holding && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > MAX_MOVE) {
        holding = false;
        api.fail('手指挪动太多了');
      }
    };
    const onUp = () => {
      if (holding) {
        holding = false;
        api.fail('松手太早了');
      }
    };

    const stop = every((now) => {
      if (!holding) {
        return true;
      }
      const p = clamp((now - holdStart) / HOLD_MS, 0, 1);
      fg.style.strokeDashoffset = String(c * (1 - p));
      left.textContent = `${((1 - p) * HOLD_MS / 1000).toFixed(1)} 秒`;
      if (p > 0.6) {
        hint.set('马上就好，别松手', 'good');
      }
      if (p >= 1) {
        holding = false;
        api.win();
        return false;
      }
      return true;
    });

    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    api.onCleanup(() => {
      stop();
      offGuard();
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    });
  },
};
