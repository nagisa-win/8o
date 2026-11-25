/**
 * Agent Relay 落地页脚本。
 * 三件事：中英切换、明暗切换、以及那个「一次请求怎么走完」的可交互演示。
 * 演示严格按服务端的 trace 步骤推进：submitted → routed → reviewed → delivered
 * → agent_read → reply_review → replied，驳回则停在对应步骤并标红。
 */

const KEY_LANG = "8o-lang";
const KEY_THEME = "8o-theme";

const DICT = {
  zh: {
    "nav.back": "← 观测站",
    "hero.label": "// AGENT-TO-AGENT · SELF-HOSTED",
    "hero.title1": "你的 agent 直接问他的 agent，",
    "hero.title2": "人只负责点头",
    "hero.lede":
      "Agent Relay 是一个自托管的请求中转站。不用再让人把问题从一个聊天窗口复制到另一个窗口：agent 把请求交给 relay，relay 按「人」路由过去，接收方本人确认之后才真正投递给他的 agent。",
    "badge.1": "GO 单二进制",
    "badge.2": "内嵌 SQLITE",
    "badge.3": "静态前端",
    "badge.4": "MIT",
    "act.demo": "看它怎么跑",
    "act.gh": "GitHub 仓库",
    "why.label": "// 01 — THE GAP",
    "why.title": "多 agent 协作，卡在「跨人」这一步",
    "why.sub":
      "单个 agent 能调工具、能查资料，但它没法直接问「别人的 agent」一个问题——跨过组织边界时，现在靠的是人肉搬运：复制、粘贴、再复制回来。Agent Relay 补的就是这段缺失的传输层。",
    "old.title": "现在：人肉搬运",
    "old.note": "上下文在搬运中丢失，谁问过什么没有记录，答完就散。",
    "new.title": "有 relay：一次审批，链路留痕",
    "new.note": "身份、路由、审批、加密存储和审计都在 relay 里，agent 之间不再需要人当信使。",
    "node.human": "你复制粘贴",
    "node.human2": "对方再复制",
    "node.chat": "聊天窗口",
    "node.approve": "你点一下批准",
    "node.reply": "原路回复",
    "flow.label": "// 02 — TRACE",
    "flow.title": "点一遍：一次请求是怎么走完的",
    "flow.sub":
      "下面这七步就是服务端返回的 trace 步骤。你自己点按钮推动它——注意「审核」这一步：在接收方点头之前，消息不会出现在他的 agent 里。",
    "demo.head": "THREAD",
    "state.idle": "等待发起",
    "state.sent": "已发出，路由中",
    "state.review": "等接收方审核",
    "state.delivered": "已投递",
    "state.working": "agent 处理中",
    "state.replyReview": "等发起方审核回复",
    "state.done": "已结束",
    "state.rejected": "已驳回",
    "state.replyRejected": "回复被驳回",
    "actor.a": "alice 的 agent",
    "actor.a.desc": "手上有个问题，需要问别人的 agent",
    "actor.b": "bob 的 agent",
    "actor.b.desc": "收到批准的请求后才会开始干活",
    "hub.meta": "空闲",
    "hub.active": "搬运中",
    "hub.gate": "闸门关着",
    "ctl.send": "发起请求",
    "ctl.approve": "批准",
    "ctl.reject": "驳回",
    "ctl.reset": "重置",
    "ctl.auto": "已信任对方 agent（自动批准）",
    "mode.auto": "AUTO · 已记入 auto_approvals",
    "mode.manual": "MANUAL · 人工审核",
    "trace.submitted": "发起请求",
    "trace.submitted.d": "POST /agent/v1/requests · 带 Idempotency-Key",
    "trace.routed": "按人路由",
    "trace.routed.d": "person → project → agent",
    "trace.reviewed": "接收方审核",
    "trace.reviewed.d": "status=pending · 只有 to_user 能批",
    "trace.delivered": "投递给 agent",
    "trace.delivered.d": "进入 GET /agent/v1/inbox",
    "trace.agent_read": "agent 读取",
    "trace.agent_read.d": "status=read · 开始处理",
    "trace.reply_review": "回复也要审",
    "trace.reply_review.d": "dir=to_requester · pending",
    "trace.replied": "回复送达",
    "trace.replied.d": "approved · 发起方可见",
    "arch.label": "// 03 — HOW IT WORKS",
    "arch.title": "它自己很小，只做五件事",
    "arch.sub": "身份、路由、人工审核、留存与审计——就这些。加密、幂等、长轮询都是为这五件事服务的实现细节。",
    "arch.web":
      "纯静态前端，没有构建步骤，ES modules 直接跑。页面上能看路由图、审请求、亲自答复，并通过 <code>SSE</code> 实时刷新，断流自动退回轮询。",
    "arch.api":
      "两套接口分开：<code>/web/v1</code> 给人用（cookie 会话），<code>/agent/v1</code> 给 agent 用（<code>ak_</code> 密钥）。反代只暴露 <code>/relay-api/*</code> 与 <code>/relay-dl/*</code> 两个前缀。",
    "arch.route":
      "路由图是「人 → 项目 → agent」的有向图，带默认边和「转人工」汇点。请求先按人找，再按议题找 agent；找不到就交给人自己决定。agent 地址形如 <code>ag_xxxxxxxx@owner</code>。",
    "arch.store":
      "内嵌纯 Go 的 SQLite，单文件数据库。消息用 <code>AES-256-GCM</code> 逐条加密落盘，线程在最后一次活动后 <code>7 天</code> 过期，消息与审计一起清理。",
    "arch.agent":
      "服务端直接发 <code>skill.zip</code>：agent 自己下载、解包、写配置、跑自检，然后 <code>inbox?wait=25</code> 长轮询或常驻 watcher 收活。跑不了 shell 的 agent 用 <code>relay.py mcp</code> 走 stdio。",
    "f1.t": "审核是闸门，不是建议",
    "f1.d": "只有接收方能审。发起方从不等待审批，发完就走。",
    "f2.t": "自动批准也留痕",
    "f2.d": "自己的 agent、显式信任的 agent 可跳过审核，但每次跳过都写进 auto_approvals 审计表并通知本人。",
    "f3.t": "幂等发送",
    "f3.d": "带 Idempotency-Key 的重发返回同一条消息，不会产生重复线程。",
    "f4.t": "可见性分角色",
    "f4.d": "审核方看到全部消息；发起方只看到自己发出的和被批准过的回复。",
    "f5.t": "零客户端安装",
    "f5.d": "不装 SDK，agent 从服务端取一个技能包，自带自检和接入提示词。",
    "f6.t": "身份三种模式",
    "f6.d": "local 自带邀请码注册；proxy 接你现有的 SSO；dev 只用于本机调试。",
    "dep.label": "// 04 — SELF-HOST",
    "dep.title": "四步搭起来",
    "dep.sub":
      "后端是一个静态编译的二进制（CGO_ENABLED=0，无 libc 依赖），前端是纯静态文件。一台 Linux x86_64 加一个能注入请求头的反代就够了。",
    "s1.t": "打包",
    "s1.d": "在仓库里出一条 release zip，里面是二进制、start.sh、配置示例和 skill 包。",
    "s2.t": "上传并首次启动",
    "s2.d": "解压后直接跑，脚本会生成 0600 的 relay.env（含随机共享密钥）并拉起服务。",
    "s3.t": "配置反代与前缀",
    "s3.d": "后端只提供 API，静态前端放任意静态托管。反代需要注入密钥并映射两条前缀：",
    "s4.t": "邀请人、接入 agent",
    "s4.d": "第一件事是发邀请码，对方登录时设密码即可；然后让 agent 自己装技能包。",
    "r.path": "公开前缀",
    "r.backend": "后端路径",
    "r.secret": "密钥头",
    "r.none": "无需（设计如此）",
    "cta.title": "下一步：把它接到你自己的 agent 上",
    "cta.sub":
      "仓库里有 API 契约、部署手册、威胁模型和测试说明。想先看效果，就照上面的四步起一个实例，用两个账号互发一条请求试试。",
    "act.repo": "nagisa-win/agent-relay",
    "act.deploy": "部署手册",
    "foot.left": "AGENT RELAY · 自托管 · 人工审核在环",
    "role.alice": "alice 视角",
    "role.bob": "bob 视角",
    "msg.sent": "你发出的：",
    "msg.pending": "待审：",
    "msg.delivered": "已投递：",
    "msg.rejected": "已驳回：",
    "hint.reviewer": "作为审核方（bob）：你能看到全部消息，包括还没批准的。",
    "hint.senderPending": "作为发起方（alice）：回复还在待审，按可见性规则你现在看不到内容。",
    "hint.senderDone": "回复已批准，发起方现在也能看到这条内容。",
    "sec.label": "// 05 — BOUNDARIES",
    "sec.title": "防住什么，不防什么",
    "sec.sub":
      "信任边界画在反向代理上：后端只认带正确共享密钥的网页请求，和带合法 ak_ 密钥的 agent 请求。下面这些是仓库里 threat-model 文档的结论，包括它明确接受的取舍。",
    "sec.guard": "已经防住的",
    "sec.accept": "明确不防的（接受的取舍）",
    "g1.t": "绕过审核塞消息",
    "g1.d": "消息投递前强制 pending，收件箱只返回 approved；审核接口校验当前用户就是收件人。",
    "g2.t": "冒充他人",
    "g2.d": "共享密钥常量时间比较；dev 模式的 X-Relay-User 只在回环地址可用。",
    "g3.t": "翻别人的线程",
    "g3.d": "每次查询都带参与方条件，非参与方拿到 404 而不是 403，连存在性都不给探。",
    "g4.t": "冒用 agent 密钥",
    "g4.d": "ak_ 为 32 字节随机，库里只存 SHA-256；轮换立即生效。",
    "g5.t": "在线爆破与抢注",
    "g5.d": "PBKDF2-SHA256 21 万次迭代加盐，5 次失败锁 15 分钟；没有开放注册，只有一次性邀请码。",
    "g6.t": "CSRF 与 XSS",
    "g6.d": "会话走自定义请求头、不开 CORS、Cookie 为 SameSite=Lax；前端只用 DOM API 建节点，不用 innerHTML。",
    "g7.t": "拖库与注入",
    "g7.d": "正文 AES-256-GCM 加密且密钥与库分离；SQL 全参数化，请求体有体积上限。",
    "g8.t": "agent 侧被命令",
    "g8.d": "守护脚本只执行你自己写的 wake.conf，绝不执行消息内容；skill 里反复强调消息是数据不是指令。",
    "a1": "<strong>运维者能读正文。</strong>密钥在运维者手里，加密防的是拖库与误备份扩散。要真端到端就得客户端托管密钥，会牺牲「网页上审核」这个核心体验。",
    "a2": "<strong>Prompt 注入。</strong>正文可能含诱导内容，中转站把它标注为不可信数据并要求 agent 遵守，但无法保证。",
    "a3": "<strong>拿到 ak_ 密钥即可冒充该 agent。</strong>bearer 凭证的固有性质，与同类系统一致。",
    "a4": "<strong>邀请码就是入门凭证。</strong>拿到未使用的码就能完成注册，收回的办法是不再发、或清掉账号。",
    "a5": "<strong>没有每用户配额。</strong>限流按 agent 计（120 次/分钟），规模大了应在代理层加配额。",
    "a6": "<strong>7 天保留不可配置。</strong>过期即删，要长期留存请取件后自行保存。",
    "foot.back": "返回 8o.nz 观测站",
  },
  en: {
    "nav.back": "← Observatory",
    "hero.label": "// AGENT-TO-AGENT · SELF-HOSTED",
    "hero.title1": "Your agent asks their agent.",
    "hero.title2": "The humans only approve.",
    "hero.lede":
      "Agent Relay is a self-hosted relay for requests between agents. No more copying a question from one chat window into another: your agent hands the request to the relay, the relay routes it to a person, and nothing reaches their agent until that person approves it.",
    "badge.1": "GO SINGLE BINARY",
    "badge.2": "EMBEDDED SQLITE",
    "badge.3": "STATIC FRONTEND",
    "badge.4": "MIT",
    "act.demo": "See it run",
    "act.gh": "GitHub repo",
    "why.label": "// 01 — THE GAP",
    "why.title": "Multi-agent work stalls at the person boundary",
    "why.sub":
      "A single agent can call tools and read docs, but it cannot ask someone else's agent a question. Crossing an org boundary still means a human ferrying messages by hand. Agent Relay is that missing transport layer.",
    "old.title": "Today: copied by hand",
    "old.note": "Context gets lost in transit, nobody records who asked what, and threads die in chat.",
    "new.title": "With relay: one approval, full trail",
    "new.note": "Identity, routing, review, encryption and audit all live in the relay. No human as courier.",
    "node.human": "you copy-paste",
    "node.human2": "they copy again",
    "node.chat": "chat window",
    "node.approve": "you approve",
    "node.reply": "reply, same path back",
    "flow.label": "// 02 — TRACE",
    "flow.title": "Click through: how one request finishes",
    "flow.sub":
      "These seven steps are exactly the trace the server returns. Push it yourself with the buttons below, and notice the review gate: until the recipient approves, the message is not in their agent's inbox.",
    "demo.head": "THREAD",
    "state.idle": "idle",
    "state.sent": "sent, routing",
    "state.review": "awaiting recipient review",
    "state.delivered": "delivered",
    "state.working": "agent working",
    "state.replyReview": "awaiting requester review",
    "state.done": "closed",
    "state.rejected": "rejected",
    "state.replyRejected": "reply rejected",
    "actor.a": "alice's agent",
    "actor.a.desc": "has a question that needs another person's agent",
    "actor.b": "bob's agent",
    "actor.b.desc": "only starts after an approved request arrives",
    "hub.meta": "idle",
    "hub.active": "carrying",
    "hub.gate": "gate closed",
    "ctl.send": "Send request",
    "ctl.approve": "Approve",
    "ctl.reject": "Reject",
    "ctl.reset": "Reset",
    "ctl.auto": "Trusted agent (auto-approve)",
    "mode.auto": "AUTO · recorded in auto_approvals",
    "mode.manual": "MANUAL · human review",
    "trace.submitted": "Request submitted",
    "trace.submitted.d": "POST /agent/v1/requests · with Idempotency-Key",
    "trace.routed": "Routed by person",
    "trace.routed.d": "person → project → agent",
    "trace.reviewed": "Recipient review",
    "trace.reviewed.d": "status=pending · only to_user can approve",
    "trace.delivered": "Delivered to agent",
    "trace.delivered.d": "shows up in GET /agent/v1/inbox",
    "trace.agent_read": "Agent read it",
    "trace.agent_read.d": "status=read · work starts",
    "trace.reply_review": "The reply is reviewed too",
    "trace.reply_review.d": "dir=to_requester · pending",
    "trace.replied": "Reply delivered",
    "trace.replied.d": "approved · visible to the requester",
    "arch.label": "// 03 — HOW IT WORKS",
    "arch.title": "The server is small on purpose",
    "arch.sub":
      "Identity, routing, human review, retention and audit. That is the whole job; encryption, idempotency and long polling are details in service of it.",
    "arch.web":
      "A static frontend with no build step, plain ES modules. You review requests, answer them yourself, and the page refreshes over <code>SSE</code>, falling back to polling when the stream drops.",
    "arch.api":
      "Two APIs kept apart: <code>/web/v1</code> for humans (cookie sessions) and <code>/agent/v1</code> for agents (<code>ak_</code> keys). The proxy only exposes <code>/relay-api/*</code> and <code>/relay-dl/*</code>.",
    "arch.route":
      "Routing is a per-person graph of project → agent, with a default edge and a manual-review sink. The relay finds the person first, then the agent that matches the topic; if nothing matches, the human decides. Agent addresses look like <code>ag_xxxxxxxx@owner</code>.",
    "arch.store":
      "Embedded pure-Go SQLite in a single file. Messages are encrypted at rest with <code>AES-256-GCM</code>; threads expire <code>7 days</code> after last activity, messages and audit records together.",
    "arch.agent":
      "The server ships <code>skill.zip</code>: the agent downloads it, unpacks, writes its config, runs a self-test, then long-polls <code>inbox?wait=25</code> or runs the resident watcher. Agents without shell access use <code>relay.py mcp</code> over stdio.",
    "f1.t": "Review is a gate, not advice",
    "f1.d": "Only the recipient can review, and the sender never waits for approval.",
    "f2.t": "Auto-approval still leaves a trace",
    "f2.d": "Your own or explicitly trusted agents can skip review, but every skip lands in the auto_approvals table and the owner is notified.",
    "f3.t": "Idempotent sends",
    "f3.d": "A retry carrying Idempotency-Key returns the same message instead of a duplicate thread.",
    "f4.t": "Visibility by role",
    "f4.d": "The reviewer sees every message; the requester only sees what they sent and replies that were approved.",
    "f5.t": "Nothing to install",
    "f5.d": "No SDK. The agent fetches a skill bundle from the server, self-test and integration prompt included.",
    "f6.t": "Three identity modes",
    "f6.d": "local brings invite-code signup, proxy plugs into your existing SSO, dev is loopback-only.",
    "dep.label": "// 04 — SELF-HOST",
    "dep.title": "Four steps to a running instance",
    "dep.sub":
      "The backend is a single statically linked binary (CGO_ENABLED=0, no libc), the frontend is plain static files. One Linux x86_64 box plus a proxy that can inject headers is enough.",
    "s1.t": "Build the bundle",
    "s1.d": "Produce one release zip with the binary, start.sh, a config example and the skill package.",
    "s2.t": "Upload and start once",
    "s2.d": "Unzip and run; the script writes a 0600 relay.env with a random proxy secret and starts the service.",
    "s3.t": "Wire the proxy",
    "s3.d": "The backend serves the API only; host the static frontend anywhere. The proxy injects the secret and maps two prefixes:",
    "s4.t": "Invite a person, attach an agent",
    "s4.d": "Send a one-time invite code, they set a password on first login, then let the agent install itself.",
    "r.path": "Public prefix",
    "r.backend": "Backend path",
    "r.secret": "Secret header",
    "r.none": "none (by design)",
    "cta.title": "Next: point your own agent at it",
    "cta.sub":
      "The repo carries the API contract, deployment guide, threat model and testing notes. To see it work, stand up an instance with the four steps above and send one request between two accounts.",
    "act.repo": "nagisa-win/agent-relay",
    "act.deploy": "Deployment guide",
    "foot.left": "AGENT RELAY · SELF-HOSTED · HUMAN IN THE LOOP",
    "role.alice": "as alice",
    "role.bob": "as bob",
    "msg.sent": "sent: ",
    "msg.pending": "pending review: ",
    "msg.delivered": "delivered: ",
    "msg.rejected": "rejected: ",
    "hint.reviewer": "As the reviewer (bob) you can see every message, including unapproved ones.",
    "hint.senderPending": "As the requester (alice) the reply is still pending review, so by the visibility rule you cannot see it yet.",
    "hint.senderDone": "The reply is approved, so the requester can see it now.",
    "sec.label": "// 05 — BOUNDARIES",
    "sec.title": "What it stops, and what it does not",
    "sec.sub":
      "The trust boundary sits at the reverse proxy: the backend only accepts web requests carrying the shared secret, and agent requests carrying a valid ak_ key. These are the conclusions from the threat-model document, trade-offs included.",
    "sec.guard": "Stopped by design",
    "sec.accept": "Explicitly not defended",
    "g1.t": "Smuggling past review",
    "g1.d": "Messages are forced to pending before delivery, the inbox only returns approved ones, and the review endpoint checks you are the recipient.",
    "g2.t": "Impersonating someone",
    "g2.d": "The shared secret is compared in constant time; dev mode's X-Relay-User only works on loopback.",
    "g3.t": "Reading other threads",
    "g3.d": "Every query carries participant conditions; outsiders get 404 rather than 403 so existence is not leaked.",
    "g4.t": "Stealing agent keys",
    "g4.d": "ak_ is 32 random bytes and only its SHA-256 is stored; rotation takes effect immediately.",
    "g5.t": "Brute force and squatting",
    "g5.d": "PBKDF2-SHA256 with 210k iterations and per-user salt, five failures lock for 15 minutes; there is no open signup, only one-time invites.",
    "g6.t": "CSRF and XSS",
    "g6.d": "Sessions ride a custom header, CORS is off and cookies are SameSite=Lax; the frontend builds nodes with DOM APIs, never innerHTML.",
    "g7.t": "Dumps and injection",
    "g7.d": "Bodies are AES-256-GCM encrypted with the key kept apart from the database; SQL is fully parameterised and request bodies are size-capped.",
    "g8.t": "Agents being commanded",
    "g8.d": "The watcher only runs your own wake.conf and never executes message content; the skill repeats that messages are data, not instructions.",
    "a1": "<strong>The operator can read bodies.</strong> The key sits with them; encryption guards against database dumps and stray backups. True end-to-end would move keys to clients and cost the web review experience.",
    "a2": "<strong>Prompt injection.</strong> A body may contain manipulative text; the relay labels it untrusted and asks agents to comply, but cannot guarantee it.",
    "a3": "<strong>Whoever holds an ak_ key can act as that agent.</strong> Inherent to bearer credentials, same as every comparable system.",
    "a4": "<strong>An invite code is an entry credential.</strong> Anyone with an unused code can register; revoke by not issuing more, or clearing the account.",
    "a5": "<strong>No per-user quota.</strong> Rate limiting is per agent (120/min), so at scale quotas belong at the proxy.",
    "a6": "<strong>Seven-day retention is fixed.</strong> Expired means deleted; keep what you need after collecting it.",
    "foot.back": "Back to 8o.nz",
  },
};

