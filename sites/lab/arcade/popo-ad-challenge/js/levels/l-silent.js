/** 静默十五秒：点右上角跳过，或者什么都不点等 15 秒；点别处就结束 */
import { el, rand, clamp, ringTimer, vibrate } from '../utils.js';
import { splash, every } from './shared.js';

const TOTAL = 30000;

export default {
  name: '静默十五秒',
  sub: '广告 30 秒',
  tip: '点右上角跳过，或等 30 秒跳过广告',
  mount(root, api) {
    let done = false;
    const win = () => {
      if (!done) {
        done = true;
        vibrate(15);
        api.win();
      }
    };
    const ad = splash(root, api, { img: 1, onSkip: win });
    const timer = ringTimer(64, 5);
    ad.dock(timer.node);

    // 水波纹诱饵：画在 canvas 上，看起来像「点这里」
    const canvas = el('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:8;pointer-events:none';
    root.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = root.clientWidth;
    const H = root.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const ripples = [];
    let lastSpawn = 0;
    const start = performance.now();

    const stop = every((now) => {
      if (now - lastSpawn > 520) {
        lastSpawn = now;
        ripples.push({ x: rand(W * 0.15, W * 0.85), y: rand(H * 0.18, H * 0.7), born: now, life: rand(1600, 2200) });
      }
      ctx.clearRect(0, 0, W, H);
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const t = (now - r.born) / r.life;
        if (t >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        // 中心的「手指」光点
        ctx.beginPath();
        ctx.arc(r.x, r.y, 7 * (1 - t) + 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(0.85 * (1 - t)).toFixed(3)})`;
        ctx.fill();
        for (let k = 0; k < 3; k++) {
          const tt = clamp(t - k * 0.18, 0, 1);
          if (tt <= 0) {
            continue;
          }
          const eased = 1 - Math.pow(1 - tt, 3);
          const radius = 8 + eased * 70;
          const alpha = (1 - tt) * 0.8;
          // 白圈外再描一圈深色，浅色素材上也看得清
          ctx.beginPath();
          ctx.arc(r.x, r.y, radius + 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(10,15,2,${(alpha * 0.35).toFixed(3)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          ctx.lineWidth = 2.4 * (1 - tt) + 0.8;
          ctx.stroke();
        }
      }

      const elapsed = now - start;
      timer.update(elapsed, TOTAL);
      if (elapsed >= TOTAL) {
        win();
        return false;
      }
      return true;
    });

    // 除了右上角跳过按钮，点网页任何地方都结束
    let armed = false;
    const arm = setTimeout(() => {
      armed = true;
    }, 600);
    const onDown = (e) => {
      if (!armed || done) {
        return;
      }
      if (e.target.closest('.sp-skip')) {
        return;
      }
      vibrate(30);
      api.fail('点到了广告画面');
    };
    window.addEventListener('pointerdown', onDown, true);

    api.onCleanup(() => {
      stop();
      clearTimeout(arm);
      window.removeEventListener('pointerdown', onDown, true);
    });
  },
};
