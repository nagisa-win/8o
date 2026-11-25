/** 摇一摇：15 秒内把进度摇满 */
import { el, ringTimer, vibrate, ICONS } from '../utils.js';
import { onMotion, requestMotionPermission, sensorErrorText } from '../sensors.js';
import { splash, askPermission, bait, hintPill, every, guardTaps } from './shared.js';

const TOTAL = 30000;
const DECAY = 5.5;
const GAIN = 8.5;

export default {
  name: '摇一摇',
  sub: '广告 30 秒 · 加速度计',
  sensor: true,
  tip: '摇一摇跳过广告',
  mount(root, api) {
    const ad = splash(root, api, { img: 1, dim: true, cta: false });
    askPermission(root, api, {
      icon: '📳',
      title: '需要加速度传感器',
      desc: '本关检测摇动。授权后握紧手机用力摇，把进度摇满。',
      run: () => requestMotionPermission(),
    })
      .then(begin)
      .catch((err) => api.fail(sensorErrorText(err && err.code)));

    function begin() {
      const size = 200;
      const r = 88;
      const c = 2 * Math.PI * r;
      const meter = el('div');
      meter.style.cssText = `position:absolute;left:50%;top:48%;width:${size}px;height:${size}px;margin:-${size / 2}px 0 0 -${size / 2}px;z-index:6;animation:popIn .6s var(--ease-spring) both`;
      meter.innerHTML = `
        <svg viewBox="0 0 ${size} ${size}" style="position:absolute;inset:0;transform:rotate(-90deg);overflow:visible">
          <circle cx="100" cy="100" r="${r}" fill="rgba(10,15,2,.5)" stroke="rgba(255,255,255,.12)" stroke-width="12"/>
          <circle class="fg" cx="100" cy="100" r="${r}" fill="none" stroke="var(--lime)" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${c}" stroke-dashoffset="${c}" style="filter:drop-shadow(0 0 10px var(--lime))"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
          <div class="phone" style="width:44px;height:44px;color:var(--lime)">${ICONS.shake}</div>
          <b class="pct num" style="font-size:30px;line-height:1;font-weight:900">0%</b>
          <span style="font-size:11px;line-height:1;color:var(--t3)">摇动进度</span>
        </div>`;
      root.appendChild(meter);
      const fg = meter.querySelector('.fg');
      const pct = meter.querySelector('.pct');
      const phone = meter.querySelector('.phone');

      bait(root, api, { text: '点击加速', reason: '「点击加速」是假的', bottom: '13%', ico: '🚀' });
      const timer = ringTimer(64, 5);
      ad.dock(timer.node);
      const hint = hintPill(root, '开始摇！');
      const offGuard = guardTaps(root, api, '别点屏幕，要摇手机', { allow: '.bait' });

      let progress = 0;
      let lastMag = null;
      let lastShake = 0;
      let finished = false;

      const off = onMotion((e) => {
        const a = e.accelerationIncludingGravity || e.acceleration;
        if (!a || a.x == null) {
          return;
        }
        const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
        const now = performance.now();
        if (!finished && lastMag != null && Math.abs(mag - lastMag) > 7 && now - lastShake > 100) {
          lastShake = now;
          progress = Math.min(100, progress + GAIN);
          vibrate(10);
          phone.animate([{ transform: 'rotate(-18deg)' }, { transform: 'rotate(18deg)' }, { transform: 'rotate(0)' }], { duration: 220 });
          // 在摇满的这一下就判定，避免下一帧先衰减到 99.9 而永远达不到 100
          if (progress >= 100) {
            finished = true;
            fg.style.strokeDashoffset = '0';
            pct.textContent = '100%';
            api.win();
            return;
          }
        }
        lastMag = mag;
      });

      const start = performance.now();
      let last = start;
      const stop = every((now) => {
        if (finished) {
          return false;
        }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        progress = Math.max(0, progress - DECAY * dt);
        fg.style.strokeDashoffset = String(c * (1 - progress / 100));
        // 向下取整，没真正摇满时不会显示 100%
        pct.textContent = `${Math.floor(progress)}%`;
        hint.set(progress > 70 ? '快满了，继续！' : progress > 0 ? '再用力一点' : '开始摇！', progress > 70 ? 'good' : '');
        const elapsed = now - start;
        timer.update(elapsed, TOTAL);
        if (elapsed >= TOTAL) {
          // 没摇满也算把广告看完了，正常过关
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
        offGuard();
      });
    }
  },
};