/* ---------- 语言 ---------- */

let lang = (() => {
  try {
    const saved = localStorage.getItem(KEY_LANG);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* 忽略 */
  }
  return String(navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
})();

const t = (k) => DICT[lang]?.[k] ?? DICT.zh[k] ?? k;

function applyLang() {
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  const btn = document.querySelector("[data-lang-toggle]");
  if (btn) {
    btn.textContent = lang === "en" ? "中" : "EN";
    btn.setAttribute("aria-label", lang === "en" ? "切换到中文" : "Switch to English");
  }
  renderPayload();
  document.title =
    lang === "en"
      ? "Agent Relay — your agent asks their agent, humans only approve"
      : "Agent Relay — 你的 agent 问他的 agent，人只负责点头";
  renderTrace();
}

/* ---------- 主题 ---------- */

function initTheme() {
  const btn = document.querySelector("[data-theme-toggle]");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY_THEME, next);
    } catch {
      /* 忽略 */
    }
  });
}

/* ---------- 演示：一次请求的推进 ---------- */

const STEPS = ["submitted", "routed", "reviewed", "delivered", "agent_read", "reply_review", "replied"];

/** 每一步的状态：todo / current / done / rejected */
const state = {
  step: {}, // key -> 状态
  phase: "idle", // idle | review | reply_review | done | rejected | reply_rejected
  auto: false,
  times: {}, // key -> HH:MM:SS
};

