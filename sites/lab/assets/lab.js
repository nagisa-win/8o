/**
 * 实验室外壳：hash 路由 + 模块懒加载。
 * 每个模块导出 mount(root) / unmount()，切换时调用 unmount 清理定时器与监听。
 */

const routes = {
  model: () => import("./modules/model.js"),
  security: () => import("./modules/security.js"),
  heap: () => import("./modules/heap.js"),
  device: () => import("./modules/device.js"),
  link: () => import("./modules/link.js"),
};

// 同一份产物挂两个域名：8o.nz 是主站，steven.run 是境内镜像（已备案）
const HOST = location.hostname.endsWith("steven.run") ? "lab.steven.run" : "lab.8o.nz";

const landing = document.querySelector("#landing");

/** 两个域名互为镜像，互相指一下，境内访客少绕路 */
(() => {
  const note = document.querySelector("#mirror-note");
  if (!note) return;
  note.innerHTML =
    HOST === "lab.steven.run"
      ? '这是境内镜像（成都机房，已备案）。主站：<a href="https://lab.8o.nz/">lab.8o.nz</a>'
      : '境内访问较慢时可用镜像：<a href="https://lab.steven.run/">lab.steven.run</a>';
})();
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
    document.title = `实验室 · ${HOST}`;
    return;
  }

  landing.hidden = true;
  host.hidden = false;
  await unmount();

  const mod = await load();
  current = mod;
  await mod.mount(host);

  const label = { model: "模型舱", security: "安全舱", heap: "数据舱", device: "设备舱", link: "连接舱" }[key] || "实验室";
  document.title = `${label} · ${HOST}`;
  footStat.textContent = `${label} · ${HOST} · 渲染在本地`;
}

addEventListener("hashchange", route);
route();
