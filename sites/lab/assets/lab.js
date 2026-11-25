/**
 * 实验室外壳：hash 路由 + 模块懒加载。
 * 每个模块导出 mount(root) / unmount()，切换时调用 unmount 清理定时器与监听。
 */

const routes = {
  model: () => import("./modules/model.js"),
  security: () => import("./modules/security.js"),
};

const landing = document.querySelector("#landing");
const host = document.querySelector("#module");
const footStat = document.querySelector("#foot-stat");

let current = null;

/** 切走前先把模块自己的循环与监听停掉，避免后台空转 */
async function unmount() {
  if (current?.unmount) await current.unmount();
  current = null;
  host.replaceChildren();
}

async function route() {
  const key = (location.hash.replace(/^#\/?/, "") || "").split("?")[0];
  const load = routes[key];

  document.querySelectorAll("[data-nav]").forEach((a) => {
    const active = a.dataset.nav === (load ? key : "home");
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });

  if (!load) {
    await unmount();
    landing.hidden = false;
    host.hidden = true;
    document.title = "实验室 · lab.8o.nz";
    return;
  }

  landing.hidden = true;
  host.hidden = false;
  await unmount();

  const mod = await load();
  current = mod;
  await mod.mount(host);

  const label = key === "model" ? "模型舱" : "安全舱";
  document.title = `${label} · lab.8o.nz`;
  footStat.textContent = `${label} · 渲染在本地`;
}

addEventListener("hashchange", route);
route();
