/** 光滑圆盘：前后左右两个轴，让小球留在盘中心 */
import { el, clamp, ringTimer } from '../utils.js';
import { onOrientation, requestMotionPermission, sensorErrorText } from '../sensors.js';
import { splash, askPermission, bait, hintPill, every } from './shared.js';

const TOTAL = 10000;
const ACCEL = 150;
const FRICTION = 0.55;

export default {
  name: '光滑圆盘',
  sub: '广告 10 秒 · 陀螺仪',
  sensor: true,
  tip: '保持小球不掉落跳过广告',
  mount(root, api) {
    const ad = splash(root, api, { img: 2, dim: true, cta: false, capMs: 10000 });
    askPermission(root, api, {
      icon: '🟢',
      title: '需要三轴传感器',
      desc: '本关用陀螺仪模拟重力。盘面很滑，小球会一直往低处滚。',
      run: () => requestMotionPermission(),
    })
      .then(begin)
      .catch((err) => api.fail(sensorErrorText(err && err.code)));

    function begin() {
      const W = root.clientWidth;
      const H = root.clientHeight;
      const discR = Math.min(W * 0.4, H * 0.27, 160);
      const ballR = 16;
      const maxR = discR - ballR;

      const disc = el('div');
      disc.style.cssText = `position:absolute;left:50%;top:50%;width:${discR * 2}px;height:${discR * 2}px;margin:-${discR}px 0 0 -${discR}px;z-index:6;
        border-radius:50%;animation:popIn .6s var(--ease-spring) both;
        background:radial-gradient(circle at 50% 35%,#2a3518,#11170a 70%);
        box-shadow:inset 0 0 0 2px rgba(184,237,110,.45),inset 0 10px 40px rgba(218,252,169,.12),0 0 0 10px rgba(10,15,2,.6),0 30px 70px rgba(0,0,0,.6)`;
      disc.innerHTML = `
        <div style="position:absolute;inset:-14%;border-radius:50%;background:conic-gradient(from 0deg,transparent,rgba(184,237,110,.18),transparent 30%);animation:spin 6s linear infinite;pointer-events:none"></div>
        <div style="position:absolute;inset:32%;border-radius:50%;box-shadow:inset 0 0 0 1.5px rgba(184,237,110,.45)"></div>
        <div style="position:absolute;inset:14%;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)"></div>
        <div class="shadow" style="position:absolute;left:50%;top:50%;width:${ballR * 2}px;height:${ballR * 2}px;margin:-${ballR - 6}px 0 0 -${ballR - 4}px;border-radius:50%;background:rgba(0,0,0,.45);filter:blur(5px)"></div>
        <div class="ball" style="position:absolute;left:50%;top:50%;width:${ballR * 2}px;height:${ballR * 2}px;margin:-${ballR}px;border-radius:50%;
          background:radial-gradient(circle at 34% 30%,#fff 0 12%,#dafca9 30%,#b8ed6e 60%,#49730d);box-shadow:0 0 18px rgba(184,237,110,.7)"></div>`;
      root.appendChild(disc);
      const ball = disc.querySelector('.ball');
      const shadow = disc.querySelector('.shadow');

      bait(root, api, { text: '点击让小球自动回正', reason: '「自动回正」是广告编的', bottom: '10%', ico: '🎯' });
      const timer = ringTimer(64, 5);
      ad.dock(timer.node);
      const hint = hintPill(root, '校准中…');

      let base = null;
      const samples = [];
      let tiltX = 0;
      let tiltY = 0;
      let px = 0;
      let py = 0;
      let vx = 0;
      let vy = 0;
      let finished = false;

      const off = onOrientation((e) => {
        if (typeof e.beta !== 'number' || typeof e.gamma !== 'number') {
          return;
        }
        if (!base) {
          samples.push([e.beta, e.gamma]);
          return;
        }
        tiltX = clamp((e.gamma - base[1]) / 12, -2.4, 2.4);
        tiltY = clamp((e.beta - base[0]) / 12, -2.4, 2.4);
      });
      const calib = setTimeout(() => {
        const n = samples.length || 1;
        base = samples.reduce((a, s) => [a[0] + s[0] / n, a[1] + s[1] / n], [0, 0]);
        hint.set('把小球稳在中间');
      }, 700);

      const start = performance.now();
      let last = start;
      const stop = every((now) => {
        if (finished) {
          return false;
        }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (base) {
          // 倾斜只决定加速度，速度会一直保留；摩擦很小，反向倾斜只能慢慢把它刹住
          vx = (vx + tiltX * ACCEL * dt) * Math.exp(-FRICTION * dt);
          vy = (vy + tiltY * ACCEL * dt) * Math.exp(-FRICTION * dt);
          px += vx * dt;
          py += vy * dt;
          const dist = Math.hypot(px, py);
          ball.style.transform = `translate(${px}px, ${py}px)`;
          shadow.style.transform = `translate(${px}px, ${py}px)`;
          if (dist > maxR) {
            finished = true;
            ball.animate([{ transform: `translate(${px}px, ${py}px) scale(1)` }, { transform: `translate(${px * 1.3}px, ${py * 1.3}px) scale(.3)`, opacity: 0 }], { duration: 300, fill: 'forwards' });
            api.fail('小球掉出圆盘了');
            return false;
          }
          const near = dist / maxR;
          hint.set(near > 0.7 ? '要掉下去了！' : near > 0.4 ? '往回带一点' : '稳住了', near > 0.7 ? 'bad' : near > 0.4 ? 'warn' : 'good');
        }
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