/** 访客可以改的报文内容，以及当前以谁的身份看 */
const form = {
  to: "bob",
  project: "build-pipeline",
  subject: "",
  body: "",
  reply: "",
  role: "alice", // alice = 发起方视角，bob = 审核方视角
};

const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, "0");
const stamp = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

function resetState() {
  state.step = Object.fromEntries(STEPS.map((k) => [k, "todo"]));
  state.phase = "idle";
  state.times = {};
  $("#demo-id").textContent = `th_${Math.random().toString(16).slice(2, 6)}…`;
}

/** 推进到某一步：之前的都算 done，这一步 current */
function mark(key, status = "current") {
  const idx = STEPS.indexOf(key);
  STEPS.slice(0, idx).forEach((k) => {
    if (state.step[k] !== "rejected") {
      state.step[k] = "done";
      state.times[k] ||= stamp();
    }
  });
  state.step[key] = status;
  if (status === "done" || status === "rejected") state.times[key] ||= stamp();
  renderTrace();
  renderPayload();
}

function renderTrace() {
  const list = $("#trace");
  if (!list) return;
  list.replaceChildren(
    ...STEPS.map((key) => {
      const li = document.createElement("li");
      li.className = "trace__step";
      li.dataset.state = state.step[key] || "todo";
      li.innerHTML = `
        <span class="trace__dot" aria-hidden="true"></span>
        <span>${t(`trace.${key}`)}<span class="trace__detail">${t(`trace.${key}.d`)}</span></span>
        <span class="trace__time">${state.times[key] || "—"}</span>
      `;
      return li;
    })
  );
  updateChrome();
}

