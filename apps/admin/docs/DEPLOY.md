# 部署指南

## 部署到 Cloudflare Workers

### 1. 完成本地配置

按 [SETUP.md](./SETUP.md) 完成 D1/R2 创建、密钥设置。

### 2. 执行远程数据库迁移

```bash
npm run db:migrate:prod
```

### 3. 设置生产密钥

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put GITHUB_TOKEN
# 如果启用评论管理：
npx wrangler secret put COMMENT_IP_SALT
```

### 4. 构建并部署

```bash
npm run deploy
# 等价于：npm run build && wrangler deploy
```

部署成功后会输出 Worker 地址，如 `https://vii-ink-admin.<你的子域>.workers.dev`。

### 5. 绑定自定义域名（可选）

在 Cloudflare Dashboard：

1. **Workers & Pages** → 选择 `vii-ink-admin` → **Settings** → **Triggers** → **Routes**
2. 添加 `vii.ink/admin/*`
3. Cloudflare 会自动创建 DNS 记录和 SSL 证书

如果你希望访问路径严格是 `vii.ink/admin`，当前 `svelte.config.js` 已配置 `base: '/admin'`。

如果希望直接用独立子域（不带 /admin），修改 `svelte.config.js` 移除 `paths.base`，并同步修改 `hooks.server.ts` 和路由中的路径引用。

---

## 定时任务

`wrangler.toml` 配置了两条 cron：

| Cron | 用途 | 处理函数 |
|---|---|---|
| `*/15 * * * *` | 每 15 分钟检查定时发布任务 | `scheduled()` 中 `SCHEDULE` 事件 |
| `0 19 * * *` | 每天 UTC 19:00（北京 03:00）备份 D1 到 R2 | `scheduled()` 中 `BACKUP` 事件 |

部署后 cron 自动生效，无需额外配置。

---

## 本地预览构建产物

```bash
npm run build
npm run preview
# 访问 http://localhost:4173/admin
```

---

## 更新部署

代码修改后，重新执行：
```bash
npm run deploy
```

如果有新的 migration 文件：
```bash
npm run db:migrate:prod
```

---

## 与 Astro 主站整合

后台在线地址建议保持为：

```text
https://vii.ink/admin
```

主站 Astro 的生产 `/admin/` 可作为这个在线后台的入口。后台可以通过 `GITHUB_TOKEN` 抓取主站仓库里的 `src/content/<collection>/*.md` 到 R2；后台保存文章后会写入 R2 的 `content/` 前缀，主题设置会写入 `settings/` 前缀，说说/友链/订阅会写入 `data/` 前缀，并通过 `GITHUB_TOKEN` 触发主站 GitHub Actions 重建；主站构建前需要同步 R2 内容到 `src/content/`，同步主题设置到 `src/data/settings/`，同步后台数据到 `src/data/` 和 `src/config/`。

`GITHUB_TOKEN` 至少需要读取主站仓库 contents，并允许触发 Actions workflow。

主站由 **Cloudflare Pages** 的 Git 集成构建，构建命令是 `npm run build`：

```
sync-admin-r2-content.mjs  →  commit-admin-content.mjs  →  astro build
     R2 内容拉进仓库              把差异提交并推回 main        生成静态站
```

因此在 **Cloudflare Pages 的环境变量**里需要配置（完整清单见仓库根目录 `.env.example`，
机制说明见 [CONTENT-SYNC.md](./CONTENT-SYNC.md)）：

```bash
# 必需：让构建能读到后台写入的 R2 内容。缺任何一个都会静默跳过同步。
ADMIN_R2_ACCOUNT_ID=Cloudflare Account ID
ADMIN_R2_ACCESS_KEY_ID=R2 S3 Access Key
ADMIN_R2_SECRET_ACCESS_KEY=R2 S3 Secret
ADMIN_R2_BUCKET=admin-r2

# 必需：让构建把同步下来的内容提交回仓库，否则后台改动只在本次构建可见。
GITHUB_CONTENT_PUSH_TOKEN=GitHub fine-grained PAT（Contents: Read and write）

# 可选：前缀，默认值如下
ADMIN_R2_SETTINGS_PREFIX=settings/
ADMIN_R2_DATA_PREFIX=data/
```

> ⚠️ **不要在生产单独打开 `ADMIN_R2_SYNC_PRUNE=1`。**
> 打开后，仓库里存在、R2 里没有的文章（例如直接以 Markdown 提交进仓库的）
> 会被构建删除**并提交回 main**。而本地默认关闭 —— 两端行为就此分叉，
> 与「本地和部署后同一套逻辑」的目标相冲突。需要清理时用后台删除文章
> （会写墓碑，本地与生产都会生效），而不是靠 prune。

`commit-admin-content.mjs` 未配置 `GITHUB_CONTENT_PUSH_TOKEN` 时静默跳过，
所以「构建成功」并不代表内容回写生效了。可用下面的方式确认：

```bash
git log --format='%an | %s' | grep -i "vii-ink-bot"
# 有输出 → 回写通道在跑；一直为空 → 凭据没配或同步结果无变化
```

如果后台地址不是默认值，在主站构建环境设置：

```bash
ADMIN_CONSOLE_URL=https://vii.ink/admin
```

---

## 回滚

Cloudflare Workers 支持版本回滚：

```bash
npx wrangler deployments list    # 查看历史版本
npx wrangler deployments rollback  # 回滚到上一版本
```
