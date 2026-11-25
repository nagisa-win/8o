/**
 * 纯静态站点 worker：所有请求交给 assets，只在 404 时补一个更友好的提示。
 * 给 skills 这类没有动态逻辑的子站复用。
 */
export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;

    const url = new URL(request.url);
    const isPage = (request.headers.get("accept") || "").includes("text/html");
    if (!isPage) return new Response("Not Found", { status: 404 });
    return new Response(
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>404 · ${url.hostname}</title>
<style>body{background:#05070d;color:#e6f0ff;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100svh;margin:0;text-align:center}
a{color:#4de1ff}code{color:#7c8aa5}</style></head>
<body><div><h1 style="font-size:64px;margin:0">404</h1>
<p style="color:#7c8aa5"><code>${url.pathname}</code> 上没有东西</p>
<p><a href="https://8o.nz/">回观测站</a></p></div></body></html>`,
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  },
};
