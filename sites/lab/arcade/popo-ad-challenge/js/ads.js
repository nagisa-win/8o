/** 假广告：点错后弹出的「跳转」与 POPO 广告落地页 */
import { el, pick, ICONS } from './utils.js';
import { AD_IMAGE, AD_COPY, adTitle } from './levels/shared.js';

const CARDS = [
  { img: 1, tags: ['AI 生成', '零代码', '一键分享'] },
  { img: 2, tags: ['秒级上线', '版本可回滚', '专属链接'] },
  { img: 3, tags: ['多人协作', '如流分享', '权限可控'] },
  { img: 4, tags: ['数据存储', '排行榜', '无需后端'] },
];

/** 模拟误触后「正在打开第三方应用」的底部弹层 */
export function jumpSheet(layer) {
  return new Promise((resolve) => {
    const node = el('div', 'jump', `
      <div class="jump-sheet">
        <div class="jump-ico"><img src="assets/popo-icon.svg" alt=""></div>
        <div class="jump-title">即将打开「POPO」</div>
        <div class="jump-sub"><i></i>正在跳转第三方页面…</div>
        <div class="jump-bar"><b></b></div>
      </div>`);
    layer.appendChild(node);
    setTimeout(() => {
      resolve();
      node.style.animation = 'fadeOut .2s ease both';
      setTimeout(() => node.remove(), 200);
    }, 1000);
  });
}

/** 展示广告落地页，点右上角 ✕ 关闭后 resolve；这一页不计入广告时长 */
export function showAd(layer) {
  return new Promise((resolve) => {
    const card = pick(CARDS);
    const copy = AD_COPY[card.img];
    const screen = el('div', 'ad-screen', `
      <div class="sp-creative" style="background-image:url('${AD_IMAGE(card.img)}')"></div>
      <div class="sp-light"></div>
      <div class="ad-top">
        <span class="ad-chip">广告</span>
        <button class="close-btn" type="button" aria-label="关闭广告">${ICONS.close}</button>
      </div>
      <div class="ad-headline"><h2>${adTitle(copy)}</h2><p>${copy.sub}</p></div>
      <div class="ad-card">
        <div class="ad-app">
          <div class="ad-app-ico"><img src="assets/popo-icon.svg" alt=""></div>
          <div class="ad-app-meta">
            <b>POPO</b>
            <span>把想法变成能分享的网页</span>
            <div class="ad-stars">★★★★★<small>4.9 · 内部好评</small></div>
          </div>
        </div>
        <div class="ad-tags">${card.tags.map((t) => `<span>${t}</span>`).join('')}</div>
        <a class="ad-go" href="https://8o.nz/" target="_blank" rel="noopener">逛逛 8o.nz</a>
      </div>`);
    layer.appendChild(screen);

    const closeBtn = screen.querySelector('.close-btn');
    let closed = false;

    closeBtn.addEventListener('click', () => {
      if (closed) {
        return;
      }
      closed = true;
      screen.classList.add('out');
      setTimeout(() => screen.remove(), 300);
      resolve();
    });

    setTimeout(() => closeBtn.classList.add('show'), 1800);
  });
}
