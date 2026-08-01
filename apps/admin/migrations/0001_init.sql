-- ============================================================================
-- vii.ink-admin D1 数据库初始化
-- 用法：wrangler d1 migrations apply admin-db --local （本地）
--       wrangler d1 migrations apply admin-db --remote（线上）
-- ============================================================================

-- --------------------------------------------------------------------------
-- sessions：登录会话
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,          -- 会话 UUID
  token       TEXT NOT NULL UNIQUE,      -- 鉴权 token（UUID），存 httpOnly cookie
  csrf_token  TEXT NOT NULL,             -- 当前绑定的 CSRF token
  ip          TEXT,
  ua          TEXT,
  created_at  TEXT NOT NULL,             -- ISO8601
  expires_at  TEXT NOT NULL,             -- ISO8601，7 天后过期
  last_seen_at TEXT NOT NULL             -- 最后活跃时间（用于滑动续期判断）
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- --------------------------------------------------------------------------
-- comments：评论（镜像主站 Waline 评论，供后台审核管理）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id           TEXT PRIMARY KEY,         -- 评论唯一 ID（来自 Waline 或自生成）
  post_id      TEXT,                     -- 对应文章路径/URL
  post_title   TEXT,                     -- 文章标题冗余字段，方便列表展示
  author       TEXT NOT NULL,
  email        TEXT,
  link         TEXT,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending / approved / spam / deleted
  source       TEXT NOT NULL DEFAULT 'waline',   -- waline / direct
  ai_verdict   TEXT,                     -- AI 审核结论：approve / review / spam
  ai_score     REAL,                     -- 置信度 0-1
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

-- --------------------------------------------------------------------------
-- config：系统配置（key-value，value 存 JSON）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,             -- JSON 字符串
  updated_at  TEXT NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 -- 乐观锁版本号
);

-- --------------------------------------------------------------------------
-- schedules：定时发布任务
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedules (
  id              TEXT PRIMARY KEY,
  collection      TEXT NOT NULL,          -- essay / bits / memo
  slug            TEXT NOT NULL,          -- 文章标识
  scheduled_at    TEXT NOT NULL,          -- 预定发布时间 ISO8601
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending / running / done / failed / cancelled
  deploy_triggered INTEGER NOT NULL DEFAULT 0,      -- 0/1 是否已触发部署
  created_at      TEXT NOT NULL,
  triggered_at    TEXT,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
CREATE INDEX IF NOT EXISTS idx_schedules_scheduled ON schedules(scheduled_at);

-- --------------------------------------------------------------------------
-- audit：审计日志（敏感操作记录）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit (
  id          TEXT PRIMARY KEY,
  session_id  TEXT,                       -- 操作者会话
  action      TEXT NOT NULL,              -- COMMENT_DELETE / CONFIG_UPDATE / CONTENT_DELETE ...
  target      TEXT,                       -- 操作对象标识
  detail      TEXT,                       -- JSON 详情
  ip          TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit(action);

-- --------------------------------------------------------------------------
-- ratelimit：分布式限流计数（按 IP + 时间窗口）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ratelimit (
  ip           TEXT NOT NULL,
  window_start TEXT NOT NULL,             -- 窗口起始 ISO8601
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, window_start)
);

-- --------------------------------------------------------------------------
-- stats：系统统计（文章数、评论数、图片存储量等缓存值）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stats (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,              -- JSON 或纯值
  updated_at  TEXT NOT NULL
);

-- --------------------------------------------------------------------------
-- seed：预置配置项
-- --------------------------------------------------------------------------

-- site：站点信息
INSERT INTO config (key, value, updated_at, revision) VALUES (
  'site',
  json('{
    "title": "柒色墨笺",
    "description": "继Wordpress后又一个心灵驿站",
    "author": "Ficor",
    "url": "https://vii.ink"
  }'),
  datetime('now'),
  1
) ON CONFLICT(key) DO NOTHING;

-- ai：AI 模型与提示词配置
INSERT INTO config (key, value, updated_at, revision) VALUES (
  'ai',
  json('{
    "model": "@cf/qwen/qwen1.5-14b-chat-aliyun",
    "available_models": [
      "@cf/qwen/qwen1.5-14b-chat-aliyun",
      "@cf/qwen/qwq-32b",
      "@cf/meta/llama-3.1-8b-instruct",
      "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"
    ],
    "polish_prompt": "你是一位专业的中文写作润色助手。请改写以下文字使其更加通顺、自然，保持原意不变。只输出润色后的文字，不要解释。",
    "metadata_prompt": "分析以下文章内容，提取 JSON 格式的元数据：title（标题）、description（一句话摘要，50字内）、tags（3-5个标签数组）、date（发布日期 YYYY-MM-DD）。只输出 JSON。",
    "moderate_prompt": "判断以下评论是否为垃圾信息、广告或包含不当内容。输出 JSON：{ verdict: approve|review|spam, score: 0-1, reason: 简短理由 }"
  }'),
  datetime('now'),
  1
) ON CONFLICT(key) DO NOTHING;

-- ratelimit：限流参数
INSERT INTO config (key, value, updated_at, revision) VALUES (
  'ratelimit',
  json('{
    "max": 60,
    "window": 60,
    "comment_max": 5,
    "comment_window": 300
  }'),
  datetime('now'),
  1
) ON CONFLICT(key) DO NOTHING;

-- watermark：水印参数
INSERT INTO config (key, value, updated_at, revision) VALUES (
  'watermark',
  json('{
    "enabled": false,
    "image_key": "config/watermark.png",
    "position": "bottom-right",
    "opacity": 0.6,
    "scale": 0.15
  }'),
  datetime('now'),
  1
) ON CONFLICT(key) DO NOTHING;

-- deploy：GitHub 部署配置
INSERT INTO config (key, value, updated_at, revision) VALUES (
  'deploy',
  json('{
    "owner": "Ficorcc",
    "repo": "Ficor.net",
    "workflow": "ci.yml",
    "ref": "main"
  }'),
  datetime('now'),
  1
) ON CONFLICT(key) DO NOTHING;

-- image：图片处理配置
INSERT INTO config (key, value, updated_at, revision) VALUES (
  'image',
  json('{
    "auto_webp": true,
    "max_width": 2400,
    "quality": 82
  }'),
  datetime('now'),
  1
) ON CONFLICT(key) DO NOTHING;
