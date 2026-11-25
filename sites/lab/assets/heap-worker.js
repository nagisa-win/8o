/**
 * 数据舱的解析 worker：V8 heapsnapshot 在主线程解析会把页面卡死，所以放到 worker 里。
 * 只做"能在一秒内给出结论"的统计：按类型聚合、Top 自占用、detached 节点、重复字符串。
 * 支配树与 retained size 属于后续版本，界面上如实标注，不糊弄。
 */

self.addEventListener("message", (ev) => {
  const { text } = ev.data;
  try {
    const result = analyze(text);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err.message || err) });
  }
});

function analyze(text) {
  const data = JSON.parse(text);
  const snapshot = data.snapshot;
  if (!snapshot?.meta?.node_fields) throw new Error("这不是 Chrome DevTools 导出的 .heapsnapshot（缺少 snapshot.meta）");

  const { node_fields: nf, node_types: nt, edge_fields: ef } = snapshot.meta;
  const nodes = data.nodes;
  const edges = data.edges;
  const strings = data.strings || [];

  const idx = (name) => nf.indexOf(name);
  const iType = idx("type");
  const iName = idx("name");
  const iSize = idx("self_size");
  const iEdges = idx("edge_count");
  const iDetach = idx("detachedness");

  const nodeStride = nf.length;
  const edgeStride = ef.length;
  const nodeCount = snapshot.node_count || nodes.length / nodeStride;

  const typeNames = nt?.[0] || [];

  // 按类型聚合：数量、总自占用、总出边
  const byType = new Map();
  // Top 自占用：维护一个长度固定的数组，够用且省内存
  const TOP = 20;
  const top = [];
  let totalSelf = 0;
  let detached = 0;
  let maxEdges = 0;

  for (let n = 0; n < nodeCount; n += 1) {
    const base = n * nodeStride;
    const type = typeNames[nodes[base + iType]] || "unknown";
    const name = strings[nodes[base + iName]] || "";
    const size = nodes[base + iSize] || 0;
    const outEdges = iEdges >= 0 ? nodes[base + iEdges] || 0 : 0;
    const isDetached = iDetach >= 0 ? nodes[base + iDetach] === 1 : false;

    totalSelf += size;
    if (isDetached) detached += 1;
    if (outEdges > maxEdges) maxEdges = outEdges;

    const bucket = byType.get(type) || { type, count: 0, size: 0, edges: 0 };
    bucket.count += 1;
    bucket.size += size;
    bucket.edges += outEdges;
    byType.set(type, bucket);

    if (size > 0) {
      if (top.length < TOP) {
        top.push({ type, name, size, outEdges, id: n });
        top.sort((a, b) => b.size - a.size);
      } else if (size > top[top.length - 1].size) {
        top[TOP - 1] = { type, name, size, outEdges, id: n };
        top.sort((a, b) => b.size - a.size);
      }
    }
  }

  // 字符串表里重复值最多的前若干条，常见于拼接产生的泄漏
  const seen = new Map();
  for (const s of strings) {
    if (s.length < 24) continue;
    seen.set(s, (seen.get(s) || 0) + 1);
  }
  const duplicateStrings = [...seen.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([value, count]) => ({ value: value.slice(0, 120), count }));

  const types = [...byType.values()].sort((a, b) => b.size - a.size);

  return {
    summary: {
      nodes: nodeCount,
      edges: snapshot.edge_count || edges.length / edgeStride,
      strings: strings.length,
      totalSelf,
      detached,
      maxEdges,
      types: types.length,
    },
    types: types.slice(0, 12),
    top,
    duplicateStrings,
  };
}
