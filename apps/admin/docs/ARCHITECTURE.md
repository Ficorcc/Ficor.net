# 架构设计

## 三层架构

```
┌─────────────────────────────────────────────────────┐
│  管理界面层（SvelteKit 渲染，部署在 Workers）        │
│  /admin/dashboard  /content  /comments  /images    │
│  /settings  /schedules  /audit  /health             │
├─────────────────────────────────────────────────────┤
│  API 层（单一入口 /admin/api/[...event]）          │
│  event 字段分发：CONTENT_SAVE / AI_POLISH / ...     │
│  中间件链：鉴权 → CSRF → 限流 → 审计                │
├─────────────────────────────────────────────────────┤
│  数据层                                             │
│  D1：评论/配置/会话/定时任务/审计/限流/统计          │
│  R2：Markdown 文章 / 图片 / 备份包                   │
│  Workers AI：润色/元数据/审核                        │
└─────────────────────────────────────────────────────┘
```

## 单一 API 入口

所有写操作走同一个端点 `/admin/api/[...event]`，请求体中带 `event` 字段标识操作类型：

```
POST /admin/api/CONTENT_SAVE
{ "event": "CONTENT_SAVE", "collection": "essay", "slug": "hello", "frontmatter": {...}, "body": "..." }
```

### 事件清单

| 事件 | 说明 | 鉴权 | CSRF |
|---|---|---|---|
| `AUTH_LOGIN` / `AUTH_LOGOUT` | 登录 / 登出 | — | — |
| `CSRF_ISSUE` | 颁发/轮换 CSRF token | ✓ | — |
| `COMMENT_SUBMIT` | 公开提交评论（主站调用） | — | — |
| `COMMENT_MODERATE` / `COMMENT_DELETE` | 审核 / 删除评论 | ✓ | ✓ |
| `CONTENT_LIST` / `CONTENT_GET` | 列表 / 读取文章 | ✓ | — |
| `CONTENT_SAVE` / `CONTENT_DELETE` | 保存 / 删除文章 | ✓ | ✓ |
| `CONTENT_SEARCH` | 全文搜索 | ✓ | — |
| `CONTENT_PUBLISH` | 手动触发主站部署 | ✓ | ✓ |
| `IMAGE_LIST` / `IMAGE_UPLOAD` / `IMAGE_DELETE` | 图片管理 | ✓ | upload/delete 需 CSRF |
| `AI_POLISH` / `AI_METADATA` / `AI_MODERATE` | AI 能力 | ✓ | ✓ |
| `SCHEDULE_CREATE` / `SCHEDULE_CANCEL` | 定时发布 | ✓ | ✓ |
| `CONFIG_GET` / `CONFIG_UPDATE` | 系统配置 | ✓ | update 需 CSRF |
| `AUDIT_LIST` | 审计日志查询 | ✓ | — |
| `HEALTH_CHECK` | 健康检查 | ✓ | — |

## 中间件链（hooks.server.ts）

```
请求进入
   │
   ├─ 提取 IP（CF-Connecting-IP）
   ├─ 限流检查（D1 ratelimit 表，IP + 时间窗口）
   │    └ 超限 → 429
   ├─ 会话解析（cookie → DB sessions 表）
   ├─ 路由守卫
   │    ├ 公开路径（/login, /api/COMMENT_SUBMIT）→ 放行
   │    ├ 已登录 → 注入 locals.session
   │    └ 未登录且访问受保护路径 → 401（API）或重定向（页面）
   └─ 放行到路由 handler
        │
        └ handler 内部（仅 mutation）：
           ├─ CSRF 校验（header token == DB token）
           ├─ 执行业务逻辑
           └─ 审计记录（敏感操作）
```

## 鉴权设计

### 会话流程
```
登录请求（密码）
   │
   ├─ 校验密码（常量时间比较 + PBKDF2）
   ├─ 生成 UUID token → 写 sessions 表 + httpOnly cookie
   ├─ 生成 CSRF token → 写 sessions 表 + 可读 cookie
   └─ 审计记录 AUTH_LOGIN

后续请求
   ├─ cookie 带 token → 查 sessions 表 → 有效则注入 locals.session
   ├─ 滑动续期：剩余寿命 < 一半时延长 expires_at
   └─ 定期清理过期会话（2% 概率，best-effort）
```

### Cookie 策略
| Cookie | httpOnly | 用途 |
|---|---|---|
| `admin_session` | ✓ | 会话 token，JS 不可读，防 XSS |
| `admin_csrf` | ✗ | CSRF token，JS 读取后放入请求头 |

