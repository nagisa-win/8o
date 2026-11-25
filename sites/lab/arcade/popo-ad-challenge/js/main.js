import { $, el, isMobile, sleep, vibrate, fmtSec } from './utils.js';
import { getMe, submitRun, waitForSDK } from './pop.js';
import { showAd, jumpSheet } from './ads.js';
import { LEVELS, TOTAL } from './levels/index.js';
import { renderHome } from './ui/home.js';
import { titleCard, clearFx, failFx, skipCard } from './ui/overlays.js';
import { renderResult, openBoard } from './ui/result.js';

const stage = $('#stage');
const uiLayer = $('#ui-layer');
const hud = $('#hud');
const brandbar = $('#brandbar');
const tipbar = $('#tipbar');
const tipText = $('#tip-text');

const state = {
  mobile: isMobile,
  eligible: isMobile,
  levelIndex: 0,
  cleared: 0,
  adMs: 0,
  me: null,
  token: 0,
};

let home = null;

// 每关的开屏广告从出现开始计时，跳过或误触时停止；授权弹窗期间暂停
const clock = { start: 0, running: false, levelMs: 0, ticks: [] };

// 广告兜底时长：不操作也会在 30 秒后自动过关
const AD_CAP = 30000;

function clockStart() {
  clock.start = performance.now();
  clock.running = true;
}

function clockStop() {
  if (!clock.running) {
    return;
  }
  const delta = performance.now() - clock.start;
  state.adMs += delta;
  clock.levelMs += delta;
  clock.running = false;
}

/** 本关已经看了多久广告（不含授权弹窗的时间） */
function levelElapsed() {
  return clock.levelMs + (clock.running ? performance.now() - clock.start : 0);
}

function liveAdMs() {
  return state.adMs + (clock.running ? performance.now() - clock.start : 0);
}

function tickHud() {
  $('#hud-ad').textContent = `${fmtSec(liveAdMs())}s`;
  requestAnimationFrame(tickHud);
}

function toast(text, kind = '') {
  const node = el('div', `toast ${kind}`, text);
  uiLayer.appendChild(node);
  setTimeout(() => node.classList.add('out'), 1300);
  setTimeout(() => node.remove(), 1560);
}

