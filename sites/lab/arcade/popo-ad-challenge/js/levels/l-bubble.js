/** 水平仪：气泡保持在中心圈里 10 秒 */
import { el, clamp, ringTimer } from '../utils.js';
import { onOrientation, requestMotionPermission, sensorErrorText } from '../sensors.js';
import { splash, askPermission, hintPill, every } from './shared.js';

const TOTAL = 10000;
const LIMIT = 12;

export default {
  name: '水平仪',
  sub: '广告 10 秒 · 陀螺仪',
  sensor: true,
  tip: '保持气泡居中跳过广告',
  mount(root, api) {
    const ad = splash(root, api, { img: 4, dim: true, cta: false, capMs: 10000 });
    askPermission(root, api, {
      icon: '🫧',
      title: '需要运动传感器',
      desc: '本关用陀螺仪做一个水平仪。授权后保持手机不动，别让气泡跑出圈。',
      run: () => requestMotionPermission(),
    })
      .then(begin)
      .catch((err) => api.fail(sensorErrorText(err && err.code)));

    function begin() {
      const W = root.clientWidth;
      const H = root.clientHeight;
      const size = Math.min(W - 70, H * 0.5, 300);
      const bSize = Math.round(size * 0.14);
      const maxR = size / 2 - bSize / 2 - 6;
      // 偏到 LIMIT 度时气泡正好压在虚线圈上
      const targetR = size * 0.16;

      const vial = el('div');
      vial.style.cssText = `position:absolute;left:50%;top:52%;width:${size}px;height:${size}px;margin:-${size / 2}px 0 0 -${size / 2}px;z-index:6;
        border-radius:50%;animation:popIn .6s var(--ease-spring) both;
        background:radial-gradient(circle at 50% 40%,rgba(218,252,169,.38),rgba(116,250,203,.14) 55%,rgba(10,15,2,.6) 100%);
        box-shadow:inset 0 0 0 2px rgba(218,252,169,.5),inset 0 -20px 60px rgba(10,15,2,.6),0 30px 60px rgba(0,0,0,.5)`;
      vial.innerHTML = `
        <div style="position:absolute;left:50%;top:8%;bottom:8%;width:1px;background:rgba(255,255,255,.18)"></div>
        <div style="position:absolute;top:50%;left:8%;right:8%;height:1px;background:rgba(255,255,255,.18)"></div>
        <div class="target" style="position:absolute;inset:34%;border-radius:50%;border:2px dashed var(--lime);transition:border-color .2s ease"></div>
        <div class="decoy" style="position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px;border-radius:50%;background:#fff;box-shadow:0 0 12px #fff"></div>
        <div class="bubble" style="position:absolute;left:50%;top:50%;width:${bSize}px;height:${bSize}px;margin:-${bSize / 2}px;border-radius:50%;
          background:radial-gradient(circle at 32% 28%,#fff 0 18%,rgba(218,252,169,.95) 30%,rgba(184,237,110,.75) 70%,rgba(148,191,88,.9));
          box-shadow:0 0 20px rgba(184,237,110,.8),inset 0 -4px 8px rgba(47,76,7,.4)"></div>
        <div style="position:absolute;left:18%;top:10%;width:30%;height:16%;border-radius:50%;background:linear-gradient(rgba(255,255,255,.35),transparent);transform:rotate(-20deg)"></div>`;
      root.appendChild(vial);
      const bubble = vial.querySelector('.bubble');
      const decoy = vial.querySelector('.decoy');
      const target = vial.querySelector('.target');

      const timer = ringTimer(64, 5);
      ad.dock(timer.node);
      const hint = hintPill(root, '校准中，别动…');

      let base = null;
      const samples = [];
      let bx = 0;
      let by = 0;
      let overSince = 0;
      let finished = false;

      const off = onOrientation((e) => {
        if (typeof e.beta !== 'number' || typeof e.gamma !== 'number') {
          return;
        }
        if (!base) {
          samples.push([e.beta, e.gamma]);
          return;
        }
        const db = e.beta - base[0];
        const dg = e.gamma - base[1];
        bx = clamp(dg / LIMIT, -3, 3);
        by = clamp(db / LIMIT, -3, 3);
        const mag = Math.hypot(dg, db);
        if (mag > LIMIT) {
          overSince = overSince || performance.now();
          hint.set('气泡跑出圈了！', 'bad');
          target.style.borderColor = 'var(--danger)';
          if (performance.now() - overSince > 150) {
            finished = true;
            api.fail('气泡偏出去了');
          }
        } else {
          overSince = 0;
          target.style.borderColor = 'var(--lime)';
          hint.set(mag > LIMIT * 0.55 ? '快到边了，稳住' : '很稳，保持住', mag > LIMIT * 0.55 ? 'warn' : 'good');
        }
      });

      const calib = setTimeout(() => {
        const n = samples.length || 1;
        base = samples.reduce((a, s) => [a[0] + s[0] / n, a[1] + s[1] / n], [0, 0]);
        hint.set('稳住，别动', 'good');
      }, 700);

      const start = performance.now();
      let cur = { x: 0, y: 0 };
      const stop = every((now) => {
        if (finished) {
          return false;
        }
        // 气泡位置直接对应当前倾角，没有惯性，只做很轻的平滑去掉传感器抖动
        cur = { x: cur.x + (bx - cur.x) * 0.4, y: cur.y + (by - cur.y) * 0.4 };
        bubble.style.transform = `translate(${clamp(cur.x * targetR, -maxR, maxR)}px, ${clamp(cur.y * targetR, -maxR, maxR)}px)`;
        const t = now / 1000;
        decoy.style.transform = `translate(${Math.cos(t * 1.3) * size * 0.16}px, ${Math.sin(t * 1.7) * size * 0.16}px)`;
        const elapsed = now - start;
        timer.update(elapsed, TOTAL);
        if (elapsed >= TOTAL) {
          finished = true;
          api.win();
          return false;
        }
        return true;
      });

      api.onCleanup(() => {
        finished = true;
        stop();
        off();
        clearTimeout(calib);
      });
    }
  },
};
