const rawSiteUrl = (process.env.SITE_URL ?? '').trim();
const siteUrl = rawSiteUrl ? rawSiteUrl.replace(/\/+$/, '') : '';
const hasSiteUrl = siteUrl.length > 0;
const fallbackSiteUrl = 'https://vii.ink';
const rawAdminConsoleUrl = (
  process.env.ADMIN_URL ??
  process.env.ADMIN_CONSOLE_URL ??
  'https://vii.ink/admin'
).trim();
const adminConsoleUrl = rawAdminConsoleUrl ? rawAdminConsoleUrl.replace(/\/+$/, '') : '';

if (!hasSiteUrl && process.env.NODE_ENV === 'production') {
  console.warn(
    '[astro-whono] SITE_URL is not set. canonical / og:url 会被省略，sitemap 不会生成，' +
    'robots.txt 也不会带 Sitemap 行。' +
    `（RSS 与 og 标题不受影响：site.url 会回退到硬编码的 ${fallbackSiteUrl}。）`
  );
}

export const site = {
  url: hasSiteUrl ? siteUrl : fallbackSiteUrl,
  title: '柒色墨笺',
  brandTitle: 'Whono',
  author: 'Ficor',
  authorAvatar: 'author/avatar.webp',
  description: '继Wordpress后又一个心灵驿站'
};

export const adminConsole = {
  url: adminConsoleUrl,
  displayUrl: adminConsoleUrl.replace(/^https?:\/\//, '')
};

// 评论系统配置
export const comment = {
  // Fiscus 自写评论系统；设为 none 可关闭。
  system: 'fiscus'
};

export const PAGE_SIZE_ARCHIVE = 12;
export const PAGE_SIZE_ESSAY = 12;
export const PAGE_SIZE_BITS = 20;
export const HOME_INDEX_SIZE = 3;

export { hasSiteUrl, siteUrl };