function bump(id) {
  const node = $(id);
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

function updateHud() {
  const level = LEVELS[state.levelIndex];
  $('#hud-total').textContent = `/${TOTAL}`;
  $('#hud-level').textContent = String(Math.min(state.levelIndex + 1, TOTAL));
  $('#hud-name').textContent = level ? level.name : '';
  $('#hud-cleared').textContent = String(state.cleared);
  $('#hud-progress').style.width = `${(state.cleared / TOTAL) * 100}%`;
}

function setChrome(visible) {
  [hud, brandbar, tipbar].forEach((node) => node.classList.toggle('is-hidden', !visible));
}

function showHome() {
  setChrome(false);
  stage.innerHTML = '';
  home = renderHome(uiLayer, {
    mobile: state.mobile,
    onStart: startRun,
    onBoard: () => openBoard(uiLayer, { me: state.me, total: TOTAL }),
  });
  home.setUser(state.me);
}

async function startRun() {
  const token = ++state.token;
  Object.assign(state, { cleared: 0, adMs: 0, levelIndex: 0, eligible: state.mobile });
  clock.running = false;
  stage.innerHTML = '';
  setChrome(true);
  updateHud();
  // 测试用：?lv=N 只对打开页面后的第一局生效，之后「再来一次」都从第 1 关开始
  const params = new URLSearchParams(location.search);
  const from = Math.max(1, Math.min(TOTAL, Number(params.get('lv')) || 1));
  if (params.has('lv')) {
    params.delete('lv');
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }
  if (from > 1) {
    state.eligible = false;
  }
  await goLevel(from - 1, token);
}

async function goLevel(index, token) {
  if (token !== state.token) {
    return;
  }
  if (index >= LEVELS.length) {
    finishRun(token);
    return;
  }
  const level = LEVELS[index];
  state.levelIndex = index;
  updateHud();
  tipText.textContent = level.tip;
  tipbar.classList.remove('flash');
  void tipbar.offsetWidth;
  tipbar.classList.add('flash');
  stage.innerHTML = '';

  if (!state.mobile && (level.sensor || level.touchOnly)) {
    state.eligible = false;
    await skipCard(stage, level);
    goLevel(index + 1, token);
    return;
  }

  await titleCard(stage, level);
  if (token === state.token) {
    mountLevel(level, token);
  }
}

function mountLevel(level, token) {
  const host = el('div', 'lv');
  stage.appendChild(host);
  let settled = false;
  const cleanups = [];
  const cleanup = () => {
    while (cleanups.length) {
      try {
        cleanups.pop()();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const api = {
    onCleanup: (fn) => cleanups.push(fn),
    pauseClock: clockStop,
    resumeClock: clockStart,
    onAdTick: (fn) => clock.ticks.push(fn),
    win: () => {
      if (settled) {
        return;
      }
      settled = true;
      clockStop();
      cleanup();
      onLevelClear(host, token);
    },
    fail: (reason) => {
      if (settled) {
        return;
      }
      settled = true;
      clockStop();
      cleanup();
      // 画面先保留，让失败动画落在当前关卡上
      host.style.pointerEvents = 'none';
      onLevelFail(host, reason, token);
    },
  };

  clock.levelMs = 0;
  clock.ticks = [];
  clockStart();

  // 兜底：看满 30 秒广告自动过关；同时把剩余时间推给关卡里的跳过按钮
  const capTimer = setInterval(() => {
    if (settled) {
      return;
    }
    const elapsed = levelElapsed();
    clock.ticks.forEach((fn) => {
      try {
        fn(elapsed, AD_CAP);
      } catch (err) {
        console.error(err);
      }
    });
    if (elapsed >= AD_CAP) {
      api.win();
    }
  }, 120);

  api.onCleanup(() => {
    clearInterval(capTimer);
    clock.ticks = [];
  });

  try {
    level.mount(host, api);
  } catch (err) {
    console.error(err);
    api.fail('关卡加载失败');
  }
}

async function onLevelClear(host, token) {
  if (token !== state.token) {
    return;
  }
  state.cleared += 1;
  updateHud();
  bump('#hud-cleared-wrap');
  vibrate(12);
  await clearFx(stage, state.cleared);
  host.remove();
  goLevel(state.levelIndex + 1, token);
}

async function onLevelFail(host, reason, token) {
  if (token !== state.token) {
    return;
  }
  vibrate([30, 40, 30]);
  if (reason) {
    toast(reason, 'bad');
  }
  await failFx(stage);
  await jumpSheet(uiLayer);
  host.remove();
  if (token !== state.token) {
    return;
  }
  bump('#hud-ad-wrap');
  await showAd(uiLayer);
  await sleep(200);
  finishRun(token);
}

function noteFor(submit) {
  if (!state.me) {
    return '没连上泡泡平台，这局成绩只显示在这里，不进排行榜。';
  }
  if (submit && submit.ok) {
    return submit.updated
      ? '已刷新你的最好成绩。榜单先比通关数，通关数相同再比看广告时长，越短越靠前。'
      : '这局没超过你的最好成绩，榜单只保留每人最好的一局。';
  }
  return '成绩上传失败了，稍后再来一局试试。';
}

async function finishRun(token) {
  if (token !== state.token) {
    return;
  }
  const { cleared, adMs, eligible } = state;
  const view = renderResult(uiLayer, {
    perfect: cleared >= TOTAL,
    desktop: !state.mobile,
    cleared,
    total: TOTAL,
    adMs,
    note: eligible
      ? '正在提交成绩…'
      : state.mobile
        ? '测试模式（从中间关卡开始），本局不计入排名。'
        : '桌面体验模式没有真实传感器，相关关卡已自动跳过，本局不计入排名。用手机打开才能上榜。',
    onAgain: startRun,
    onBoard: () => openBoard(uiLayer, { me: state.me, total: TOTAL }),
    onHome: () => {
      state.token += 1;
      showHome();
    },
  });
  if (!eligible) {
    return;
  }
  const submit = await submitRun({ levelsCleared: cleared, adMs, fullClear: cleared >= TOTAL });
  view.setNote(noteFor(submit));
}

async function boot() {
  showHome();
  tickHud();
  if (await waitForSDK()) {
    state.me = await getMe();
    if (home) {
      home.setUser(state.me);
    }
  }
}

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

boot();
