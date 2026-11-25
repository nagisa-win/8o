/** S 形滑动：手指沿 S 形轨道从底部滑到顶部；全程手机不能晃、朝向偏离不能超过 5° */
import { el, vibrate } from '../utils.js';
import { onOrientation, onMotion, requestMotionPermission, sensorErrorText, readHeading } from '../sensors.js';
import { splash, askPermission, bait, hintPill } from './shared.js';

const HEADING_LIMIT = 5;
// 去掉重力后的加速度（m/s²）超过这个值算晃动
const SHAKE_LIMIT = 3;
// 手指离 S 形中线的最大距离（px）
const PATH_TOL = 30;
const CALIB_MS = 1000;
const SAMPLES = 240;

/** 生成 S 形轨道的采样点：t=0 在底部，t=1 在顶部 */
function buildPath(W, H) {
  const cx = W / 2;
  const top = H * 0.27;
  const bottom = H * 0.83;
  const amp = Math.min(W * 0.27, 110);
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    pts.push({ x: cx - amp * Math.sin(2 * Math.PI * t), y: bottom - (bottom - top) * t });
  }
  return pts;
}

/** 在 from 附近一段范围内找离 p 最近的采样点，避免手指跨过 S 的两道弯直接跳到后段 */
function nearest(pts, p, from) {
  let best = from;
  let bestD = Infinity;
  const end = Math.min(pts.length - 1, from + 40);
  for (let i = Math.max(0, from - 12); i <= end; i++) {
    const d = Math.hypot(pts[i].x - p.x, pts[i].y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { i: best, d: bestD };
}

export default {
  name: 'S 形滑动',
  sub: '广告 30 秒 · 触屏 + 加速度计 + 指南针',
  sensor: true,
  tip: '拿稳手机沿 S 形滑到顶跳过广告',
  mount(root, api) {
    // 剩余时间显示在右上角跳过按钮里，30 秒兜底由外层统一处理
    splash(root, api, { img: 1, dim: true, cta: false });
    askPermission(root, api, {
      icon: '〰️',
      title: '需要运动传感器 + 指南针',
      desc: `本关一边滑一边检测手机姿态。手指沿 S 形轨道滑到顶，手机不能晃，朝向偏离不能超过 ${HEADING_LIMIT}°。`,
      run: () => requestMotionPermission(),
    })
      .then(begin)
      .catch((err) => api.fail(sensorErrorText(err && err.code)));

    function begin() {
      const W = root.clientWidth;
      const H = root.clientHeight;
      const pts = buildPath(W, H);
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:6;pointer-events:none;overflow:visible';
      svg.innerHTML = `
        <path d="${d}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="${PATH_TOL * 2}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${d}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-dasharray="5 8" stroke-linecap="round"/>
        <path class="done" d="${d}" fill="none" stroke="var(--lime)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"
          style="filter:drop-shadow(0 0 8px var(--lime))"/>
        <circle cx="${pts[SAMPLES].x}" cy="${pts[SAMPLES].y}" r="16" fill="none" stroke="var(--lime)" stroke-width="2.5" stroke-dasharray="4 4"/>`;
      root.appendChild(svg);
      const donePath = svg.querySelector('.done');
      const total = donePath.getTotalLength();
      donePath.style.strokeDasharray = `${total}`;
      donePath.style.strokeDashoffset = `${total}`;

      const knob = el('div', 'ss-knob');
      knob.style.cssText = `position:absolute;left:0;top:0;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;z-index:9;
        display:flex;align-items:center;justify-content:center;background:var(--lime);color:var(--ink);font-size:20px;font-weight:900;
        box-shadow:0 0 0 6px rgba(184,237,110,.25),0 12px 30px rgba(0,0,0,.35);opacity:.45;transition:opacity .3s ease`;
      knob.textContent = 'S';
      root.appendChild(knob);

      const status = el('div', 'glass');
      status.style.cssText += ';position:absolute;left:50%;top:136px;transform:translateX(-50%);z-index:9;display:flex;gap:14px;padding:8px 14px;border-radius:999px;font-size:12px;white-space:nowrap';
      status.innerHTML = '<span class="sh num">晃动 0.0</span><span class="hd num">偏差 0°</span>';
      root.appendChild(status);
      const shNode = status.querySelector('.sh');
      const hdNode = status.querySelector('.hd');

      bait(root, api, { text: '一键滑完', reason: '没有一键滑完这种事', bottom: '4%', ico: '✨' });
      const hint = hintPill(root, '拿稳手机，校准中…');

      let idx = 0;
      let ready = false;
      let dragging = false;
      let finished = false;
      let base = null;
      const samples = [];
      let headOver = 0;
      let shakeOver = 0;
      let lastG = null;

      // 用 left/top 定位，transform 留给呼吸动画，两者不会互相覆盖
      const place = (i) => {
        knob.style.left = `${pts[i].x}px`;
        knob.style.top = `${pts[i].y}px`;
        donePath.style.strokeDashoffset = String(total * (1 - i / SAMPLES));
      };
      place(0);

      const end = (ok, reason) => {
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

      const diff = (a, b) => ((a - b + 540) % 360) - 180;
      const offOri = onOrientation((e) => {
        const h = readHeading(e);
        if (h == null || finished) {
          return;
        }
        if (base == null) {
          samples.push(h);
          return;
        }
        const dev = Math.abs(diff(h, base));
        hdNode.textContent = `偏差 ${dev.toFixed(0)}°`;
        hdNode.style.color = dev > HEADING_LIMIT * 0.6 ? 'var(--yellow)' : '';
        if (dev > HEADING_LIMIT) {
          headOver = headOver || performance.now();
          if (performance.now() - headOver > 200) {
            end(false, `朝向偏了 ${dev.toFixed(0)}°`);
          }
        } else {
          headOver = 0;
        }
      });

      const offMotion = onMotion((e) => {
        if (finished || !ready) {
          return;
        }
        let mag = null;
        const a = e.acceleration;
        if (a && a.x != null) {
          mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
        } else {
          // 没有去重力的读数时，用含重力读数的变化量近似
          const g = e.accelerationIncludingGravity;
          if (!g || g.x == null) {
            return;
          }
          if (lastG) {
            mag = Math.hypot(g.x - lastG.x, g.y - lastG.y, g.z - lastG.z);
          }
          lastG = { x: g.x, y: g.y, z: g.z };
        }
        if (mag == null) {
          return;
        }
        shNode.textContent = `晃动 ${mag.toFixed(1)}`;
        shNode.style.color = mag > SHAKE_LIMIT * 0.6 ? 'var(--yellow)' : '';
        if (mag > SHAKE_LIMIT) {
          shakeOver = shakeOver || performance.now();
          if (performance.now() - shakeOver > 120) {
            end(false, '手机晃得太厉害了');
          }
        } else {
          shakeOver = 0;
        }
      });

      const calib = setTimeout(() => {
        if (samples.length) {
          const ref = samples[0];
          base = (ref + samples.reduce((acc, s) => acc + diff(s, ref), 0) / samples.length + 360) % 360;
        }
        ready = true;
        knob.style.opacity = '1';
        knob.style.animation = 'breathe 1.4s ease-in-out infinite';
        hint.set('按住 S，沿轨道滑到顶', 'good');
      }, CALIB_MS);

      const onDown = (e) => {
        if (finished || e.target.closest('.bait,.sp-skip')) {
          return;
        }
        if (!ready) {
          end(false, '还没校准好就动手了');
          return;
        }
        const k = pts[idx];
        if (Math.hypot(e.clientX - root.getBoundingClientRect().left - k.x, e.clientY - root.getBoundingClientRect().top - k.y) > 40) {
          end(false, '要从 S 滑块开始滑');
          return;
        }
        dragging = true;
        knob.style.animation = 'none';
      };
      const onMove = (e) => {
        if (!dragging || finished) {
          return;
        }
        const rect = root.getBoundingClientRect();
        const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const near = nearest(pts, p, idx);
        if (near.d > PATH_TOL) {
          end(false, '滑出 S 形轨道了');
          return;
        }
        if (near.i > idx) {
          idx = near.i;
          place(idx);
        }
        if (idx >= SAMPLES - 3) {
          end(true);
        }
      };
      const onUp = () => {
        if (!dragging || finished) {
          return;
        }
        // 中途松手不判负，滑块退回起点重来
        dragging = false;
        idx = 0;
        place(0);
        hint.set('松手了，从头再滑一次', 'warn');
      };

      root.addEventListener('pointerdown', onDown, true);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);

      api.onCleanup(() => {
        finished = true;
        offOri();
        offMotion();
        clearTimeout(calib);
        root.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      });
    }
  },
};
