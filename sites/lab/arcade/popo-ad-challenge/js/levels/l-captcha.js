/** 迷彩验证码：看清 4 位数字再输入 */
import { el, rand, randInt, pick, vibrate } from '../utils.js';
import { splash, bait, hintPill } from './shared.js';

function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 92;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

/** 底层迷彩：渐变 + 色块 + 几个浅色干扰数字 */
function drawCamo(canvas) {
  const { ctx, w, h } = fitCanvas(canvas);
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#dafca9');
  bg.addColorStop(0.5, '#74facb');
  bg.addColorStop(1, '#ffcbe9');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 52; i++) {
    ctx.beginPath();
    ctx.ellipse(rand(0, w), rand(0, h), rand(8, 26), rand(6, 18), rand(0, Math.PI), 0, Math.PI * 2);
    ctx.fillStyle = pick(['rgba(10,15,2,.16)', 'rgba(184,237,110,.7)', 'rgba(102,214,255,.45)', 'rgba(255,203,233,.6)']);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 7; i++) {
    ctx.save();
    ctx.translate(rand(0, w), rand(0, h));
    ctx.rotate(rand(-1, 1));
    ctx.font = `900 ${randInt(16, 28)}px Inter, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(10,15,2,.14)';
    ctx.fillText(String(randInt(0, 9)), 0, 0);
    ctx.restore();
  }
}

/** 顶层干扰线和噪点，盖在数字上面 */
function drawNoise(canvas) {
  const { ctx, w, h } = fitCanvas(canvas);
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(rand(0, w), rand(0, h));
    ctx.bezierCurveTo(rand(0, w), rand(0, h), rand(0, w), rand(0, h), rand(0, w), rand(0, h));
    ctx.strokeStyle = pick(['rgba(10,15,2,.45)', 'rgba(255,255,255,.6)']);
    ctx.lineWidth = rand(1.2, 2.6);
    ctx.stroke();
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = pick(['rgba(10,15,2,.35)', 'rgba(255,255,255,.55)']);
    ctx.fillRect(rand(0, w), rand(0, h), rand(1, 2.4), rand(1, 2.4));
  }
}

/** 一组随机的 3D 变形：透视下的 X/Y/Z 旋转、斜切和非等比缩放叠加 */
function warp() {
  return [
    'translate(-50%, -50%)',
    `rotateX(${rand(-55, 55).toFixed(1)}deg)`,
    `rotateY(${rand(-55, 55).toFixed(1)}deg)`,
    `rotateZ(${rand(-28, 28).toFixed(1)}deg)`,
    `skew(${rand(-22, 22).toFixed(1)}deg, ${rand(-12, 12).toFixed(1)}deg)`,
    `scale(${rand(0.7, 1.35).toFixed(2)}, ${rand(0.7, 1.35).toFixed(2)})`,
  ].join(' ');
}

/** 把数字放进验证码框，每个数字在两组变形之间来回扭动 */
function mountDigits(box, code) {
  const layer = el('div');
  layer.style.cssText = 'position:absolute;inset:0;perspective:220px;transform-style:preserve-3d';
  [...code].forEach((d, i) => {
    const span = el('span', '', d);
    const color = pick(['#0a0f02', '#2f4c07', '#3e403c']);
    span.style.cssText = `position:absolute;left:${17 + i * 22 + rand(-3, 3)}%;top:${50 + rand(-10, 10)}%;
      font:900 ${randInt(40, 50)}px/1 Inter,-apple-system,sans-serif;color:${color};
      text-shadow:${rand(-3, 3).toFixed(1)}px ${rand(-3, 3).toFixed(1)}px 0 rgba(255,255,255,.55);
      transform-origin:${randInt(30, 70)}% ${randInt(30, 70)}%;will-change:transform`;
    layer.appendChild(span);
    span.animate([{ transform: warp() }, { transform: warp() }, { transform: warp() }], {
      duration: rand(1800, 3000),
      direction: 'alternate',
      iterations: Infinity,
      easing: 'ease-in-out',
      delay: -rand(0, 1500),
    });
  });
  box.appendChild(layer);
}

export default {
  name: '迷彩验证码',
  sub: '广告 30 秒',
  tip: '输入验证码跳过广告',
  mount(root, api) {
    splash(root, api, { img: 4, dim: true, cta: false });
    bait(root, api, { text: '免验证，直接关闭广告', reason: '「免验证」通道是假的', bottom: 'calc(100% - 132px)', ico: '🔓' });
    const hint = hintPill(root, '输入 4 位验证码');
    hint.node.style.top = '146px';

    const code = String(randInt(1000, 9999));
    let input = '';
    let done = false;

    const panel = el('div', 'glass');
    panel.style.cssText += ';position:absolute;left:0;right:0;bottom:16px;width:min(92%,350px);margin:0 auto;padding:14px;z-index:9;animation:riseIn .55s .2s var(--ease-out) backwards';
    panel.innerHTML = `
      <div class="cap" style="position:relative;height:92px;border-radius:14px;overflow:hidden">
        <canvas class="camo" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
        <canvas class="noise" style="position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none"></canvas>
      </div>
      <div class="slots" style="display:flex;gap:8px;justify-content:center;margin:12px 0"></div>
      <div class="pad" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"></div>`;
    root.appendChild(panel);
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());

    const slots = [...Array(4)].map(() => {
      const s = el('div', 'num');
      s.style.cssText = 'width:48px;height:54px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);transition:box-shadow .2s ease,transform .25s var(--ease-spring)';
      panel.querySelector('.slots').appendChild(s);
      return s;
    });

    const render = () => {
      slots.forEach((s, i) => {
        s.textContent = input[i] || '';
        const active = i === input.length;
        s.style.boxShadow = input[i] ? 'inset 0 0 0 1.5px var(--lime)' : active ? 'inset 0 0 0 1.5px rgba(255,255,255,.5)' : 'inset 0 0 0 1px rgba(255,255,255,.14)';
        s.style.transform = input[i] && i === input.length - 1 ? 'scale(1.08)' : 'none';
      });
    };

    const check = () => {
      if (done) {
        return;
      }
      done = true;
      if (input === code) {
        api.win();
      } else {
        vibrate([20, 30, 20]);
        api.fail('验证码输错了');
      }
    };

    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].forEach((k) => {
      const b = el('button', 'num', k);
      b.type = 'button';
      b.style.cssText = 'appearance:none;border:0;height:48px;border-radius:14px;font-size:19px;font-weight:600;color:#fff;background:rgba(255,255,255,.07);transition:transform .2s var(--ease-spring),background .15s ease';
      if (k === '✓') {
        b.style.background = 'var(--lime)';
        b.style.color = 'var(--ink)';
      }
      b.addEventListener('pointerdown', () => {
        b.style.transform = 'scale(.92)';
      });
      b.addEventListener('pointerup', () => {
        b.style.transform = '';
      });
      b.addEventListener('click', () => {
        if (done) {
          return;
        }
        if (k === '⌫') {
          input = input.slice(0, -1);
        } else if (k === '✓') {
          if (input.length === 4) {
            check();
          } else {
            hint.set(`还差 ${4 - input.length} 位`, 'warn');
          }
        } else if (input.length < 4) {
          input += k;
        }
        render();
        if (input.length === 4) {
          setTimeout(check, 180);
        }
      });
      panel.querySelector('.pad').appendChild(b);
    });

    render();
    requestAnimationFrame(() => {
      const cap = panel.querySelector('.cap');
      drawCamo(cap.querySelector('.camo'));
      mountDigits(cap, code);
      drawNoise(cap.querySelector('.noise'));
    });
  },
};
