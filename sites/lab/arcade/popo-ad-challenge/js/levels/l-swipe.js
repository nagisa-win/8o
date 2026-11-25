/** 垂直上滑：从底部滑块垂直拖到圆边松手 */
import { el, ringTimer, vibrate } from '../utils.js';
import { splash, hintPill, every } from './shared.js';

const WAIT = 3000;
const MAX_ANGLE = 12;

export default {
  name: '垂直上滑',
  sub: '广告 30 秒',
  tip: '从底部垂直上滑跳过广告',
  mount(root, api) {
    const ad = splash(root, api, { img: 1, copy: false, cta: false });
    const timer = ringTimer(64, 5);
    const dock = ad.dock(timer.node);
    const hint = hintPill(root, '3 秒后可以上滑跳过');

    const W = root.clientWidth;
    const H = root.clientHeight;
    const cx = W / 2;
    const cy = H - 70;
    const R = Math.min(W * 0.36, H * 0.42);

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:7;pointer-events:none;overflow:visible';
    let spiral = '';
    for (let a = 0; a <= Math.PI * 7; a += 0.06) {
      const rr = (a / (Math.PI * 7)) * R;
      spiral += `${a === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
    }
    svg.innerHTML = `
      <defs><radialGradient id="sw-g"><stop offset="0" stop-color="rgba(10,15,2,.5)"/><stop offset="1" stop-color="rgba(10,15,2,.1)"/></radialGradient></defs>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#sw-g)"/>
      <circle class="edge" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2" stroke-dasharray="4 7"/>
      <g class="spin"><path d="${spiral}" fill="none" stroke="rgba(184,237,110,.75)" stroke-width="2" stroke-linecap="round"/></g>
      <g class="spin2"><path d="${spiral}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.2" transform="rotate(180 ${cx} ${cy})"/></g>
      <line class="trail" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="var(--lime)" stroke-width="4" stroke-linecap="round"/>`;
    root.appendChild(svg);
    const spinA = svg.querySelector('.spin');
    const spinB = svg.querySelector('.spin2');
    const edge = svg.querySelector('.edge');
    const trail = svg.querySelector('.trail');

    const knob = el('div', 'sw-knob');
    knob.style.cssText = `position:absolute;left:${cx - 30}px;top:${cy - 30}px;width:60px;height:60px;border-radius:50%;z-index:9;
      display:flex;align-items:center;justify-content:center;background:var(--lime);color:var(--ink);
      box-shadow:0 0 0 6px rgba(184,237,110,.25),0 12px 30px rgba(0,0,0,.35);opacity:.45;transition:opacity .3s ease`;
    knob.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l6-6 6 6"/></svg>';
    root.appendChild(knob);

    let enabled = false;
    let dragging = false;
    let finished = false;
    let startPt = null;
    let delta = { dx: 0, dy: 0 };

    const finish = (ok, reason) => {
      if (finished) {
        return;
      }
      finished = true;
      if (ok) {
        api.win();
      } else {
        vibrate([20, 30, 20]);
        api.fail(reason);
      }
    };

    const start = performance.now();
    let spin = 0;
    const stop = every((now) => {
      spin = (spin + 0.9) % 360;
      spinA.setAttribute('transform', `rotate(${spin} ${cx} ${cy})`);
      spinB.setAttribute('transform', `rotate(${-spin * 1.4} ${cx} ${cy})`);
      if (!enabled) {
        const elapsed = now - start;
        timer.update(elapsed, WAIT);
        if (elapsed >= WAIT) {
          enabled = true;
          knob.style.opacity = '1';
          knob.style.animation = 'breathe 1.4s ease-in-out infinite';
          dock.style.opacity = '0';
          hint.set('垂直向上拖到圆圈边缘', 'good');
        }
      }
      return !finished;
    });

    const angleOf = (dx, dy) => Math.abs((Math.atan2(dx, -dy) * 180) / Math.PI);

    const onDown = (e) => {
      if (finished) {
        return;
      }
      if (!enabled) {
        finish(false, '还没到时间就动手了');
        return;
      }
      if (!e.target.closest('.sw-knob')) {
        finish(false, '要从底部滑块开始滑');
        return;
      }
      dragging = true;
      startPt = { x: e.clientX, y: e.clientY };
      knob.style.animation = 'none';
    };
    const onMove = (e) => {
      if (!dragging) {
        return;
      }
      delta = { dx: e.clientX - startPt.x, dy: e.clientY - startPt.y };
      const dist = Math.hypot(delta.dx, delta.dy);
      const ang = angleOf(delta.dx, delta.dy);
      knob.style.transform = `translate(${delta.dx}px, ${delta.dy}px)`;
      trail.setAttribute('x2', String(cx + delta.dx));
      trail.setAttribute('y2', String(cy + delta.dy));
      const off = ang > MAX_ANGLE || delta.dy > 0;
      edge.setAttribute('stroke', off ? '#ff3366' : dist > R * 0.85 ? 'var(--lime)' : 'rgba(255,255,255,.85)');
      hint.set(`偏离 ${ang.toFixed(0)}° · 距离 ${Math.min(999, (dist / R) * 100).toFixed(0)}%`, off ? 'bad' : dist > R * 0.85 ? 'good' : '');
      if (dist > R * 1.18) {
        finish(false, '拖过头了');
      }
    };
    const onUp = () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      const dist = Math.hypot(delta.dx, delta.dy);
      const ang = angleOf(delta.dx, delta.dy);
      if (delta.dy >= 0) {
        finish(false, '方向错了');
      } else if (ang > MAX_ANGLE) {
        finish(false, `偏了 ${ang.toFixed(0)}°`);
      } else if (dist < R * 0.85) {
        finish(false, '没拖到圆圈边缘');
      } else if (dist > R * 1.18) {
        finish(false, '拖过头了');
      } else {
        finish(true);
      }
    };

    root.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    api.onCleanup(() => {
      finished = true;
      stop();
      root.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    });
  },
};
