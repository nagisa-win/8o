/** 真假关闭按钮：3 秒后出现两个一样的 ✕，和界面边距对齐的那个才是真的 */
import { pick, rand, ringTimer, vibrate } from '../utils.js';
import { splash, hintPill, closeBtn, every, guardTaps } from './shared.js';

const WAIT = 3000;
const SIZE = 30;
// 与跳过按钮、广告角标等组件一致的边距
const MARGIN = 14;
const GAP = 10;

/** 真按钮的候选位置，全部和界面其他组件对齐 */
function realSpots(W, H) {
  const midY = H / 2 - SIZE / 2;
  return {
    tl: { x: MARGIN, y: MARGIN },
    tr: { x: W - MARGIN - SIZE, y: MARGIN + 30 + GAP },
    ml: { x: MARGIN, y: midY },
    mr: { x: W - MARGIN - SIZE, y: midY },
    bl: { x: MARGIN, y: H - 44 - 54 - GAP - SIZE },
    br: { x: W - MARGIN - SIZE, y: H - MARGIN - SIZE },
  };
}

const overlaps = (p, r) => p.x < r.x + r.w && p.x + SIZE > r.x && p.y < r.y + r.h && p.y + SIZE > r.y;

/** 假按钮：要么几乎贴着屏幕边缘，要么在中心附近，位置随机 */
function fakeSpot(W, H, real) {
  const ctaW = Math.min(W * 0.84, 320);
  const blocked = [
    { x: W - 110, y: 0, w: 110, h: MARGIN + 34 },
    { x: 0, y: H - 40, w: 60, h: 40 },
    { x: (W - ctaW) / 2, y: H - 98, w: ctaW, h: 54 },
    { x: 0, y: H - 210, w: W, h: 92 },
  ];
  for (let i = 0; i < 80; i++) {
    let p;
    if (Math.random() < 0.6) {
      const inset = rand(0, 3);
      const side = pick(['top', 'left', 'right', 'bottom']);
      if (side === 'top') {
        p = { x: rand(0, W - SIZE), y: inset };
      } else if (side === 'bottom') {
        p = { x: rand(0, W - SIZE), y: H - SIZE - inset };
      } else {
        p = { x: side === 'left' ? inset : W - SIZE - inset, y: rand(0, H - SIZE) };
      }
    } else {
      p = { x: W / 2 - SIZE / 2 + rand(-W * 0.18, W * 0.18), y: H / 2 - SIZE / 2 + rand(-H * 0.15, H * 0.15) };
    }
    if (Math.hypot(p.x - real.x, p.y - real.y) >= 90 && !blocked.some((r) => overlaps(p, r))) {
      return p;
    }
  }
  return { x: W / 2 - SIZE / 2, y: H / 2 - SIZE / 2 };
}

function pickSpots(W, H) {
  const spots = realSpots(W, H);
  if (Math.random() < 0.3) {
    // 默认布局：真的在左下角，假的贴着右侧边缘、和右上角真按钮位置同高
    return { real: spots.bl, fake: { x: W - SIZE - 3, y: spots.tr.y } };
  }
  const real = spots[pick(Object.keys(spots))];
  return { real, fake: fakeSpot(W, H, real) };
}

export default {
  name: '真假关闭按钮',
  sub: '广告 30 秒',
  tip: '点击关闭按钮跳过广告',
  mount(root, api) {
    const ad = splash(root, api, { img: 2 });
    const timer = ringTimer(64, 5);
    const dock = ad.dock(timer.node);
    const hint = hintPill(root, '3 秒后可以关闭广告');
    const offGuard = guardTaps(root, api, '点到了广告画面', { allow: '.close-btn' });

    let done = false;
    const start = performance.now();
    const stop = every((now) => {
      const elapsed = now - start;
      timer.update(elapsed, WAIT);
      if (elapsed >= WAIT) {
        dock.style.opacity = '0';
        spawn();
        return false;
      }
      return true;
    });

    function spawn() {
      const { real, fake } = pickSpots(root.clientWidth, root.clientHeight);
      const realBtn = closeBtn();
      const fakeBtn = closeBtn();
      [[realBtn, real], [fakeBtn, fake]].forEach(([btn, p]) => {
        btn.style.left = `${p.x}px`;
        btn.style.top = `${p.y}px`;
      });

      realBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (!done) {
          done = true;
          vibrate(15);
          api.win();
        }
      });
      fakeBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (!done) {
          done = true;
          api.fail('点了假的关闭按钮');
        }
      });
      root.append(realBtn, fakeBtn);
      hint.set('可以关闭广告了');
    }

    api.onCleanup(() => {
      done = true;
      stop();
      offGuard();
    });
  },
};