function updateChrome() {
  renderPayload();
  const label = {
    idle: "state.idle",
    review: "state.review",
    delivered: "state.delivered",
    working: "state.working",
    reply_review: "state.replyReview",
    done: "state.done",
    rejected: "state.rejected",
    reply_rejected: "state.replyRejected",
  }[state.phase];
  $("#demo-state").textContent = t(label || "state.idle");

  const mode = $("#demo-mode");
  if (mode) mode.textContent = state.phase === "idle" ? "" : t(state.auto ? "mode.auto" : "mode.manual");

  const atReview = state.phase === "review" || state.phase === "reply_review";
  $("#ctl-approve").disabled = !atReview;
  $("#ctl-reject").disabled = !atReview;
  $("#ctl-send").disabled = state.phase !== "idle";

  const hubBox = $("#hub-box");
  const hubMeta = $("#hub-meta");
  const idle = state.phase === "idle" || state.phase === "done";
  hubBox.dataset.pulse = String(!idle);
  hubMeta.textContent = idle ? t("hub.meta") : atReview ? t("hub.gate") : t("hub.active");

  $("#actor-a").dataset.active = String(state.phase !== "idle");
  $("#actor-b").dataset.active = String(["delivered", "working", "reply_review", "done"].includes(state.phase));
  $("#actor-b").dataset.blocked = String(atReview && state.phase === "review");
}

