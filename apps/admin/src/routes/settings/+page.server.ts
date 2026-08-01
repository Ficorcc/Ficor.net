// 系统设置：加载所有配置
import type { PageServerLoad } from './$types';
import { createRepos } from '$lib/server/db';
import { readThemeSettings } from '$lib/server/r2/theme-settings';
import { cloneThemeSettings } from '$lib/utils/theme-settings';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.DB) {
    return { config: {}, themeSettings: cloneThemeSettings(), error: '数据库未配置' };
  }

  const repos = createRepos(platform.env.DB);
  try {
    const [config, themeSettings] = await Promise.all([
      repos.config.getAll(),
      platform.env.R2 ? readThemeSettings(platform.env.R2) : Promise.resolve(cloneThemeSettings())
    ]);
    return { config, themeSettings };
  } catch (e) {
    return { config: {}, themeSettings: cloneThemeSettings(), error: e instanceof Error ? e.message : '加载失败' };
  }
};
