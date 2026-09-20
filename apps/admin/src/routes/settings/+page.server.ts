// 系统设置：加载所有配置
import type { PageServerLoad } from './$types';
import { createRepos } from '$lib/server/db';
import { readThemeSettings } from '$lib/server/r2/theme-settings';
import { cloneThemeSettings } from '$lib/utils/theme-settings';
import { withFiscus } from '$lib/server/fiscus/runtime';
import { getCommentSettings, getDefaultSettings } from '$lib/server/fiscus/settings';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.DB) {
    return {
      config: {},
      themeSettings: cloneThemeSettings(),
      commentSettings: getDefaultSettings(),
      error: '数据库未配置'
    };
  }

  const repos = createRepos(platform.env.DB);
  try {
    const [config, themeSettings, commentSettings] = await Promise.all([
      repos.config.getAll(),
      platform.env.R2 ? readThemeSettings(platform.env.R2) : Promise.resolve(cloneThemeSettings()),
      // Fiscus 的设置读写走 AsyncLocalStorage 拿 env，必须包在 withFiscus 里
      withFiscus(platform.env, () => getCommentSettings())
    ]);
    return { config, themeSettings, commentSettings };
  } catch (e) {
    return {
      config: {},
      themeSettings: cloneThemeSettings(),
      commentSettings: getDefaultSettings(),
      error: e instanceof Error ? e.message : '加载失败'
    };
  }
};
