CREATE TABLE IF NOT EXISTS fiscus_comments (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  page_title TEXT,
  parent_id TEXT,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_email_hash TEXT NOT NULL,
  author_url TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  level_label TEXT NOT NULL DEFAULT '访客',
  level_score INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  FOREIGN KEY (parent_id) REFERENCES fiscus_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_fiscus_comments_page_status_created
  ON fiscus_comments(page_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_fiscus_comments_status_created
  ON fiscus_comments(status, created_at);

CREATE INDEX IF NOT EXISTS idx_fiscus_comments_author_hash_status
  ON fiscus_comments(author_email_hash, status);

CREATE TABLE IF NOT EXISTS fiscus_comment_rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fiscus_comment_moderation_logs (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (comment_id) REFERENCES fiscus_comments(id)
);

CREATE TABLE IF NOT EXISTS fiscus_comment_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO fiscus_comment_settings (key, value, updated_at) VALUES
  ('commentsEnabled', 'true', datetime('now')),
  ('autoApprove', 'false', datetime('now')),
  ('trustedAuthorAutoApproveCount', '0', datetime('now')),
  ('blockedWords', '', datetime('now')),
  ('maxPerWindow', '5', datetime('now')),
  ('rateWindowSeconds', '600', datetime('now')),
  ('siteName', 'Astro Comments', datetime('now')),
  ('siteUrl', '', datetime('now')),
  ('emailProvider', 'none', datetime('now')),
  ('adminEmail', '', datetime('now')),
  ('fromEmail', '', datetime('now')),
  ('emailWebhookUrl', '', datetime('now')),
  ('commentHeading', '评论', datetime('now')),
  ('emptyText', '还没有评论。', datetime('now')),
  ('submitLabel', '提交评论', datetime('now')),
  ('pendingMessage', '评论已提交，等待审核。', datetime('now')),
  ('approvedMessage', '评论已发布。', datetime('now')),
  ('allowAuthorUrl', 'true', datetime('now')),
  ('backupSyncEnabled', 'false', datetime('now')),
  ('backupSyncWebhookUrl', '', datetime('now'));

CREATE TABLE IF NOT EXISTS fiscus_comment_sync_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fiscus_comment_import_logs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  mode TEXT NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  created_at TEXT NOT NULL
);

UPDATE fiscus_comment_settings SET value = '柒色墨笺' WHERE key = 'siteName';
UPDATE fiscus_comment_settings SET value = 'https://vii.ink' WHERE key = 'siteUrl';
