# 8O Observatory

`8o.nz` 站点矩阵的源码：一个门户、一个实验室、若干工具站，以及支撑它们的边缘服务。

线上入口：<https://8o.nz/>

## 站点

| 子域 | 内容 | 落地方式 |
| --- | --- | --- |
| `8o.nz` | 观测站门户：站点目录、开源档案、动态流 | Cloudflare Worker（静态资源 + `/api/*`） |
| `www.8o.nz` | 个人说明书（Cyberpunk 2077 风格） | 独立仓库，GitHub Pages |
| `lab.8o.nz` | Web 实验室：模型舱、安全舱 | Cloudflare Worker（静态资源） |
| `skills.8o.nz` | 技能包落地页 | Cloudflare Worker（静态资源） |
| `status.8o.nz` | 站点状态与历史曲线 | Cloudflare Worker（Cron + KV） |
| `api.8o.nz` | 边缘接口 | 与门户同一个 Worker |
| `mermaid.8o.nz` / `calc.8o.nz` | 两个工具站 | 各自仓库的 GitHub Pages |

## 目录

```
sites/
  hub/      门户（零依赖 ES module + 原生 CSS）
  lab/      实验室外壳与按需加载的模块
  skills/   技能包落地页
workers/
  portal/   门户静态资源 + /api/* 接口
  status/   Cron 巡检与状态页
  static/   纯静态站点复用的 worker
packages/tokens/8o.css   全站共用的设计 token
scripts/build.mjs        把 sites/ 与 packages/ 组装成 dist/
tools/                   本地校验脚本（截图、控制台、体积检查）
```

## 本地开发

```bash
npm install
npm run build          # 产出 dist/hub、dist/skills、dist/lab
npm run dev            # 本地静态预览（8765 端口）
npm run deploy:hub     # 构建并发布门户与 api
npm run deploy:status  # 发布巡检 worker
npm run deploy:skills
npm run deploy:lab
```

发布需要 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` 两个环境变量，CI 里用仓库 secrets 注入。

## 边缘接口

| 路径 | 说明 |
| --- | --- |
| `/api/health` | 健康检查 |
| `/api/projects` · `/api/feed` | 仓库数据与动态流（静态快照，由 profile 仓库的 Actions 生成） |
| `/api/status` | 各子域状态（读巡检 worker 写的 KV） |
| `/api/dns?name=&type=` | DoH 解析 |
| `/api/cert?host=` | 证书透明日志查询 |
| `/api/probe?host=&port=` | 常用端口探测，白名单端口、3 秒超时、每 IP 每小时 20 次 |

## 几条刻意的取舍

- **不使用框架**：门户与工具站是原生 ES module + 原生 CSS，省掉构建步骤，首屏只有十几 KB。
- **数据在构建期落盘**：仓库 star、动态流这类数据由上游 Actions 生成静态 JSON，边缘只做分发，不在请求里打第三方接口。
- **探测有边界**：`/api/probe` 只放行 22/80/443/3306/5432/6379/8080/8443/9999，拒绝私网地址，按来源 IP 限速；不做端口扫描与漏洞探测。
- **视觉同源**：所有子站引用 `packages/tokens/8o.css`，只在强调色上区分舱段。

## 许可

代码 MIT。第三方素材、字体与数据版权归各自权利人。

## 实验室舱段

| 舱段 | 能力 | 依赖 |
| --- | --- | --- |
| 模型舱 | 画布上自建数据集，手写反向传播训练两层感知机，决策边界与损失曲线实时刷新 | 无（纯 JS） |
| 安全舱 | JWT 解析验签、WebCrypto 哈希与 PBKDF2、HIBP k-匿名、DoH / CT / 受限端口探测 | WebCrypto + `api.8o.nz` |
| 数据舱 | 拖入 `.heapsnapshot` 在 Worker 里解析：按类型聚合自占用、Top 节点、detached、重复字符串 | Web Worker |
| 设备舱 | WebUSB 直连安卓：CNXN 握手、现场生成 RSA 密钥完成 AUTH、执行 shell 命令 | WebUSB（Chrome / Edge 桌面端） |
| 连接舱 | WebRTC DataChannel 点对点传文件，信令手动复制粘贴；含本机回环自检 | WebRTC |

ADB 协议层（`sites/lab/assets/adb.js`）与 DOM 无关，可单测：

```bash
node tools/test-adb.mjs   # 包编解码 / adbkey.pub 结构 / 签名长度与验签
```