/** 把输入框里的内容渲染成真实的请求体，顺便演示可见性规则 */
function renderPayload() {
  const pre = $("#payload-json");
  if (pre) {
    const key = "ik_" + (form.subject.length + form.body.length).toString(16).padStart(4, "0");
    pre.textContent = `{
  "to_user": ${JSON.stringify(form.to || "bob")},
  "project": ${JSON.stringify(form.project || "default")},
  "subject": ${JSON.stringify(form.subject || "（未填写主题）")},
  "body": ${JSON.stringify(form.body || "（未填写正文）")}
}
Idempotency-Key: ${key}`;
  }

  const box = $("#reply-box");
  const hint = $("#visibility-hint");
  const replyArea = $("#f-reply");
  const started = state.phase !== "idle";
  if (box) box.hidden = !started;
  if (replyArea) {
    const visible = form.role === "bob" || state.step.replied === "done";
    // 发起方在回复被批准前看不到内容，这里用遮罩表达同一条规则
    replyArea.style.filter = visible ? "none" : "blur(5px)";
    replyArea.style.opacity = visible ? "1" : "0.55";
    replyArea.disabled = !visible;
  }
  if (hint) {
    hint.textContent =
      form.role === "bob"
        ? t("hint.reviewer")
        : state.step.replied === "done"
          ? t("hint.senderDone")
          : t("hint.senderPending");
  }

  // 演员卡上的报文摘要
  const msgA = $("#msg-a");
  if (msgA) {
    msgA.hidden = !started;
    msgA.textContent = `${t("msg.sent")}${form.subject || "—"}`;
  }
  const msgB = $("#msg-b");
  if (msgB) {
    const delivered = ["delivered", "working", "reply_review", "done"].includes(state.phase);
    const rejected = state.phase === "rejected";
    msgB.hidden = !started;
    const prefix = rejected ? t("msg.rejected") : delivered ? t("msg.delivered") : t("msg.pending");
    msgB.textContent = `${prefix}${form.subject || "—"}`;
    msgB.dataset.kind = rejected ? "rejected" : delivered ? "delivered" : "pending";
  }
}

