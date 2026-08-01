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
npx wrangler secret put WALINE_TOKEN
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

主站构建环境需要配置：

```bash
ADMIN_R2_ACCOUNT_ID=Cloudflare Account ID
ADMIN_R2_ACCESS_KEY_ID=R2 S3 Access Key
ADMIN_R2_SECRET_ACCESS_KEY=R2 S3 Secret
ADMIN_R2_BUCKET=admin-r2
ADMIN_R2_SYNC_PRUNE=1
# 可选：默认 settings/
ADMIN_R2_SETTINGS_PREFIX=settings/
# 可选：默认 data/
ADMIN_R2_DATA_PREFIX=data/
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
