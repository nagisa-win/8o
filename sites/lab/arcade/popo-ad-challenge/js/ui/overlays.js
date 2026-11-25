/** 关卡转场：标题卡、通关、失败、桌面跳过 */
import { el, sleep, confetti, ICONS } from '../utils.js';
import { mascotSvg } from './mascot.js';
import { escapeHtml } from './home.js';

export async function titleCard(stage, level) {
  const node = el('div', 'titlecard', `
    <div class="tc-inner">
      <div class="tc-kicker">LEVEL</div>
      <div class="tc-no num">${String(level.n).padStart(2, '0')}</div>
      <div class="tc-name">${escapeHtml(level.name)}</div>
      <div class="tc-sub">${escapeHtml(level.sub || '')}</div>
    </div>
    ${mascotSvg('tc-mascot')}`);
  stage.appendChild(node);
  await sleep(1150);
  node.classList.add('out');
  await sleep(380);
  node.remove();
}

export async function clearFx(stage, cleared) {
  const node = el('div', 'clear-fx', `
    <div class="clear-stamp">${ICONS.check}<b>通关</b><span class="clear-plus num">+1 · ${cleared}</span></div>`);
  stage.appendChild(node);
  confetti(stage, { originY: 0.48 });
  await sleep(900);
  node.classList.add('out');
  await sleep(240);
  node.remove();
}

export async function failFx(stage) {
  stage.classList.remove('shake');
  void stage.offsetWidth;
  stage.classList.add('shake');
  const flash = el('div', 'fail-flash');
  stage.appendChild(flash);
  await sleep(720);
  flash.remove();
  stage.classList.remove('shake');
}

export async function skipCard(stage, level) {
  const node = el('div', 'overlay-card', `
    <div>
      <div class="oc-ico">🖥️</div>
      <h3>桌面端没有这个传感器</h3>
      <p>「${escapeHtml(level.name)}」需要${level.touchOnly ? '多点触控' : '手机传感器'}，已自动跳过。<br>本局只做体验，不计入排名。</p>
    </div>`);
  stage.appendChild(node);
  await sleep(1500);
  node.style.animation = 'fadeOut .25s ease both';
  await sleep(240);
  node.remove();
}
