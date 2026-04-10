const rawSiteUrl = (process.env.SITE_URL ?? '').trim();
const siteUrl = rawSiteUrl ? rawSiteUrl.replace(/\/+$/, '') : '';
const hasSiteUrl = siteUrl.length > 0;
const fallbackSiteUrl = 'https://vii.ink';

if (!hasSiteUrl && process.env.NODE_ENV === 'production') {
  console.warn(
    '[astro-whono] SITE_URL is not set. RSS will use example.invalid; canonical/og will be omitted; sitemap will not be generated and robots will not include Sitemap.'
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

// 评论系统配置
export const comment = {
  // 可选值: 'artalk', 'waline', 'twikoo', 'none'
  system: 'twikoo',
  // Artalk 配置
  artalk: {
    server: '', // Artalk 服务端地址
    site: '柒色墨笺', // 站点名称
    // 其他 Artalk 配置选项
  },
  // Waline 配置
  waline: {
    serverURL: '', // Waline 服务端地址
    // 其他 Waline 配置选项
  },
  // Twikoo 配置
  twikoo: {
    envId: 'https://twikoo.ficor.cc', // Twikoo 环境 ID
    // 其他 Twikoo 配置选项
  }
};

export const PAGE_SIZE_ARCHIVE = 12;
export const PAGE_SIZE_ESSAY = 12;
export const PAGE_SIZE_BITS = 20;

export { hasSiteUrl, siteUrl };
