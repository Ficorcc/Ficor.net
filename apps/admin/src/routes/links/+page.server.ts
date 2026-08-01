import type { PageServerLoad } from './$types';
import { readJsonData } from '$lib/server/r2/site-data';
import { fetchSourceLinks } from '$lib/server/site-source';

const fallbackLinks = {
  siteInfo: {
    title: '',
    url: '',
    avatar: '',
    description: ''
  },
  links: []
};

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.R2) {
    return { value: fallbackLinks, links: [], siteInfo: fallbackLinks.siteInfo, source: 'fallback', error: 'R2 未配置' };
  }

  try {
    const r2Value = await readJsonData<Record<string, unknown>>(platform.env.R2, 'links', fallbackLinks);
    const r2Links = Array.isArray(r2Value.links) ? r2Value.links : [];
    const sourceValue = r2Links.length > 0 ? null : await fetchSourceLinks(platform.env);
    const value = sourceValue && Array.isArray(sourceValue.links) && sourceValue.links.length > 0 ? sourceValue : r2Value;
    const links = Array.isArray(value.links) ? value.links : [];
    const siteInfo = value.siteInfo && typeof value.siteInfo === 'object' ? value.siteInfo : fallbackLinks.siteInfo;
    return {
      value,
      links,
      siteInfo,
      source: value === r2Value ? 'r2' : 'source'
    };
  } catch (e) {
    return {
      value: fallbackLinks,
      links: [],
      siteInfo: fallbackLinks.siteInfo,
      source: 'fallback',
      error: e instanceof Error ? e.message : '加载失败'
    };
  }
};
