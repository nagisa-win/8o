/**
 * 模型舱：在画布上点出自己的数据集，现场训练一个两层感知机。
 * 全部计算发生在本机：前向、反向传播、决策边界采样都是手写的，没有任何库。
 *
 * 网络结构：2 → H(tanh) → H(tanh) → 1(sigmoid)，二分类，二元交叉熵 + 动量梯度下降。
 */

const NS = "http://www.w3.org/2000/svg";

// 默认先给一个好学的数据集，双螺旋留作难题
const PRESETS = {
  blob: "两团高斯（入门）",
  circle: "同心圆环",
  xor: "异或四象限",
  spiral: "双螺旋（难）",
};

/* ==================== 迷你神经网络 ==================== */

function randn() {
  // Box–Muller，比 Math.random 更接近正态
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class MLP {
  constructor(hidden = 8, lr = 0.02) {
    this.lr = lr;
    this.h = hidden;
    // 权重按 He 初始化
    const init = (n, m) => Array.from({ length: n }, () => Array.from({ length: m }, () => randn() * Math.sqrt(2 / m)));
    this.w1 = init(hidden, 2);
    this.b1 = new Array(hidden).fill(0);
    this.w2 = init(hidden, hidden);
    this.b2 = new Array(hidden).fill(0);
    this.w3 = init(1, hidden);
    this.b3 = [0];
    this.resetMomentum();
  }

  resetMomentum() {
    const zero = (m) => m.map((row) => (Array.isArray(row) ? row.map(() => 0) : 0));
    this.m = { w1: zero(this.w1), b1: zero(this.b1), w2: zero(this.w2), b2: zero(this.b2), w3: zero(this.w3), b3: zero(this.b3) };
  }

  setHidden(h) {
    if (h === this.h) return;
    this.h = h;
    const init = (n, m) => Array.from({ length: n }, () => Array.from({ length: m }, () => randn() * Math.sqrt(2 / m)));
    this.w1 = init(h, 2);
    this.b1 = new Array(h).fill(0);
    this.w2 = init(h, h);
    this.b2 = new Array(h).fill(0);
    this.w3 = init(1, h);
    this.b3 = [0];
    this.resetMomentum();
  }

  forward(x, y) {
    const z1 = this.w1.map((row, i) => row[0] * x + row[1] * y + this.b1[i]);
    const a1 = z1.map(Math.tanh);
    const z2 = this.w2.map((row, i) => row.reduce((s, w, j) => s + w * a1[j], this.b2[i]));
    const a2 = z2.map(Math.tanh);
    const out = 1 / (1 + Math.exp(-(this.w3[0].reduce((s, w, j) => s + w * a2[j], this.b3[0]))));
    return { a1, a2, out };
  }

  predict(x, y) {
    return this.forward(x, y).out;
  }

  /** 单样本反向传播，返回该样本的损失（用于画曲线） */
  step(x, y, target) {
    const { a1, a2, out } = this.forward(x, y);
    const eps = 1e-7;
    const loss = -(target * Math.log(out + eps) + (1 - target) * Math.log(1 - out + eps));

    // 输出层梯度（sigmoid + BCE 后化简为 out - target）
    const dOut = out - target;
    const dW3 = a2.map((v) => dOut * v);
    const dB3 = dOut;

    // 第二隐层
    const dA2 = this.w3[0].map((w) => dOut * w);
    const dZ2 = dA2.map((v, i) => v * (1 - a2[i] * a2[i]));
    const dW2 = dZ2.map((g, i) => a1.map((v) => g * v));
    const dB2 = dZ2;

    // 第一隐层
    const dA1 = a1.map((_, j) => dZ2.reduce((s, g, i) => s + g * this.w2[i][j], 0));
    const dZ1 = dA1.map((v, i) => v * (1 - a1[i] * a1[i]));
    const dW1 = dZ1.map((g, i) => [g * x, g * y]);
    const dB1 = dZ1;

    const mu = 0.9;
    const upd = (p, g, mp) => {
      mp = mu * mp - this.lr * g;
      return [p + mp, mp];
    };

    for (let i = 0; i < this.h; i += 1) {
      const [w0, m0] = upd(this.w1[i][0], dW1[i][0], this.m.w1[i][0]);
      const [w1v, m1] = upd(this.w1[i][1], dW1[i][1], this.m.w1[i][1]);
      this.w1[i] = [w0, w1v];
      this.m.w1[i] = [m0, m1];
      const [b, mb] = upd(this.b1[i], dB1[i], this.m.b1[i]);
      this.b1[i] = b;
      this.m.b1[i] = mb;

      for (let j = 0; j < this.h; j += 1) {
        const [w, mw] = upd(this.w2[i][j], dW2[i][j], this.m.w2[i][j]);
        this.w2[i][j] = w;
        this.m.w2[i][j] = mw;
      }
      const [b2, mb2] = upd(this.b2[i], dB2[i], this.m.b2[i]);
      this.b2[i] = b2;
      this.m.b2[i] = mb2;
    }

    for (let j = 0; j < this.h; j += 1) {
      const [w, mw] = upd(this.w3[0][j], dW3[j], this.m.w3[0][j]);
      this.w3[0][j] = w;
      this.m.w3[0][j] = mw;
    }
    const [b3, mb3] = upd(this.b3[0], dB3, this.m.b3[0]);
    this.b3[0] = b3;
    this.m.b3[0] = mb3;

    return loss;
  }
}

/* ==================== 数据生成 ==================== */

function makePreset(kind, count = 120) {
  const pts = [];
  const rnd = (a, b) => a + Math.random() * (b - a);

  if (kind === "spiral") {
    for (const label of [0, 1]) {
      for (let i = 0; i < count; i += 1) {
        const r = (i / count) * 0.44;
        const t = (i / count) * 2.6 * Math.PI + label * Math.PI;
        pts.push({
          x: 0.5 + r * Math.cos(t) + rnd(-0.02, 0.02),
          y: 0.5 + r * Math.sin(t) + rnd(-0.02, 0.02),
          label,
        });
      }
    }
  } else if (kind === "blob") {
    for (let i = 0; i < count; i += 1) {
      pts.push({ x: 0.35 + randn() * 0.09, y: 0.62 + randn() * 0.09, label: 0 });
      pts.push({ x: 0.66 + randn() * 0.09, y: 0.38 + randn() * 0.09, label: 1 });
    }
  } else if (kind === "circle") {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      pts.push({ x: 0.5 + Math.cos(a) * rnd(0, 0.16), y: 0.5 + Math.sin(a) * rnd(0, 0.16), label: 0 });
      pts.push({ x: 0.5 + Math.cos(a) * rnd(0.3, 0.42), y: 0.5 + Math.sin(a) * rnd(0.3, 0.42), label: 1 });
    }
  } else {
    for (let i = 0; i < count; i += 1) {
      const x = Math.random();
      const y = Math.random();
      pts.push({ x, y, label: x > 0.5 !== y > 0.5 ? 0 : 1 });
    }
  }

  return pts.filter((p) => p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98);
}

