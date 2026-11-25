/** 指南针定格：方位角 10 秒内偏移不超过 12° */
import { el, ringTimer } from '../utils.js';
import { onOrientation, requestMotionPermission, sensorErrorText, readHeading } from '../sensors.js';
import { splash, askPermission, bait, hintPill, every } from './shared.js';

const TOTAL = 10000;
const LIMIT = 12;

export default {
  name: '指南针定格',
  sub: '广告 10 秒 · 磁力计',
  sensor: true,
  tip: '保持朝向不变跳过广告',
  mount(root, api) {
    const ad = splash(root, api, { img: 3, dim: true, cta: false, capMs: 10000 });
    askPermission(root, api, {
      icon: '🧭',
      title: '需要指南针',
      desc: '本关读取手机的方位角。拿稳手机，别转身。',
      run: () => requestMotionPermission(),
    })
      .then(begin)
      .catch((err) => api.fail(sensorErrorText(err && err.code)));

    function begin() {
      const W = root.clientWidth;
      const H = root.clientHeight;
      const size = Math.min(W - 80, H * 0.46, 270);
      const ticks = [...Array(72)].map((_, i) => {
        const major = i % 6 === 0;
        return `<i style="position:absolute;left:50%;top:0;width:${major ? 2 : 1}px;height:${major ? 12 : 6}px;margin-left:-1px;
          background:rgba(255,255,255,${major ? 0.7 : 0.25});transform-origin:50% ${(size - 16) / 2}px;transform:rotate(${i * 5}deg)"></i>`;
      }).join('');
      const dial = el('div');
      dial.style.cssText = `position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;margin:-${size / 2}px 0 0 -${size / 2}px;z-index:6;animation:popIn .6s var(--ease-spring) both`;
      dial.innerHTML = `
        <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 40%,#222c15,#0a0f02 75%);box-shadow:inset 0 0 0 2px rgba(184,237,110,.35),0 30px 60px rgba(0,0,0,.55)"></div>
        <div style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(from -45deg,rgba(116,250,203,.4) 0 40deg,transparent 40deg);animation:spin 7s linear infinite"></div>
        <div class="face" style="position:absolute;inset:8px;border-radius:50%">${ticks}
          <b style="position:absolute;left:50%;top:18px;transform:translateX(-50%);color:var(--danger);font-size:14px">N</b>
          <b style="position:absolute;left:50%;bottom:18px;transform:translateX(-50%);color:var(--t2);font-size:12px">S</b>
          <b style="position:absolute;top:50%;left:18px;transform:translateY(-50%);color:var(--t2);font-size:12px">W</b>
          <b style="position:absolute;top:50%;right:18px;transform:translateY(-50%);color:var(--t2);font-size:12px">E</b>
        </div>
        <div style="position:absolute;left:50%;top:-6px;margin-left:-8px;border:8px solid transparent;border-top:12px solid var(--lime)"></div>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <b class="deg num" style="font-size:38px;line-height:1;font-weight:900">0°</b>
          <span class="delta num" style="margin-top:6px;font-size:12px;line-height:1;color:var(--t3)">偏移 0°</span>
        </div>`;
      root.appendChild(dial);
      const face = dial.querySelector('.face');
      const degNode = dial.querySelector('.deg');
      const deltaNode = dial.querySelector('.delta');

      bait(root, api, { text: '跟着绿区转，广告就关', reason: '跟着绿区转只会偏航', bottom: '9%', ico: '🌀' });
      const timer = ringTimer(64, 5);
      ad.dock(timer.node);
      const hint = hintPill(root, '拿稳手机…');

      let base = null;
      const samples = [];
      let overSince = 0;
      let finished = false;
      const diff = (a, b) => ((a - b + 540) % 360) - 180;

      const off = onOrientation((e) => {
        const h = readHeading(e);
        if (h == null || finished) {
          return;
        }
        face.style.transform = `rotate(${-h}deg)`;
        degNode.textContent = `${Math.round(h)}°`;
        if (base == null) {
          samples.push(h);
          return;
        }
        const d = Math.abs(diff(h, base));
        deltaNode.textContent = `偏移 ${d.toFixed(0)}°`;
        if (d > LIMIT) {
          overSince = overSince || performance.now();
          hint.set(`偏了 ${d.toFixed(0)}°！`, 'bad');
          if (performance.now() - overSince > 150) {
            finished = true;
            api.fail(`方位偏了 ${d.toFixed(0)}°`);
          }
        } else {
          overSince = 0;
          hint.set(d > LIMIT / 2 ? '快偏出去了' : '很稳，别动', d > LIMIT / 2 ? 'warn' : 'good');
        }
      });
      const calib = setTimeout(() => {
        // 用第一个样本做参照，把后续样本换算成相对差再取平均，避免 359°/1° 求平均出错
        if (samples.length) {
          const ref = samples[0];
          const avg = samples.reduce((a, s) => a + diff(s, ref), 0) / samples.length;
          base = (ref + avg + 360) % 360;
        } else {
          base = 0;
        }
      }, 900);

      const start = performance.now();
      const stop = every((now) => {
        if (finished) {
          return false;
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
