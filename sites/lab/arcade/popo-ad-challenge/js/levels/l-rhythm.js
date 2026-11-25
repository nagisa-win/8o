/** 节拍点击：收缩圆环压到目标环时点一下，连续 4 次，每拍快慢随机 */
import { el, clamp, rand, vibrate } from '../utils.js';
import { splash, bait, hintPill, every } from './shared.js';

const COUNT = 4;
const WINDOW = 120;

/** 随机节奏：每拍收缩时长 650~1700ms，且和上一拍至少差 300ms，避免出现规律 */
function randomBeats() {
  const beats = [];
  while (beats.length < COUNT) {
    const d = Math.round(rand(650, 1700));
    if (!beats.length || Math.abs(d - beats[beats.length - 1]) >= 300) {
      beats.push(d);
    }
  }
  return beats;
}
const START_SCALE = 2.6;

export default {
  name: '节拍点击',
  sub: '广告 30 秒',
  tip: '跟着节拍点击屏幕跳过广告',
  mount(root, api) {
    splash(root, api, { img: 3, copy: false, cta: false });
    bait(root, api, { text: '自动跳过广告', reason: '没有自动跳过这回事', bottom: '18%', ico: '⏩' });
    const hint = hintPill(root, '准备…');

    const H = root.clientHeight;
    const cy = H * 0.46;
    const box = el('div');
    box.style.cssText = `position:absolute;left:50%;top:${cy}px;width:150px;height:150px;margin:-75px 0 0 -75px;z-index:8;pointer-events:none`;
    box.innerHTML = `
      <div class="glow" style="position:absolute;inset:-30px;border-radius:50%;background:radial-gradient(circle,rgba(184,237,110,.55),transparent 65%);opacity:0"></div>
      <div style="position:absolute;inset:0;border-radius:50%;border:3px dashed var(--ink);box-shadow:0 0 0 6px rgba(255,255,255,.5)"></div>
      <div class="rh-ring" style="position:absolute;inset:0;border-radius:50%;border:4px solid var(--lime);box-shadow:0 0 24px var(--lime);background:none;transform:scale(${START_SCALE})"></div>
      <div class="dots" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:8px"></div>`;
    root.appendChild(box);
    const ring = box.querySelector('.rh-ring');
    const glow = box.querySelector('.glow');
    const dots = [...Array(COUNT)].map(() => {
      const d = el('i');
      d.style.cssText = 'width:12px;height:12px;border-radius:50%;background:rgba(10,15,2,.35);transition:background .2s ease,transform .3s var(--ease-spring)';
      box.querySelector('.dots').appendChild(d);
      return d;
    });

    const BEATS = randomBeats();
    let beat = 0;
    let beatStart = 0;
    let active = false;
    let finished = false;

    const startBeat = () => {
      ring.style.transform = `scale(${START_SCALE})`;
      beatStart = performance.now();
      active = true;
      hint.set(`第 ${beat + 1} / ${COUNT} 拍`);
    };

    const stop = every((now) => {
      if (finished) {
        return false;
      }
      if (active) {
        const t = now - beatStart;
        const p = clamp(t / BEATS[beat], 0, 1.2);
        ring.style.transform = `scale(${(START_SCALE - (START_SCALE - 1) * p).toFixed(3)})`;
        if (t > BEATS[beat] + WINDOW) {
          // 没跟上只重来这一拍，不判负，这样放着不管也能等广告走完
          active = false;
          hint.set('没跟上，重来', 'warn');
          setTimeout(() => {
            if (!finished && !active) {
              startBeat();
            }
          }, 420);
        }
      }
      return true;
    });

    const onTap = (e) => {
      if (finished || e.target.closest('.sp-skip,.bait')) {
        return;
      }
      if (!active) {
        finished = true;
        api.fail('还没到拍子');
        return;
      }
      const diff = performance.now() - beatStart - BEATS[beat];
      if (Math.abs(diff) > WINDOW) {
        finished = true;
        vibrate([20, 30, 20]);
        api.fail(diff < 0 ? '点早了' : '点晚了');
        return;
      }
      active = false;
      vibrate(12);
      dots[beat].style.background = 'var(--ink)';
      dots[beat].style.transform = 'scale(1.3)';
      glow.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
      ring.animate([{ boxShadow: '0 0 60px var(--lime)' }, { boxShadow: '0 0 24px var(--lime)' }], { duration: 300 });
      beat += 1;
      hint.set(Math.abs(diff) < 50 ? '完美！' : '不错', 'good');
      if (beat >= BEATS.length) {
        finished = true;
        setTimeout(() => api.win(), 200);
        return;
      }
      // 拍与拍之间的停顿也随机
      setTimeout(() => {
        if (!finished) {
          startBeat();
        }
      }, rand(180, 950));
    };
    root.addEventListener('pointerdown', onTap, true);
    const arm = setTimeout(startBeat, rand(700, 1400));

    api.onCleanup(() => {
      finished = true;
      stop();
      clearTimeout(arm);
      root.removeEventListener('pointerdown', onTap, true);
    });
  },
};
