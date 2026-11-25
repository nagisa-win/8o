/** 首页 */
import { el } from '../utils.js';
import { mascotSvg } from './mascot.js';
import { TOTAL } from '../levels/index.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { escapeHtml };

const chars = (text, from) => [...text].map((ch, i) => `<span style="animation-delay:${(from + i * 0.05).toFixed(2)}s">${ch}</span>`).join('');

export function renderHome(layer, { onStart, onBoard, mobile }) {
  const home = el('div', 'home', `
    <div class="blobs"><i></i><i></i><i></i></div>
    <div class="home-top">
      <img src="assets/popo-logo-white.png" alt="POPO">
      <span class="home-chip">${mobile ? `${TOTAL} 关 · 排位赛` : '桌面体验版 · 不计排名'}</span>
    </div>
    <div class="hero">
      <div class="hero-phone" style="background-image:url('images/ad-1.jpg')"></div>
      <div class="hero-hand">👆</div>
      ${mascotSvg('hero-mascot')}
    </div>
    <h1 class="home-title">${chars('开屏广告', 0.2)}<br>${chars('大', 0.4)}<em>${chars('挑战', 0.45)}</em></h1>
    <p class="home-sub">${TOTAL} 个以假乱真的开屏广告，每一关都有人想让你点错。<br>手一滑，广告就来了。</p>
    <div class="home-rules">
      <div class="rule"><i>💡</i><span>屏幕底部会告诉你<b>怎样跳过广告</b>，其他的别轻信。</span></div>
      <div class="rule"><i>⚠️</i><span>点错一下就会跳进广告，<b>本局结束</b>。</span></div>
      <div class="rule"><i>🏆</i><span>先比<b>通关数</b>，再比<b>看广告的时长</b>，越短越靠前。</span></div>
    </div>
    <div class="home-actions">
      <button class="btn" type="button" data-act="start">开始挑战</button>
      <button class="btn btn-ghost" type="button" data-act="board">排行榜</button>
    </div>
    <div class="home-user" id="home-user"></div>`);
  layer.appendChild(home);

  home.querySelector('[data-act="start"]').addEventListener('click', () => {
    // 安卓上进入全屏能多出浏览器工具栏的高度；不支持或被拒绝时忽略
    const docEl = document.documentElement;
    if (mobile && docEl.requestFullscreen && !document.fullscreenElement) {
      docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
    home.classList.add('leaving');
    setTimeout(() => {
      home.remove();
      onStart();
    }, 380);
  });
  home.querySelector('[data-act="board"]').addEventListener('click', onBoard);

  // 吉祥物眼睛跟着手指走
  const pupils = home.querySelectorAll('.pupil');
  const mascot = home.querySelector('.hero-mascot');
  const look = (e) => {
    const r = mascot.getBoundingClientRect();
    const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 160));
    const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 160));
    pupils.forEach((p) => {
      p.style.transform = `translate(${dx * 0.6}px, ${dy * 0.5}px)`;
    });
  };
  home.addEventListener('pointermove', look);
  home.addEventListener('pointerdown', look);

  return {
    node: home,
    setUser(me) {
      const node = home.querySelector('#home-user');
      if (!node) {
        return;
      }
      const build = document.querySelector('meta[name="build"]')?.content;
      const tag = build ? `<em style="font-style:normal;opacity:.5;margin-left:6px">v${build}</em>` : '';
      if (me) {
        const avatar = me.avatar && /^https?:/i.test(me.avatar) ? `<img src="${escapeHtml(me.avatar)}" alt="">` : '';
        node.innerHTML = `${avatar}<span>${escapeHtml(me.nickname)}，成绩会自动上榜${tag}</span>`;
      } else {
        node.innerHTML = `未连接泡泡平台，本次成绩不进排行榜${tag}`;
      }
    },
  };
}
