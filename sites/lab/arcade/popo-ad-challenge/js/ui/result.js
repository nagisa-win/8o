/** 结算面板与排行榜 */
import { el, fmtSec, countUp } from '../utils.js';
import { fetchScores } from '../pop.js';
import { mascotSvg } from './mascot.js';
import { escapeHtml } from './home.js';

export function openSheet(layer, html) {
  const sheet = el('div', 'sheet', `<div class="sheet-card"><div class="sheet-grip"></div>${html}</div>`);
  layer.appendChild(sheet);
  const close = () => {
    sheet.classList.add('out');
    setTimeout(() => sheet.remove(), 250);
  };
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) {
      close();
    }
  });
  return { sheet, card: sheet.querySelector('.sheet-card'), close };
}

export function renderResult(layer, { perfect, desktop, cleared, total, adMs, note, onAgain, onBoard, onHome }) {
  const kicker = perfect ? 'ALL CLEAR' : desktop ? 'DESKTOP DEMO' : 'GAME OVER';
  const title = perfect ? '广告一个都没骗到你' : desktop ? '桌面体验到此结束' : '你点进了广告';
  const desc = perfect ? `${total} 关全通，手稳得像机器人` : desktop ? `传感器关卡已跳过，换手机打完整 ${total} 关` : `倒在第 ${cleared + 1} 关，再来一次？`;
  const { card, close } = openSheet(layer, `
    <div class="result-hero">
      ${mascotSvg('result-mascot')}
      <div class="result-kicker${perfect || desktop ? '' : ' bad'}">${kicker}</div>
      <h2 class="result-title">${title}</h2>
      <div class="result-desc">${desc}</div>
    </div>
    <div class="stat-grid">
      <div class="stat good"><div class="k">通关数</div><div class="v"><span class="c">0</span><small>/ ${total}</small></div></div>
      <div class="stat warn"><div class="k">看广告时长</div><div class="v"><span class="a">0.00</span><small>秒</small></div></div>
    </div>
    <div class="sheet-note" id="result-note">${note}</div>
    <div class="sheet-actions">
      <button class="btn" type="button" data-act="again">再来一次</button>
      <div class="row">
        <button class="btn btn-ghost" type="button" data-act="board">排行榜</button>
        <button class="btn btn-ghost" type="button" data-act="home">回首页</button>
      </div>
    </div>`);

  card.querySelector('.result-mascot').style.cssText = 'width:74px;height:74px;animation:popIn .6s .15s var(--ease-spring) both';
  countUp(card.querySelector('.c'), cleared, { ms: 700 });
  countUp(card.querySelector('.a'), adMs / 1000, { ms: 900, decimals: 2 });

  card.querySelector('[data-act="again"]').addEventListener('click', () => {
    close();
    onAgain();
  });
  card.querySelector('[data-act="board"]').addEventListener('click', onBoard);
  card.querySelector('[data-act="home"]').addEventListener('click', () => {
    close();
    onHome();
  });

  return {
    setNote(text) {
      card.querySelector('#result-note').textContent = text;
    },
  };
}

function avatar(rec) {
  if (rec.avatar && /^https?:/i.test(rec.avatar)) {
    return `<img class="av" src="${escapeHtml(rec.avatar)}" alt="">`;
  }
  return `<div class="av">${escapeHtml((rec.nickname || '?').slice(0, 1))}</div>`;
}

export async function openBoard(layer, { me, total }) {
  const { card } = openSheet(layer, `
    <div class="board-head"><h2>排行榜</h2><p>先比通关数，再比看广告的时长（越短越强）</p></div>
    <div id="board-body"><div class="board-list">${'<div class="skeleton"></div>'.repeat(5)}</div></div>`);
  const body = card.querySelector('#board-body');
  const res = await fetchScores();

  if (!res.ok || !res.list.length) {
    const msg = !res.ok
      ? res.reason === 'nosdk' ? '还没连上泡泡平台，暂时看不到排行榜。<br>发布到 POPO 后就能和同事一起排名。' : '榜单读取失败，稍后再试试。'
      : '还没有人上榜，<br>成为第一个通关的人吧。';
    body.innerHTML = `<div class="board-empty">${mascotSvg('')}${msg}</div>`;
    body.querySelector('svg').style.cssText = 'width:64px;height:64px;display:block;margin:0 auto 10px';
    return;
  }

  const myName = me ? me.userName : '';
  const score = (r) => `${r.levelsCleared}/${total} · ${fmtSec(r.adMs)}s`;
  const top = res.list.slice(0, 3);
  const podiumOrder = [top[1], top[0], top[2]];
  const podium = top.length >= 3
    ? `<div class="podium">${podiumOrder.map((r, i) => `
        <div class="podium-col">${avatar(r)}
          <div class="podium-name">${escapeHtml(r.nickname)}</div>
          <div class="podium-score num">${score(r)}</div>
          <div class="podium-block">${[2, 1, 3][i]}</div>
        </div>`).join('')}</div>`
    : '';
  const rest = top.length >= 3 ? res.list.slice(3) : res.list;
  const offset = top.length >= 3 ? 3 : 0;
  const myIndex = res.list.findIndex((r) => r.userName === myName);

  body.innerHTML = `
    ${myIndex >= 0 ? `<div class="board-me"><span>我的最好成绩 · <b>第 ${myIndex + 1} 名</b></span><span class="num">${score(res.list[myIndex])}</span></div>` : ''}
    ${podium}
    <div class="board-list">${rest.map((r, i) => `
      <div class="board-row${r.userName === myName ? ' me' : ''}" style="animation-delay:${Math.min(i, 12) * 0.03}s">
        <div class="board-rank">${i + 1 + offset}</div>
        <div class="board-user">${avatar(r)}<div class="board-name">${escapeHtml(r.nickname)}${r.userName === myName ? '<i>我</i>' : ''}</div></div>
        <div class="board-score"><b class="num">${r.levelsCleared}/${total}</b><span class="num">${fmtSec(r.adMs)}s</span></div>
      </div>`).join('')}</div>`;
}