/* ==================== 模块 ==================== */

let cleanup = null;

export async function mount(root) {
  root.innerHTML = `
    <div class="module__head">
      <div>
        <p class="label">// BAY-01 · MODEL</p>
        <h2>模型舱</h2>
        <p>画布上随便点点就是训练集。下面这个两层感知机的每一步梯度都用 JS 手写，决策边界和损失曲线实时更新。</p>
      </div>
      <div class="legend">
        <span><i style="background:var(--accent)"></i>类 A</span>
        <span><i style="background:var(--rose)"></i>类 B</span>
      </div>
    </div>

    <div class="module__body">
      <div class="model">
        <div class="model__stage" id="stage">
          <canvas id="field" width="440" height="440"></canvas>
        </div>
        <div class="model__panel">
          <div class="card">
            <div class="card__title"><span>CONTROL</span><span id="status">待训练</span></div>
            <div class="row" style="margin-bottom:12px">
              <button class="btn-sm" id="train" type="button">开始训练</button>
              <button class="btn-sm" id="reset" type="button">重置权重</button>
              <button class="btn-sm" id="clear" type="button">清空数据</button>
            </div>
            <div class="field">
              <label for="preset">数据集预设</label>
              <select id="preset">
                ${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="lr">学习率 · <span id="lr-val">0.020</span></label>
              <input type="range" id="lr" min="5" max="40" value="20" style="width:100%" />
            </div>
            <div class="field">
              <label for="hidden">隐藏层宽度 · <span id="hd-val">8</span></label>
              <input type="range" id="hidden" min="2" max="24" value="8" style="width:100%" />
            </div>
            <p class="hint">在左侧画布左侧单击 = 类 A，Shift/右键单击 = 类 B。数据只在本机内存里。</p>
          </div>

          <div class="card">
            <div class="card__title"><span>LOSS</span><span id="loss-last">—</span></div>
            <svg id="chart" viewBox="0 0 300 70" width="100%" height="70" aria-label="损失曲线"></svg>
            <div class="model__stats" style="margin-top:12px">
              <div class="stat"><span>EPOCH</span><b id="epoch">0</b></div>
              <div class="stat"><span>LOSS</span><b id="loss">—</b></div>
              <div class="stat"><span>ACC</span><b id="acc">—</b></div>
              <div class="stat"><span>PARAMS</span><b id="params">—</b></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const stage = root.querySelector("#stage");
  const canvas = root.querySelector("#field");
  const ctx = canvas.getContext("2d");
  const chart = root.querySelector("#chart");
  const chartPath = document.createElementNS(NS, "path");
  chartPath.setAttribute("fill", "none");
  chartPath.setAttribute("stroke", "var(--accent)");
  chartPath.setAttribute("stroke-width", "1.5");
  chart.append(chartPath);

  let points = makePreset("blob");
  let net = new MLP(8, 0.02);
  let running = false;
  let raf = 0;
  let epoch = 0;
  let losses = [];
  let lastLoss = null;
  let acc = null;
  let boundary = null;

  const size = 440;
  const GRID = 44;

  /** 采样决策边界：GRID × GRID 次前向，结果画成色块 */
  function computeBoundary() {
    const buf = document.createElement("canvas");
    buf.width = GRID;
    buf.height = GRID;
    const bctx = buf.getContext("2d");
    const img = bctx.createImageData(GRID, GRID);

    for (let gy = 0; gy < GRID; gy += 1) {
      for (let gx = 0; gx < GRID; gx += 1) {
        const p = net.predict(gx / (GRID - 1), 1 - gy / (GRID - 1));
        const i = (gy * GRID + gx) * 4;
        // 两侧各自着色、中间过渡接近透明，边界线一眼可辨
        const edge = Math.abs(p - 0.5) * 2; // 0 在边界上，1 在两端
        img.data[i] = p > 0.5 ? 255 : 77;
        img.data[i + 1] = p > 0.5 ? 77 : 225;
        img.data[i + 2] = p > 0.5 ? 125 : 255;
        img.data[i + 3] = Math.round(70 * edge);
      }
    }

    bctx.putImageData(img, 0, 0);
    boundary = buf;
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);

    // 网格
    ctx.strokeStyle = "rgba(124,170,255,0.10)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i += 1) {
      const p = (size / 8) * i;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    if (boundary) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(boundary, 0, 0, size, size);
    } else {
      ctx.fillStyle = "rgba(6,9,16,0.9)";
      ctx.fillRect(0, 0, size, size);
    }

    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x * size, (1 - p.y) * size, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.label === 1 ? "#ff4d7d" : "#4de1ff";
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawChart() {
    if (losses.length < 2) {
      chartPath.setAttribute("d", "");
      return;
    }
    const max = Math.max(...losses, 0.05);
    const pts = losses.map((v, i) => {
      const x = (i / (losses.length - 1)) * 300;
      const y = 66 - (v / max) * 60;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    chartPath.setAttribute("d", pts.join(" "));
  }

  function stats() {
    root.querySelector("#epoch").textContent = String(epoch);
    root.querySelector("#loss").textContent = lastLoss == null ? "—" : lastLoss.toFixed(4);
    root.querySelector("#acc").textContent = acc == null ? "—" : `${(acc * 100).toFixed(0)}%`;
    root.querySelector("#params").textContent = String(net.w1.length * 3 + net.w2.length * (net.h + 1) + net.h + 1);
  }

  /** 一次迭代：随机抽 16 个样本做一轮小批量更新 */
  function trainOnce() {
    if (!points.length) return;
    let sum = 0;
    const batch = 16;
    for (let i = 0; i < batch; i += 1) {
      const p = points[(Math.random() * points.length) | 0];
      sum += net.step(p.x, p.y, p.label);
    }
    lastLoss = sum / batch;
    losses.push(lastLoss);
    if (losses.length > 240) losses.shift();
    epoch += 1;

    // 准确率每 10 轮统计一次，省点算力
    if (epoch % 10 === 0) {
      let hit = 0;
      for (const p of points) {
        const v = net.predict(p.x, p.y);
        if ((v > 0.5 ? 1 : 0) === p.label) hit += 1;
      }
      acc = hit / points.length;
    }
  }

  let frameNo = 0;

  function frame() {
    if (!running) return;
    for (let i = 0; i < 3; i += 1) trainOnce();

    // 边界采样比较贵，每三帧重算一次，肉眼几乎看不出差别
    frameNo += 1;
    if (frameNo % 3 === 0) computeBoundary();
    draw();
    drawChart();
    stats();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    root.querySelector("#train").textContent = "暂停";
    root.querySelector("#status").textContent = "训练中";
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    root.querySelector("#train").textContent = "继续训练";
    root.querySelector("#status").textContent = "已暂停";
  }

  /* ---------- 交互 ---------- */

  function addPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = 1 - (ev.clientY - rect.top) / rect.height;
    const label = ev.shiftKey || ev.button === 2 ? 1 : 0;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    points.push({ x, y, label });

    // 新数据立刻改变边界，方便边点边看
    computeBoundary();
    draw();
  }

  stage.addEventListener("pointerdown", addPoint);
  stage.addEventListener("contextmenu", (e) => e.preventDefault());

  root.querySelector("#train").addEventListener("click", () => (running ? stop() : start()));

  root.querySelector("#reset").addEventListener("click", () => {
    stop();
    net = new MLP(net.h, net.lr);
    epoch = 0;
    losses = [];
    lastLoss = null;
    acc = null;
    computeBoundary();
    draw();
    drawChart();
    stats();
    root.querySelector("#train").textContent = "开始训练";
    root.querySelector("#status").textContent = "待训练";
  });

  root.querySelector("#clear").addEventListener("click", () => {
    stop();
    points = [];
    computeBoundary();
    draw();
  });

  root.querySelector("#preset").addEventListener("change", (e) => {
    stop();
    points = makePreset(e.target.value);
    computeBoundary();
    draw();
  });

  root.querySelector("#lr").addEventListener("input", (e) => {
    const lr = Number(e.target.value) / 1000;
    net.lr = lr;
    root.querySelector("#lr-val").textContent = lr.toFixed(3);
  });

  root.querySelector("#hidden").addEventListener("input", (e) => {
    const h = Number(e.target.value);
    root.querySelector("#hd-val").textContent = String(h);
    stop();
    net.setHidden(h);
    epoch = 0;
    losses = [];
    computeBoundary();
    draw();
    drawChart();
    stats();
  });

  computeBoundary();
  draw();
  stats();

  cleanup = () => {
    stop();
    stage.removeEventListener("pointerdown", addPoint);
  };
}

/** 路由切走时调用，停掉训练循环 */
export function unmount() {
  if (cleanup) cleanup();
  cleanup = null;
}
