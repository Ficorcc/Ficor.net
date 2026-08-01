# 配置指南

本文档引导你完成所有 Cloudflare 资源的创建和配置。预计耗时 15-20 分钟。

## 前置条件

- Node.js >= 22
- Cloudflare 账号
- GitHub 账号（主站仓库的写权限）
- 已安装 wrangler CLI（`npm i -g wrangler` 或用 `npx wrangler`）

---

## 第 1 步：安装依赖

```bash
cd vii.ink-admin
npm install
```

---

## 第 2 步：创建 Cloudflare D1 数据库

```bash
npx wrangler d1 create admin-db
```

命令输出会包含 `database_id`，形如：
```
[[d1_databases]]
binding = "DB"
database_name = "admin-db"
database_id = "xxxx-xxxx-xxxx-xxxx"   ← 复制这个
```

**把 `database_id` 填入 `wrangler.toml`** 对应位置。

执行建表迁移：
```bash
npm run db:migrate        # 本地
npm run db:migrate:prod   # 远程（首次部署时执行）
```

---

## 第 3 步：创建 R2 存储桶

```bash
npx wrangler r2 bucket create admin-r2
```

桶名 `admin-r2` 已在 `wrangler.toml` 中配置。如要改名，同步修改 `wrangler.toml` 的 `bucket_name`。

R2 中会使用以下目录前缀：
- `content/essay/` `content/bits/` `content/memo/` — Markdown 文章
- `images/` — 上传的图片
- `backups/` — 每日备份包
- `config/` — 水印图片等配置文件

---

## 第 4 步：启用 Workers AI

Workers AI 通过 `wrangler.toml` 的 `[ai] binding = "AI"` 绑定，无需额外创建。

确保你的 Cloudflare 账号已启用 AI 功能（通常默认启用）。验证：
```bash
npx wrangler ai models list
```

默认使用模型 `@cf/qwen/qwen1.5-14b-chat-aliyun`（通义千问），可在后台「系统设置」切换为 Llama / DeepSeek 等。

---

## 第 5 步：配置 GitHub Token

1. 打开 https://github.com/settings/tokens
2. 生成 Fine-grained 或 Classic token，需要权限：
   - **repo**（或 Fine-grained 的 Contents: Read/Write + Actions: Read/Write）
3. 记下 token（`ghp_xxxx`）

用于：保存文章后触发主站仓库 `vii.ink` 的 GitHub Actions 重建。

---

## 第 6 步：设置密钥

### 本地开发

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`：
```ini
ADMIN_PASSWORD=你的管理密码         # 登录后台用，至少 8 位
GITHUB_TOKEN=ghp_xxx               # 上一步生成的
GITHUB_OWNER=Ficorcc               # 主站仓库 owner
GITHUB_REPO=Ficor.net              # 主站仓库名
GITHUB_WORKFLOW=ci.yml             # .github/workflows/ 下的部署文件（需启用 workflow_dispatch）
WALINE_TOKEN=                      # Waline 管理 token（如启用评论管理）
MEMOS_API_URL=                     # Memos 站点地址，例如 https://memos.example.com
MEMOS_ACCESS_TOKEN=                # Memos Access Token（公开实例可留空）
MEMOS_FILTER=                      # 可选，追加到 Memos 列表接口的查询串
```

### 生产环境

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put WALINE_TOKEN
npx wrangler secret put MEMOS_ACCESS_TOKEN
```

每条命令会提示输入值。

---

## 第 7 步：验证配置

```bash
npm run dev
```

打开 http://localhost:5173/admin ，应看到登录页。输入 `ADMIN_PASSWORD` 即可进入仪表盘。

---

## 配置项说明

以下配置存储在 D1 的 `config` 表中，可在后台「系统设置」页面修改：

| key | 说明 |
|---|---|
| `site` | 站点标题、描述、作者、URL |
| `ai` | AI 模型选择、各类提示词模板 |
| `ratelimit` | 限流阈值（通用 + 评论专用） |
| `watermark` | 水印开关、图片、位置、透明度、大小 |
| `deploy` | GitHub 部署配置（owner/repo/workflow） |
| `image` | 图片处理参数（自动 WebP、最大宽度、质量） |

初始值见 `migrations/0001_init.sql` 的 seed 部分。

---

## 常见问题

### Q: 本地开发时 D1/R2 未绑定？
开发时需要用 `wrangler dev` 或在 `vite.config.ts` 配置 platform-proxy 才能访问 CF 绑定。用 `npm run dev`（vite dev）时，hooks 会检测到无绑定并放行，但 API 调用会返回 503。要完整测试，用 `npx wrangler dev`。

### Q: 文章存在哪里？
主站 `vii.ink` 的文章在 Git 仓库 `src/content/` 下。admin 后台编辑的是 R2 中的副本（`content/` 前缀）。保存后通过 GitHub Actions 触发主站重新构建，主站构建时从 R2 拉取最新内容（需主站配置 R2 同步）或在 GitHub Actions 中从 R2 同步内容。

### Q: 如何修改会话有效期？
编辑 `wrangler.toml` 的 `[vars]` 下的 `SESSION_MAX_AGE_DAYS`，默认 7 天。
