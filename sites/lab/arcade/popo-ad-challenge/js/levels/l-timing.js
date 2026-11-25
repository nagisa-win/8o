/** 计时挑战：开头 3 秒给出目标秒数，之后隐藏所有计时，凭感觉在目标 ±1 秒内点中间的跳过按钮 */
import { el, randInt, vibrate } from '../utils.js';
import { splash, hintPill } from './shared.js';

const INTRO_MS = 3000;
const TOLERANCE = 1000;

export default {
  name: '计时挑战',
  sub: '广告 30 秒 · 心算计时',
  tip: '在指定秒数点中间的跳过按钮跳过广告',
  mount(root, api) {
    // 这一关不显示跳过按钮的倒数，避免泄露时间
    splash(root, api, { img: 2, skip: false, cta: false });
    const hint = hintPill(root, '记住这个秒数');
    // 外层 HUD 上的广告计时也会泄露时间，这一关先藏起来
    const hudAd = document.getElementById('hud-ad-wrap');
    if (hudAd) {
      hudAd.style.visibility = 'hidden';
    }

    const target = randInt(3, 15);
    const card = el('div', 'glass');
    card.style.cssText += ';position:absolute;left:50%;top:44%;width:236px;margin-left:-118px;transform:translateY(-50%);padding:22px 18px;text-align:center;z-index:9;animation:popIn .6s var(--ease-spring) backwards';
    card.innerHTML = `
      <div style="font-size:12px;color:var(--t2);letter-spacing:1px">倒数结束后开始计时</div>
      <div style="margin:10px 0 6px;font-size:13px;color:var(--t2)">在第 <b class="num" style="font-size:52px;line-height:1;color:var(--lime);font-weight:900;vertical-align:-6px">${target}</b> 秒</div>
      <div style="font-size:13px;color:var(--t2)">点中间的跳过按钮（误差 ±1 秒）</div>
      <div class="intro num" style="margin-top:14px;font-size:12px;color:var(--yellow)">3 秒后开始</div>`;
    root.appendChild(card);
    const introNode = card.querySelector('.intro');

    const btn = el('div', 'tc-btn');
    btn.style.cssText = `position:absolute;left:50%;top:50%;width:132px;height:132px;margin:-66px 0 0 -66px;border-radius:50%;z-index:10;
      display:none;align-items:center;justify-content:center;flex-direction:column;gap:4px;background:var(--ink);color:var(--lime);
      font-size:18px;font-weight:800;box-shadow:0 0 0 8px rgba(184,237,110,.2),0 18px 40px rgba(0,0,0,.45);transition:transform .2s var(--ease-spring)`;
    btn.innerHTML = '<span>跳过</span><small style="font-size:11px;font-weight:500;color:var(--t2)">凭感觉点</small>';
    root.appendChild(btn);

    let phase = 'intro';
    let startAt = 0;
    let finished = false;
    const timers = [];

    // 开头倒数只显示在说明卡片上
    [1, 2].forEach((n) => {
      timers.push(setTimeout(() => {
        introNode.textContent = `${3 - n} 秒后开始`;
      }, n * 1000));
    });
    timers.push(setTimeout(() => {
      phase = 'run';
      startAt = performance.now();
      card.remove();
      btn.style.display = 'flex';
      hint.set('开始计时（时间已隐藏）', 'good');
      vibrate(20);
    }, INTRO_MS));

    const onDown = (e) => {
      if (finished) {
        return;
      }
      if (phase === 'intro') {
        finished = true;
        api.fail('还没开始计时就点了');
        return;
      }
      if (!e.target.closest('.tc-btn')) {
        finished = true;
        api.fail('点错位置了');
        return;
      }
      const sec = (performance.now() - startAt) / 1000;
      const off = sec - target;
      finished = true;
      if (Math.abs(off) * 1000 <= TOLERANCE) {
        vibrate(15);
        api.win();
      } else {
        api.fail(`你点在第 ${sec.toFixed(1)} 秒，${off < 0 ? '早' : '晚'}了 ${Math.abs(off).toFixed(1)} 秒`);
      }
    };
    root.addEventListener('pointerdown', onDown, true);

    api.onCleanup(() => {
      finished = true;
      timers.forEach((id) => clearTimeout(id));
      root.removeEventListener('pointerdown', onDown, true);
      if (hudAd) {
        hudAd.style.visibility = '';
      }
    });
  },
};
