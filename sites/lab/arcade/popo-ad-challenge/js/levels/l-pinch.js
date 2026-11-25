/** 双指捏合：把广告卡片捏小到 40% 以下并保持 1 秒 */
import { el, clamp, ringTimer } from '../utils.js';
import { splash, hintPill, every } from './shared.js';

const TARGET = 0.4;
const HOLD_MS = 1000;

export default {
  name: '双指捏合',
  sub: '广告 30 秒 · 多点触控',
  touchOnly: true,
  tip: '双指捏小广告跳过广告',
  mount(root, api) {
    const ad = splash(root, api, { img: 4, dim: true, cta: false });
    const hint = hintPill(root, '用两根手指捏小卡片');
    const ring = ringTimer(64, 5, '保持');
    ring.setText('1.0');
    ring.progress(0);
    ad.dock(ring.node);

    const W = root.clientWidth;
    const cardW = Math.min(W * 0.68, 270);
    const card = el('div');
    card.style.cssText = `position:absolute;left:50%;top:54%;width:${cardW}px;height:${cardW * 1.5}px;margin:-${cardW * 0.75}px 0 0 -${cardW / 2}px;z-index:6;
      border-radius:22px;overflow:hidden;background:url("images/ad-4.jpg") center/cover;transform-origin:center;
      box-shadow:0 0 0 1px rgba(255,255,255,.25),0 30px 70px rgba(0,0,0,.6);animation:popIn .6s var(--ease-spring) backwards`;
    card.innerHTML = `
      <div style="position:absolute;left:0;right:0;bottom:0;padding:16px;background:linear-gradient(transparent,rgba(10,15,2,.85))">
        <b style="display:block;font-size:17px">POPO 数据存储</b>
        <span style="font-size:11px;color:var(--t2)">单指下滑即可关闭广告</span>
      </div>
      <div class="pct num" style="position:absolute;top:12px;right:12px;padding:3px 9px;border-radius:99px;font-size:12px;font-weight:700;background:rgba(10,15,2,.6)">100%</div>`;
    root.appendChild(card);
    const pct = card.querySelector('.pct');

    const pointers = new Map();
    let scale = 1;
    let startDist = 0;
    let startScale = 1;
    let holdStart = 0;
    let singleTimer = 0;
    let singleStart = null;
    let finished = false;

    const fail = (reason) => {
      if (!finished) {
        finished = true;
        api.fail(reason);
      }
    };
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const armSingle = (x, y) => {
      singleStart = { x, y };
      clearTimeout(singleTimer);
      singleTimer = setTimeout(() => {
        if (pointers.size === 1) {
          fail('单指操作不算数');
        }
      }, 280);
    };

    const onDown = (e) => {
      if (e.pointerType === 'mouse') {
        fail('鼠标捏不动广告');
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        armSingle(e.clientX, e.clientY);
      } else if (pointers.size === 2) {
        clearTimeout(singleTimer);
        startDist = spread();
        startScale = scale;
        hint.set('再捏小一点');
      } else {
        fail('只能用两根手指');
      }
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) {
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1 && singleStart && Math.hypot(e.clientX - singleStart.x, e.clientY - singleStart.y) > 12) {
        fail('单指滑动不算数');
        return;
      }
      if (pointers.size === 2 && startDist > 0) {
        scale = clamp((startScale * spread()) / startDist, 0.25, 1.3);
        card.style.transform = `scale(${scale.toFixed(3)})`;
        pct.textContent = `${Math.round(scale * 100)}%`;
        if (scale <= TARGET && !holdStart) {
          holdStart = performance.now();
          hint.set('保持住，别松手', 'good');
        } else if (scale > TARGET) {
          holdStart = 0;
        }
      }
    };
    const onUp = (e) => {
      pointers.delete(e.pointerId);
      startDist = 0;
      holdStart = 0;
      if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        armSingle(p.x, p.y);
        hint.set('松手了，重新捏', 'warn');
      }
    };

    const stop = every((now) => {
      if (finished) {
        return false;
      }
      const held = holdStart && pointers.size === 2 ? now - holdStart : 0;
      ring.progress(held / HOLD_MS);
      ring.setText(((HOLD_MS - held) / 1000).toFixed(1));
      if (held >= HOLD_MS) {
        finished = true;
        api.win();
        return false;
      }
      return true;
    });

    let armed = false;
    const arm = setTimeout(() => {
      armed = true;
    }, 600);
    const down = (e) => {
      if (armed) {
        onDown(e);
      }
    };
    root.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    api.onCleanup(() => {
      finished = true;
      stop();
      clearTimeout(arm);
      clearTimeout(singleTimer);
      root.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    });
  },
};