均为 `Secure` + `SameSite=Lax` + `path=/admin`。

### CSRF 防护
双重提交模式：
1. 登录时 CSRF token 写入 cookie（可读）+ DB
2. 前端 JS 从 cookie 读取，在每个 mutation 请求头 `X-CSRF-Token` 携带
3. 服务端比对 header token 与 DB 中当前会话绑定的 token

## 内容存储（R2）

```
R2 bucket
├── content/
│   ├── essay/<slug>.md       # 长文
│   ├── bits/<timestamp>.md   # 短动态/絮语
│   └── memo/index.md         # 小记
├── images/
│   └── uploads/<YYYY>/<MM>/<hash>.webp
├── backups/
│   └── 2026-07-12.tar.gz     # 每日备份
└── config/
    └── watermark.png         # 水印图片
```

### 保存流程
```
CONTENT_SAVE
   ├─ Zod schema 校验 frontmatter（复刻主站 content.config.ts）
   ├─ 组装 Markdown（YAML frontmatter + body）
   ├─ 写入 R2 content/<collection>/<slug>.md
   ├─ 审计记录 CONTENT_SAVE
   └─ 可选：触发 GitHub Actions 重建主站
```

### 全文搜索
遍历 R2 `content/` 前缀所有对象 → 读取正文 → 关键词匹配 → 返回标题 + 摘要片段。文章量在百级以内时性能足够。

## AI 能力

### 模型路由
模型名存在 `config.ai.model`，默认 `@cf/qwen/qwen1.5-14b-chat-aliyun`。在「系统设置」可切换为 Llama / DeepSeek 等 Workers AI 支持的模型。

### 润色（流式）
```
前端 POST /admin/api/AI_POLISH { text }
   ├─ Workers AI: ai.run(model, { stream: true, messages: [...] })
   ├─ ReadableStream 逐 token
   └─ SSE 推送前端（text/event-stream）
前端 EventSource 实时渲染
```

### 元数据补全
```
AI_METADATA { content }
   ├─ 拼接 system prompt + 文章内容
   ├─ Workers AI 返回 JSON { title, description, tags, date }
   └─ 前端填入 frontmatter 表单供确认
```

## 定时发布

```
wrangler cron */15 * * * *
   │
   ▼
scheduled() → 查询 schedules 表 WHERE status='pending' AND scheduled_at <= now
   │
   对每个到期任务：
   ├─ 原子抢占：UPDATE SET status='running' WHERE id=? AND status='pending' RETURNING *
   │    └ 抢占失败（已被其他实例处理）→ 跳过
   ├─ 触发 GitHub Actions 重建主站
   ├─ 成功 → markDone(id)
   └─ 失败 → markFailed(id, error)
```

并发锁保证多个 Worker 实例同时被 cron 触发时不会重复处理。

## 数据备份

```
wrangler cron 0 19 * * *（UTC 19:00 = 北京 03:00）
   │
   ├─ 查询各表全量数据（comments / config / schedules / audit / ratelimit / stats / sessions）
   ├─ 序列化为 JSON
   ├─ 打包（或直接逐文件存）
   ├─ 写入 R2 backups/<YYYY-MM-DD>.json
   ├─ 清理 30 天前的备份
   └─ best-effort：失败仅记审计 warn，不影响运行
```

## 安全设计

| 威胁 | 防护 |
|---|---|
| 未授权访问 | 会话守卫（cookie + DB 校验） |
| 跨站请求伪造 | CSRF 双重提交 token |
| 暴力破解 | D1 分布式限流（IP + 时间窗口） |
| 密码泄露 | PBKDF2 哈希，常量时间比较 |
| 会话劫持 | httpOnly + Secure + SameSite=Lax cookie |
| 操作抵赖 | 审计日志（删除/配置变更/登入登出全程记录） |
| XSS | Markdown 渲染时 sanitize（主站已处理），后台输入不直接注入 DOM |

## 设计系统

完整复刻主站 `vii.ink` 的视觉语言，详见 `src/app.css`：
- 色板：暖白纸感 `#fffefc` + stone 暖灰 + 中国红 `#b91c1c`
- 字体：Noto Serif SC（宋体正文）+ LXGW WenKai Lite（楷体辅助）
- 暗色模式：`data-theme` 属性 + 防闪烁内联脚本
- 组件风格：卡片 hover 显底、分段控件浮雕、柔光阴影仅用于浮层
