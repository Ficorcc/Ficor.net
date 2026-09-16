# vii.ink-admin

[vii.ink](https://vii.ink) 博客的独立管理后台。基于 SvelteKit + Cloudflare Workers，部署在 `vii.ink`，访问路径 `/admin`。

## 功能概览

- **仪表盘** — 评论数、文章数、图片存储量统计 + 服务健康概览
- **文章管理** — essay / bits / memo 三类内容的 Markdown 编辑器（快捷键、拖拽上传、frontmatter 表单）
- **评论管理** — 自写评论系统，审核 / 删除 / AI 辅助判定
- **图片管理** — R2 图片浏览、上传、可选 WebP 转换 + 水印
- **AI 能力** — 文章润色（流式输出）、frontmatter 元数据补全、评论审核（Cloudflare Workers AI）
- **发布计划** — 到期任务等待管理员一键部署，不再由 Cron 自动触发构建
- **系统设置** — 站点配置、AI 模型切换、限流/水印参数
- **审计日志** — 敏感操作全程记录
- **健康检查** — D1 / R2 / AI / 部署钩子逐项状态
- **数据备份** — 每天凌晨 3 点自动备份 D1 到 R2，保留 30 天

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | SvelteKit + @sveltejs/adapter-cloudflare |
| 数据库 | Cloudflare D1 |
| 存储 | Cloudflare R2 |
| AI | Cloudflare Workers AI |
| 图片处理 | Photon WASM |
| 部署触发 | GitHub Actions API |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量模板并填写
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入 ADMIN_PASSWORD 等

# 3. 初始化本地 D1 数据库
npx wrangler d1 create admin-db   # 创建数据库，记下 database_id
# 把 database_id 填入 wrangler.toml
npm run db:migrate                  # 执行建表

# 4. 启动开发服务器
npm run dev
# 访问 http://localhost:5173/admin
```

详细配置见 [docs/SETUP.md](./docs/SETUP.md)。

## 项目结构

```
src/
├── lib/
│   ├── server/          # 服务端逻辑（db / r2 / ai / auth / deploy）
│   ├── components/       # UI 组件（layout / ui / editor / dashboard）
│   ├── stores/           # Svelte stores（theme / toast / csrf）
│   └── utils/            # 工具函数（api / frontmatter / slug / date）
├── routes/
│   ├── login/  logout/   # 鉴权
│   ├── dashboard/        # 仪表盘
│   ├── content/          # 文章管理
│   ├── comments/         # 评论管理
│   ├── images/           # 图片管理
│   ├── settings/         # 系统设置
│   ├── schedules/        # 定时任务
│   ├── audit/            # 审计日志
│   ├── health/           # 健康检查
│   └── api/[...event]/   # 单一 API 入口
└── hooks.server.ts       # 中间件链（鉴权/CSRF/限流/审计）
```

架构设计详见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 部署

见 [docs/DEPLOY.md](./docs/DEPLOY.md)。

## 友链与友圈共享数据

- 后台友链、订阅及前台 `/links/`、`/friends/` 使用同一个读取服务。`data/links.json`（R2）是友链和 RSS 地址的唯一登记表；`data/feed.json` 只保存抓取结果。
- R2 对象尚不存在时，两端使用仓库 `src/data/links.ts`、`src/config/feed.json` 中的初始数据。已保存的空列表不会回退到旧数据。
- 在友链管理中填写 RSS 地址，点击「保存」。启用的友链显示在前台，有 RSS 地址的启用友链自动进入订阅。修改、停用或删除先保存到后台，点击仪表盘「一键部署」才发布到前台。
- 后台订阅页的「刷新」分批抓取 RSS、Atom 或 JSON Feed，每源保留最多 10 篇文章；抓取失败保留上次结果并提示失败数量。新订阅需先刷新文章，最后一键部署。
- `/admin/api/community` 是只读公开接口，仅输出公开站点信息、启用友链及文章；RSS 地址、诊断信息和后台字段不对外输出。写操作仍要求登录和 CSRF 校验。
- 前台先显示构建快照，再读取共享接口。接口故障时保留快照并显示提示。生产环境首次启用需要同时部署主站和 admin Worker；后续编辑可多次保存，完成后统一一键部署。
- 本地联调：同时运行 `npm run dev:admin`（默认 5173）和 `npm run dev`（默认 4321）。若后台换端口，为主站设置 `ADMIN_DEV_ORIGIN`。本地 R2 与线上存储隔离。

## 统一保存与部署

文章新建/编辑/草稿状态、说说、友链、订阅刷新和主题设置只写入后台记录，不再在保存接口调用部署钩子。旧客户端传入的 `deploy: true` 也会被忽略。唯一部署入口是仪表盘「一键部署」（`CONTENT_PUBLISH`），一次操作集中发布已保存的改动。

友链与友圈的公开接口读取 `published/community.json`，后台继续编辑 `data/links.json` 和 `data/feed.json`。部署请求受理后才更新公开版本；触发失败时保留原公开数据。首次没有公开版本时使用后台构建时的站点快照。部署受理不等于主站构建已经完成，文章和主题需等待构建完成后生效。

定时任务不再自动触发部署；到期记录在一键部署受理后标记为已提交部署。每日备份仍保持原有逻辑。草稿不会因为点击一键部署而自动转为公开文章，发布前请在文章编辑器中确认草稿状态。

构建过程中将 R2 内容回写仓库时，自动提交包含 `[CF-Pages-Skip]` 和 `[skip ci]`，避免同一批内容回写后再触发一次 Pages 部署或 GitHub 自动构建。正常代码提交不受影响。
