-- 清掉两个已废弃的评论设置键。
--
-- commentHeading（评论标题栏文案）与 allowAuthorUrl（是否允许填「网站」）
-- 在 2026-09-20 的评论区改版中失去了消费方：标题栏整块被去掉，
-- 「网站」填入项被删（反垃圾蜜罐 name="website" 是另一个字段，不受影响）。
--
-- 代码侧已从 CommentSettings / DEFAULTS / PUBLIC_SETTING_KEYS 移除，
-- 这里把历史遗留的行也删掉，免得表里留着让人以为它们还生效。
--
-- 注：getCommentSettings() 只按 DEFAULTS 的键去查表，残留行本来也不会被读到，
-- 这条迁移纯粹是清场。

DELETE FROM fiscus_comment_settings WHERE key IN ('commentHeading', 'allowAuthorUrl');
