/**
 * 门户的中英双语词条。
 * 语言优先级：localStorage 里手动选过的 > 浏览器语言（zh 开头为中文，其余英文）。
 * 数据结构里的中英文（站点卡片、项目简介）由 JSON 自带 _en 字段，不放在这里。
 */

export const STRINGS = {
  zh: {
    "meta.title": "8O / OBSERVATORY — 渚的站点矩阵",
    "meta.desc": "8o.nz 观测站：渚的站点矩阵入口。个人说明书、Web 实验室、工具站与实时状态，全部挂在一个域名之下。",
    "skip": "跳到站点目录",
    "hero.lede":
      "一个域名下面的观测站。<strong>个人说明书</strong>、<strong>Web 实验室</strong>、工具站与实时状态，都从这里出发。所有站点自己写、自己部署、自己盯着。",
    "hero.btn.profile": "进入个人说明书",
    "hero.btn.lab": "进入实验室",
    "hero.scroll": "SCROLL ↓",
    "tm.node": "EDGE / APAC",
    "tm.signal": "SIGNAL",
    "sec.sites.label": "// 01 — SECTOR MAP",
    "sec.sites.title": "站点目录",
    "sec.sites.sub": "每个子域是一个独立舱段，各自的技术栈写在卡片上。状态灯由 status 服务实时探测，不是装饰。",
    "sec.projects.label": "// 02 — ARCHIVE",
    "sec.projects.title": "开源档案",
    "sec.projects.sub": "公开仓库里挑出来的部分。star 与更新时间由 Actions 每日同步，不手写。",
    "sec.feed.label": "// 03 — SIGNAL FEED",
    "sec.feed.title": "最近动态",
    "sec.feed.sub": "最近更新的公开仓库与打过的 tag。数据由 Actions 每日汇总，静态分发，不依赖运行时接口。",
    "sec.contact.label": "// 04 — OPEN CHANNEL",
    "sec.contact.title": "建立连接",
    "sec.contact.sub": "写代码、聊摩托、换技能包，都欢迎。",
    "feed.repos": "REPOS UPDATED",
    "feed.releases": "RELEASES",
    "feed.standby": "standby",
    "feed.norelease": "暂无 release",
    "contact.github": "nagisa-win",
    "palette.placeholder": "跳到站点 / 项目 / 链接…",
    "palette.hint": "选择 · 打开 · 关闭",
    "palette.open": "打开快速跳转面板（Ctrl 或 Command 加 K）",
    "theme.toDark": "切换到暗色主题",
    "theme.toLight": "切换到亮色主题",
    "lang.toggle": "切换到英文",
    "site.open": "OPEN",
    "site.planned": "计划中",
    "site.probe": "probe…",
    "footer.motto": "CLEAN CODE, FAST PIPELINE, COLD COFFEE.",
    "empty.projects": "暂无条目",
  },
  en: {
    "meta.title": "8O / OBSERVATORY — a domain full of things",
    "meta.desc":
      "The 8o.nz observatory: one entry point to a personal dossier, a browser lab, dev tools and live status, all under one domain.",
    "skip": "Skip to the site directory",
    "hero.lede":
      "An observatory under one domain. A <strong>personal dossier</strong>, a <strong>web lab</strong>, dev tools and live status all start here. Every site written, deployed and monitored by hand.",
    "hero.btn.profile": "Enter the dossier",
    "hero.btn.lab": "Enter the lab",
    "hero.scroll": "SCROLL ↓",
    "tm.node": "EDGE / APAC",
    "tm.signal": "SIGNAL",
    "sec.sites.label": "// 01 — SECTOR MAP",
    "sec.sites.title": "Site directory",
    "sec.sites.sub":
      "Each subdomain is its own bay, with the stack printed on the card. The status dots are live probes from the status worker, not decoration.",
    "sec.projects.label": "// 02 — ARCHIVE",
    "sec.projects.title": "Open source",
    "sec.projects.sub": "A selection of public repos. Stars and update times are synced daily by Actions, never typed by hand.",
    "sec.feed.label": "// 03 — SIGNAL FEED",
    "sec.feed.title": "Recent activity",
    "sec.feed.sub":
      "Recently updated public repos and shipped tags. Aggregated daily by Actions and served as static data, with no runtime API in the path.",
    "sec.contact.label": "// 04 — OPEN CHANNEL",
    "sec.contact.title": "Say hello",
    "sec.contact.sub": "Code, motorcycles, skill packs — all welcome.",
    "feed.repos": "REPOS UPDATED",
    "feed.releases": "RELEASES",
    "feed.standby": "standby",
    "feed.norelease": "no release yet",
    "contact.github": "nagisa-win",
    "palette.placeholder": "Jump to a site, repo or link…",
    "palette.hint": "select · open · close",
    "palette.open": "Open the quick jump palette (Ctrl or Command + K)",
    "theme.toDark": "Switch to dark theme",
    "theme.toLight": "Switch to light theme",
    "lang.toggle": "切换到中文",
    "site.open": "OPEN",
    "site.planned": "planned",
    "site.probe": "probe…",
    "footer.motto": "CLEAN CODE, FAST PIPELINE, COLD COFFEE.",
    "empty.projects": "Nothing here yet",
  },
};

const LANG_KEY = "8o-lang";

/** 语言优先级：手动选择 > 浏览器语言 */
export function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* 隐私模式忽略 */
  }
  const nav = String(navigator.language || "en").toLowerCase();
  return nav.startsWith("zh") ? "zh" : "en";
}

export function saveLang(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* 隐私模式忽略 */
  }
}

export const t = (lang, key) => STRINGS[lang]?.[key] ?? STRINGS.zh[key] ?? key;
