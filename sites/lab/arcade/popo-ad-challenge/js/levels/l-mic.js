/** 麦克风静音：10 秒内音量不能突然变大 */
import { el, clamp, ringTimer } from '../utils.js';
import { requestMic, sensorErrorText } from '../sensors.js';
import { splash, askPermission, hintPill, every, guardTaps } from './shared.js';

const TOTAL = 10000;
const CALIB_MS = 1200;
const BARS = 28;

export default {
  name: '麦克风静音',
  sub: '广告 10 秒 · 麦克风',
  sensor: true,
  tip: '保持安静跳过广告',
  mount(root, api) {
    const ad = splash(root, api, { img: 1, dim: true, cta: false, capMs: 10000 });
    let mic = null;
    askPermission(root, api, {
      icon: '🎙️',
      title: '需要麦克风权限',
      desc: '本关读取环境音量。全程不要说话、不要拍桌子，安安静静待 10 秒。',
      run: () => requestMic(),
    })
      .then((m) => {
        mic = m;
        begin();
      })
      .catch((err) => api.fail(sensorErrorText(err && err.code)));
    api.onCleanup(() => {
      if (mic) {
        mic.stop();
      }
    });

    function begin() {
      const viz = el('div', 'glass');
      viz.style.cssText += ';position:absolute;left:50%;top:50%;width:min(86%,320px);margin-left:calc(min(86%,320px) / -2);transform:translateY(-50%);padding:20px 18px;z-index:6;animation:popIn .6s var(--ease-spring) backwards';
      viz.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px">
          <span class="label-sm">环境音量</span><b class="db num" style="font-size:22px;font-weight:800">--</b>
        </div>
        <div class="bars" style="position:relative;height:120px;display:flex;align-items:center;justify-content:space-between"></div>
        <div style="position:relative;height:0">
          <div class="limit" style="position:absolute;left:0;right:0;top:-104px;border-top:1.5px dashed rgba(255,0,64,.7)"></div>
        </div>
        <div class="label-sm" style="margin-top:12px;text-align:center">红线以上就会触发广告</div>`;
      root.appendChild(viz);
      const barsBox = viz.querySelector('.bars');
      const db = viz.querySelector('.db');
      const bars = [...Array(BARS)].map(() => {
        const b = el('i');
        b.style.cssText = 'display:block;width:5px;height:6px;border-radius:3px;background:var(--lime);transition:height .08s linear,background .2s ease';
        barsBox.appendChild(b);
        return b;
      });

      const lure = el('div', 'bait', '对着麦克风喊「跳过」可以加速');
      lure.dataset.ico = '📢';
      lure.style.bottom = '9%';
      lure.style.pointerEvents = 'none';
      root.appendChild(lure);

      const timer = ringTimer(64, 5);
      ad.dock(timer.node);
      const hint = hintPill(root, '正在校准环境音…');
      const offGuard = guardTaps(root, api, '别碰屏幕');

      const calib = [];
      let limit = 0.06;
      let overSince = 0;
      let finished = false;
      const history = new Array(BARS).fill(0);
      const start = performance.now();

      const stop = every((now) => {
        if (finished) {
          return false;
        }
        const rms = mic.read();
        const elapsed = now - start;
        if (elapsed < CALIB_MS) {
          calib.push(rms);
          const avg = calib.reduce((a, b) => a + b, 0) / calib.length;
          limit = Math.max(0.05, avg * 2.4);
        }
        history.push(rms);
        history.shift();
        bars.forEach((b, i) => {
          const level = clamp(history[i] / limit, 0, 1.4);
          b.style.height = `${6 + level * 80}px`;
          b.style.background = history[i] > limit ? 'var(--danger)' : level > 0.6 ? 'var(--yellow)' : 'var(--lime)';
        });
        db.textContent = `${Math.round(clamp(rms / limit, 0, 2) * 100)}%`;

        if (elapsed >= CALIB_MS && rms > limit) {
          overSince = overSince || now;
          hint.set('太吵了！', 'bad');
          if (now - overSince > 90) {
            finished = true;
            api.fail('音量突然变大了');
            return false;
          }
        } else if (elapsed >= CALIB_MS) {
          overSince = 0;
          hint.set('嘘……保持安静', 'good');
        }

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
        offGuard();
      });
    }
  },
};
