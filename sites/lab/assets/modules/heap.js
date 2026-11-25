/**
 * 数据舱：拖入 .heapsnapshot 在本地解析（worker 里跑），不上传任何数据。
 * 结果只做统计口径的结论，支配树 / retained size 留到下一版，界面上写明。
 */

const fmt = (n) => {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 没有真实快照时的示例：造一份结构合法的迷你快照，让界面能被验证 */
function makeSample() {
  const nodeFields = ["type", "name", "id", "self_size", "edge_count", "trace_node_id", "detachedness"];
  const nodeTypes = [["hidden", "array", "string", "object", "code", "closure", "regexp", "number", "native", "synthetic", "concatenated string", "sliced string", "symbol", "bigint"], "string", "number", "number", "number", "number", "number"];
  const edgeFields = ["type", "name_or_index", "to_node"];
  const edgeTypes = [["context", "element", "property", "internal", "hidden", "shortcut", "weak"]];
  const strings = ["(GC roots)", "root", "bigObject", "payload", "cacheEntry"];
  const nodes = [];
  const edges = [];

  // 1 个根 + 3000 个对象，其中若干带大 self_size，另有重复长字符串
  let edgeCursor = 0;
  for (let i = 0; i < 3000; i += 1) {
    const isRoot = i === 0;
    const type = isRoot ? 9 : i % 7 === 0 ? 2 : 3;
    const name = isRoot ? 0 : i % 5 === 0 ? 3 : i % 37 === 0 ? 2 : 1;
    const size = isRoot ? 0 : i % 37 === 0 ? 96 * 1024 : 32 + (i % 200);
    const outEdges = isRoot ? 1 : i < 300 ? 1 : 0;
    nodes.push(type, name, 1000 + i, size, outEdges, 0, i === 42 ? 1 : 0);
    for (let e = 0; e < outEdges; e += 1) {
      edges.push(2, 0, (i + 1) * nodeFields.length);
    }
    edgeCursor += outEdges;
  }

  const dup = "x".repeat(64);
  for (let i = 0; i < 40; i += 1) strings.push(dup);

  return JSON.stringify({
    snapshot: {
      meta: { node_fields: nodeFields, node_types: nodeTypes, edge_fields: edgeFields, edge_types: edgeTypes },
      node_count: nodes.length / nodeFields.length,
      edge_count: edgeCursor,
    },
    nodes,
    edges,
    strings,
  });
}

let cleanup = null;

export async function mount(root) {
  root.innerHTML = `
    <div class="module__head">
      <div>
        <p class="label">// BAY-04 · HEAP</p>
        <h2>数据舱</h2>
        <p>Chrome DevTools 导出的 <code>.heapsnapshot</code> 直接拖进来。解析在 Web Worker 里跑，文件不会离开这台机器。</p>
      </div>
      <div class="row">
        <button class="btn-sm" id="sample" type="button">载入示例快照</button>
      </div>
    </div>

    <div class="module__body">
      <div class="card" id="drop">
        <div class="card__title"><span>INPUT</span><span id="file-state">等待文件</span></div>
        <p class="hint" style="margin-bottom:12px">
          支持拖拽或点击选择。超过 200 MB 的快照解析会比较久，建议先在 DevTools 里做一次 GC 再导出。
        </p>
        <input type="file" id="file" accept=".heapsnapshot,.json,application/json" />
        <div class="model__stats" style="margin-top:16px">
          <div class="stat"><span>NODES</span><b id="s-nodes">—</b></div>
          <div class="stat"><span>EDGES</span><b id="s-edges">—</b></div>
          <div class="stat"><span>SELF SIZE</span><b id="s-size">—</b></div>
          <div class="stat"><span>DETACHED</span><b id="s-detach">—</b></div>
        </div>
      </div>

      <div class="card">
        <div class="card__title"><span>BY TYPE</span><span>自占用</span></div>
        <div id="types" class="heap-types"><p class="hint">还没有数据</p></div>
      </div>

      <div class="card">
        <div class="card__title"><span>TOP NODES</span><span>self size</span></div>
        <pre class="out" id="top" style="max-height:280px">—</pre>
      </div>

      <div class="card">
        <div class="card__title"><span>REPEATED STRINGS</span><span>≥24 字符</span></div>
        <pre class="out" id="dups" style="max-height:220px">—</pre>
      </div>
    </div>

    <p class="hint" style="margin-top:16px">
      说明：这一版给的是数量与自占用（self size）口径的结论，<b>不含支配树与 retained size</b>；detached 计数来自快照里的 detachedness 字段。
    </p>
  `;

  const $ = (s) => root.querySelector(s);
  const worker = new Worker(new URL("../heap-worker.js", import.meta.url), { type: "module" });
  const listeners = [];

  const on = (el, ev, fn) => {
    el.addEventListener(ev, fn);
    listeners.push([el, ev, fn]);
  };

  function render(result) {
    const { summary, types, top, duplicateStrings } = result;
    $("#s-nodes").textContent = summary.nodes.toLocaleString();
    $("#s-edges").textContent = summary.edges.toLocaleString();
    $("#s-size").textContent = fmt(summary.totalSelf);
    $("#s-detach").textContent = String(summary.detached);

    const max = Math.max(...types.map((t) => t.size), 1);
    $("#types").innerHTML = types
      .map(
        (t) => `<div class="heap-row">
          <span class="heap-row__name mono">${esc(t.type)}</span>
          <span class="heap-row__bar"><i style="width:${(t.size / max) * 100}%"></i></span>
          <span class="heap-row__num mono">${fmt(t.size)} · ${t.count.toLocaleString()}</span>
        </div>`
      )
      .join("");

    $("#top").innerHTML = top
      .map((n) => `<b>${fmt(n.size)}</b>  ${esc(n.type)}  ${esc(n.name || "(anonymous)")}  <span style="opacity:.6">edges ${n.outEdges}</span>`)
      .join("\n");

    $("#dups").innerHTML = duplicateStrings.length
      ? duplicateStrings.map((d) => `×${d.count}  ${esc(d.value)}`).join("\n")
      : "没有发现重复的长字符串";
  }

  function analyzeText(text, label) {
    $("#file-state").textContent = "解析中…";
    $("#types").innerHTML = '<p class="hint">解析中…</p>';
    worker.postMessage({ text });
    currentLabel = label;
  }

  let currentLabel = "";

  worker.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (!msg.ok) {
      $("#file-state").textContent = "解析失败";
      $("#types").innerHTML = `<p class="hint" style="color:var(--rose)">${esc(msg.error)}</p>`;
      return;
    }
    $("#file-state").textContent = currentLabel;
    render(msg.result);
  });

  function readFile(file) {
    if (!file) return;
    const size = file.size / 1024 / 1024;
    currentLabel = `${file.name}（${size.toFixed(1)} MB）`;
    $("#file-state").textContent = "读取中…";
    const reader = new FileReader();
    reader.onload = () => analyzeText(String(reader.result), currentLabel);
    reader.onerror = () => {
      $("#file-state").textContent = "读取失败";
    };
    reader.readAsText(file);
  }

  on($("#file"), "change", (e) => readFile(e.target.files?.[0]));

  on($("#sample"), "click", () => {
    analyzeText(makeSample(), "示例快照（合成数据）");
  });

  const drop = $("#drop");
  on(drop, "dragover", (e) => {
    e.preventDefault();
    drop.style.borderColor = "color-mix(in srgb, var(--accent) 60%, transparent)";
  });
  on(drop, "dragleave", () => {
    drop.style.borderColor = "";
  });
  on(drop, "drop", (e) => {
    e.preventDefault();
    drop.style.borderColor = "";
    readFile(e.dataTransfer?.files?.[0]);
  });

  cleanup = () => {
    worker.terminate();
    listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
  };
}

export function unmount() {
  if (cleanup) cleanup();
  cleanup = null;
}
