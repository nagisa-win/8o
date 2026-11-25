/** 红绿灯：关闭按钮都是 ✕，只有底色不同；同屏最多两个，最多一个绿色 */
import { el, pick, rand, ringTimer, vibrate } from '../utils.js';
import { splash, hintPill, closeBtn, placeAt, ANCHORS, every, guardTaps } from './shared.js';

const WAIT = 3000;
const SIZE = 30;
const MAX_ON_SCREEN = 2;
const GREEN_RATE = 0.4;

export default {
  name: '红绿灯',
  sub: '广告 30 秒',
  tip: '点击绿色关闭按钮跳过广告',
  mount(root, api) {
    const ad = splash(root, api, { img: 2 });

    // 红绿交错的旋转花纹和波纹，干扰对颜色的判断
    const pattern = el('div');
    pattern.style.cssText = `position:absolute;inset:-40%;z-index:2;pointer-events:none;opacity:.5;mix-blend-mode:screen;
      background:repeating-conic-gradient(from 0deg at 50% 50%,rgba(255,0,64,.55) 0 8deg,transparent 8deg 15deg,rgba(116,250,120,.55) 15deg 23deg,transparent 23deg 30deg);
      animation:spin 16s linear infinite`;
    const waves = el('div');
    waves.style.cssText = `position:absolute;inset:-30%;z-index:2;pointer-events:none;opacity:.35;
      background:repeating-radial-gradient(circle at 50% 45%,rgba(255,0,64,.5) 0 6px,transparent 6px 22px,rgba(116,250,120,.5) 22px 28px,transparent 28px 44px);
      animation:spin 24s linear infinite reverse`;
    root.insertBefore(waves, root.children[1]);
    root.insertBefore(pattern, root.children[1]);

    const timer = ringTimer(64, 5);
    const dock = ad.dock(timer.node);
    const hint = hintPill(root, '3 秒后出现关闭按钮');
    const offGuard = guardTaps(root, api, '点到了广告画面', { allow: '.close-btn' });

    let done = false;
    const live = new Set();
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const remove = (item) => {
      if (!live.delete(item)) {
        return;
      }
      item.btn.classList.add('out');
      later(() => item.btn.remove(), 200);
    };

    const spawn = () => {
      if (done || live.size >= MAX_ON_SCREEN) {
        return;
      }
      const used = new Set([...live].map((it) => it.anchor));
      const anchor = pick(Object.keys(ANCHORS).filter((k) => !used.has(k)));
      // 屏幕上已经有绿色按钮时，新按钮只能是红色
      const hasGreen = [...live].some((it) => it.green);
      const green = !hasGreen && Math.random() < GREEN_RATE;

      const btn = closeBtn(green ? 'green' : 'red');
      placeAt(btn, anchor, SIZE);
      const item = { btn, anchor, green };
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (done) {
          return;
        }
        done = true;
        if (green) {
          vibrate(15);
          api.win();
        } else {
          api.fail('点了红色按钮');
        }
      });
      root.appendChild(btn);
      live.add(item);
      hint.set('看准颜色再点');
      later(() => remove(item), rand(1600, 2600));
    };

    // 两个按钮错开出现、各自消失，同屏数量在 1~2 个之间变化
    const loop = () => {
      if (done) {
        return;
      }
      spawn();
      later(loop, rand(700, 1300));
    };

    const start = performance.now();
    const stop = every((now) => {
      const elapsed = now - start;
      timer.update(elapsed, WAIT);
      if (elapsed >= WAIT) {
        dock.style.opacity = '0';
        loop();
        return false;
      }
      return true;
    });

    api.onCleanup(() => {
      done = true;
      stop();
      offGuard();
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    });
  },
};
