# vii.ink-admin

[vii.ink](https://vii.ink) 博客的独立管理后台。基于 SvelteKit + Cloudflare Workers，部署在 `vii.ink`，访问路径 `/admin`。

## 功能概览

- **仪表盘** — 评论数、文章数、图片存储量统计 + 服务健康概览
- **文章管理** — essay / bits / memo 三类内容的 Markdown 编辑器（快捷键、拖拽上传、frontmatter 表单）
- **评论管理** — Waline 评论镜像，审核 / 删除 / AI 辅助判定
- **图片管理** — R2 图片浏览、上传、可选 WebP 转换 + 水印
- **AI 能力** — 文章润色（流式输出）、frontmatter 元数据补全、评论审核（Cloudflare Workers AI）
- **定时发布** — 每 15 分钟检查到期文章，自动触发主站 GitHub Actions 重建
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