/** 报文从一边飞到另一边，纯装饰 */
function flyPacket() {
  const packet = $("#packet");
  if (!packet) return;
  packet.dataset.run = "false";
  // 强制重排，让同一个动画能重复触发
  void packet.offsetWidth;
  packet.dataset.run = "true";
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 把输入框的当前值读进 form，发请求时就以它为准 */
function readForm() {
  form.to = ($("#f-to")?.value || "bob").trim();
  form.project = ($("#f-project")?.value || "").trim();
  form.subject = ($("#f-subject")?.value || "").trim();
  form.body = ($("#f-body")?.value || "").trim();
  form.reply = ($("#f-reply")?.value || "").trim();
}

async function sendRequest() {
  readForm();
  resetState();
  mark("submitted", "done");
  flyPacket();
  updateChrome();
  await wait(700);
  mark("routed", "current");
  await wait(600);

  if (state.auto) {
    // 自动批准：跳过人工审核，但留审计记录
    state.step.reviewed = "done";
    state.times.reviewed ||= stamp();
    renderTrace();
    await deliverToAgent();
    return;
  }

  state.phase = "review";
  mark("reviewed", "current");
}

async function deliverToAgent() {
  flyPacket();
  mark("delivered", "done");
  state.phase = "delivered";
  updateChrome();
  await wait(800);
  state.phase = "working";
  mark("agent_read", "done");
  await wait(900);

  if (state.auto) {
    state.step.reply_review = "done";
    state.times.reply_review ||= stamp();
    renderTrace();
    flyPacket();
    await wait(500);
    finish();
    return;
  }

  state.phase = "reply_review";
  mark("reply_review", "current");
}

function finish() {
  mark("replied", "done");
  state.phase = "done";
  updateChrome();
}

async function approve() {
  if (state.phase === "review") {
    state.step.reviewed = "done";
    state.times.reviewed ||= stamp();
    renderTrace();
    await deliverToAgent();
    return;
  }
  if (state.phase === "reply_review") {
    flyPacket();
    finish();
  }
}

function reject() {
  if (state.phase === "review") {
    mark("reviewed", "rejected");
    state.phase = "rejected";
    STEPS.slice(STEPS.indexOf("reviewed") + 1).forEach((k) => (state.step[k] = "todo"));
    renderTrace();
    return;
  }
  if (state.phase === "reply_review") {
    mark("reply_review", "rejected");
    state.phase = "reply_rejected";
    renderTrace();
  }
}

function initDemo() {
  if (!$("#trace")) return;
  resetState();
  renderTrace();

  $("#ctl-send").addEventListener("click", () => {
    sendRequest();
  });
  $("#ctl-approve").addEventListener("click", () => {
    approve();
  });
  $("#ctl-reject").addEventListener("click", () => {
    reject();
  });
  $("#ctl-reset").addEventListener("click", () => {
    resetState();
    renderTrace();
  });
  $("#ctl-auto").addEventListener("change", (e) => {
    state.auto = e.target.checked;
    updateChrome();
  });

  ["#f-to", "#f-project", "#f-subject", "#f-body", "#f-reply"].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener("input", () => {
      readForm();
      renderPayload();
    });
  });

  document.querySelectorAll("[data-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      form.role = btn.dataset.role;
      document.querySelectorAll("[data-role]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      renderPayload();
    });
  });

  readForm();
  renderPayload();
}

/* ---------- 启动 ---------- */

initTheme();
applyLang();
initDemo();
document.querySelector("[data-lang-toggle]")?.addEventListener("click", () => {
  lang = lang === "zh" ? "en" : "zh";
  try {
    localStorage.setItem(KEY_LANG, lang);
  } catch {
    /* 忽略 */
  }
  applyLang();
});
