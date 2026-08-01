import type { PageServerLoad } from './$types';
import { readJsonData } from '$lib/server/r2/site-data';

const fallbackLinks = {
  siteInfo: {
    name: '',
    url: '',
    avatar: '',
    description: ''
  },
  links: []
};

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.R2) {
    return { value: fallbackLinks, links: [], siteInfo: fallbackLinks.siteInfo, error: 'R2 未配置' };
  }

  try {
    const value = await readJsonData<Record<string, unknown>>(platform.env.R2, 'links', fallbackLinks);
    const links = Array.isArray(value.links) ? value.links : [];
    const siteInfo = value.siteInfo && typeof value.siteInfo === 'object' ? value.siteInfo : fallbackLinks.siteInfo;
    return { value, links, siteInfo };
  } catch (e) {
    return { value: fallbackLinks, links: [], siteInfo: fallbackLinks.siteInfo, error: e instanceof Error ? e.message : '加载失败' };
  }
};
