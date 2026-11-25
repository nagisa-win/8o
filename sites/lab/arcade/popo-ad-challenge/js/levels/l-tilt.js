/** 水平 + 旋转：手机端平，方位往任意方向转到 90°~180° 并保持 1 秒跳过；端不平就结束 */
import { el, clamp, ringTimer } from '../utils.js';
import { onOrientation, requestMotionPermission, sensorErrorText, readHeading } from '../sensors.js';
import { splash, askPermission, bait, hintPill, every } from './shared.js';

const TOTAL = 30000;
const FLAT_LIMIT = 16;
const GRACE = 1400;
const HOLD_MS = 1000;

export default {
  name: '水平 + 旋转',
  sub: '广告 30 秒 · 陀螺仪 + 指南针',
  sensor: true,
  tip: '端平手机转身到 90° 并保持跳过广告',
  mount(root, api) {
    const ad = splash(root, api, { img: 2, dim: true, cta: false });
    askPermission(root, api, {
      icon: '📐',
      title: '需要指南针 + 陀螺仪',
      desc: '本关同时读取手机姿态和方位。先把手机平放在手心，再慢慢转身。',
      run: () => requestMotionPermission(),
    })
      .then(begin)
      .catch((err) => api.fail(sensorErrorText(err && err.code)));

    function begin() {
      const size = 240;
      const panel = el('div');
      panel.style.cssText = `position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;margin:-${size / 2}px 0 0 -${size / 2}px;z-index:6;animation:popIn .6s var(--ease-spring) backwards`;
      panel.innerHTML = `
        <svg viewBox="0 0 240 240" style="position:absolute;inset:0;overflow:visible">
          <circle cx="120" cy="120" r="108" fill="rgba(10,15,2,.6)" stroke="rgba(255,255,255,.12)" stroke-width="14"/>
          <path d="M120 12 A108 108 0 0 1 228 120" fill="none" stroke="rgba(184,237,110,.25)" stroke-width="14"/>
          <path d="M228 120 A108 108 0 0 1 120 228" fill="none" stroke="rgba(184,237,110,.55)" stroke-width="14"/>
          <circle class="arc" cx="120" cy="120" r="108" fill="none" stroke="var(--lime)" stroke-width="14" stroke-linecap="round"
            stroke-dasharray="${2 * Math.PI * 108}" stroke-dashoffset="${2 * Math.PI * 108}" style="transform:rotate(-90deg);transform-origin:120px 120px;filter:drop-shadow(0 0 8px var(--lime))"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
          <div class="level" style="position:relative;width:56px;height:56px;border-radius:50%;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.3)">
            <i class="dot" style="position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px;border-radius:50%;background:var(--lime);box-shadow:0 0 10px var(--lime)"></i>
          </div>
          <b class="rot num" style="font-size:34px;line-height:1;font-weight:900">0°</b>
          <span class="flat" style="font-size:12px;line-height:1;color:var(--lime)">水平</span>
        </div>`;
      root.appendChild(panel);
      const arc = panel.querySelector('.arc');
      const dot = panel.querySelector('.dot');
      const rot = panel.querySelector('.rot');
      const flatTxt = panel.querySelector('.flat');
      const circ = 2 * Math.PI * 108;

      bait(root, api, { text: '点一下自动旋转', reason: '转身要靠你自己', bottom: '9%', ico: '🔄' });
      const timer = ringTimer(64, 5);
      ad.dock(timer.node);
      const hint = hintPill(root, '先把手机端平');

      let base = null;
      const samples = [];
      let flat = true;
      let notFlatSince = 0;
      let inRange = false;
      let holdStart = 0;
      let finished = false;
      const start = performance.now();
      const diff = (a, b) => ((a - b + 540) % 360) - 180;

      const off = onOrientation((e) => {
        if (finished) {
          return;
        }
        if (typeof e.beta === 'number' && typeof e.gamma === 'number') {
          const tilt = Math.hypot(e.beta, e.gamma);
          flat = tilt < FLAT_LIMIT;
          dot.style.transform = `translate(${clamp(e.gamma / FLAT_LIMIT, -1.4, 1.4) * 18}px, ${clamp(e.beta / FLAT_LIMIT, -1.4, 1.4) * 18}px)`;
          flatTxt.textContent = flat ? '水平' : '没端平';
          flatTxt.style.color = flat ? 'var(--lime)' : 'var(--danger)';
          if (!flat && performance.now() - start > GRACE) {
            notFlatSince = notFlatSince || performance.now();
            if (performance.now() - notFlatSince > 260) {
              finished = true;
              api.fail('手机离开水平面了');
              return;
            }
          } else {
            notFlatSince = 0;
          }
        }
        const h = readHeading(e);
        if (h == null) {
          return;
        }
        if (base == null) {
          samples.push(h);
          return;
        }
        // 带符号的方位差：往左转为负、往右转为正，进度条按实际方向填充
        const signed = diff(h, base);
        const d = Math.abs(signed);
        rot.textContent = `${Math.round(d)}°`;
        const frac = clamp(d / 360, 0, 0.5);
        arc.style.strokeDashoffset = String(circ * (1 - frac));
        // 往左转时把进度弧水平镜像，让它跟着实际方向走
        arc.style.transform = signed < 0 ? 'rotate(-90deg) scaleX(-1)' : 'rotate(-90deg)';
        inRange = d >= 90 && d <= 180 && flat;
      });
      const calib = setTimeout(() => {
        if (samples.length) {
          const ref = samples[0];
          base = (ref + samples.reduce((a, s) => a + diff(s, ref), 0) / samples.length + 360) % 360;
        } else {
          base = 0;
        }
        hint.set('端平后慢慢转身 90°');
      }, 1000);

      const stop = every((now) => {
        if (finished) {
          return false;
        }
        // 进入 90°~180° 且保持水平满 1 秒才算过关，中途退出就重新计时
        if (inRange) {
          holdStart = holdStart || now;
          const held = now - holdStart;
          hint.set(`保持住 ${((HOLD_MS - held) / 1000).toFixed(1)} 秒`, 'good');
          if (held >= HOLD_MS) {
            finished = true;
            hint.set('转到位了！', 'good');
            api.win();
            return false;
          }
        } else {
          if (holdStart) {
            hint.set('退出范围了，重新转', 'warn');
          }
          holdStart = 0;
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
