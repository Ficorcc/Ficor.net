export type ThemeSettingsGroup = 'site' | 'shell' | 'home' | 'page' | 'ui';

export const THEME_SETTING_GROUPS: ThemeSettingsGroup[] = ['site', 'shell', 'home', 'page', 'ui'];

export interface ThemeSettingsBundle {
  site: Record<string, unknown>;
  shell: Record<string, unknown>;
  home: Record<string, unknown>;
  page: Record<string, unknown>;
  ui: Record<string, unknown>;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettingsBundle = {
  site: {
    title: '柒色墨笺',
    description: '柒色入墨，落笔成诗',
    defaultLocale: 'zh-CN',
    footer: {
      startYear: 2008,
      showCurrentYear: true,
      copyright: 'Ficor · Power by Astro & Theme by Whono'
    },
    socialLinks: {
      github: 'https://github.com/Ficorcc',
      x: null,
      email: 'ficor@qq.com',
      presetOrder: { github: 1, x: 5, email: 3 },
      custom: []
    }
  },
  shell: {
    brandTitle: '柒色墨笺',
    quote: '柒色入墨，色染余生\n墨染流年，笺载心事',
    nav: [
      { id: 'essay', label: '随笔', ornament: '·', order: 1, visible: true },
      { id: 'bits', label: '絮语', ornament: '·', order: 2, visible: true },
      { id: 'memo', label: '小记', ornament: '·', order: 3, visible: true },
      { id: 'archive', label: '归档', ornament: '·', order: 4, visible: true },
      { id: 'links', label: '友链', ornament: '·', order: 5, visible: true },
      { id: 'friends', label: '友圈', ornament: '·', order: 6, visible: true },
      { id: 'about', label: '关于', ornament: '·', order: 7, visible: true }
    ]
  },
  home: {
    introLead: '柒色入墨，落笔成诗\n拾柒色光景，落一纸墨香',
    introMore: '更多文章请访问',
    introMoreLinks: ['archive', 'essay'],
    showIntroLead: true,
    showIntroMore: false,
    heroPresetId: 'default',
    heroImageSrc: null,
    heroImageAlt: '启航'
  },
  page: {
    essay: { title: '随笔', subtitle: null },
    archive: { title: '归档', subtitle: '按年份分组的归档目录' },
    bits: {
      title: '絮语',
      subtitle: null,
      defaultAuthor: { name: 'Ficor', avatar: 'author/avatar.webp' }
    },
    memo: { title: null, subtitle: null },
    about: { title: '关于', subtitle: null }
  },
  ui: {
    codeBlock: { showLineNumbers: true },
    readingMode: { showEntry: true },
    articleMeta: {
      showDate: true,
      dateLabel: '发布于：',
      showTags: true,
      showWordCount: true,
      showReadingTime: true
    },
    layout: { sidebarDivider: 'default' }
  }
};

export function cloneThemeSettings(settings: ThemeSettingsBundle = DEFAULT_THEME_SETTINGS): ThemeSettingsBundle {
  return structuredClone(settings);
}

export function mergeThemeSettings(input: unknown): ThemeSettingsBundle {
  const raw = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
  const defaults = cloneThemeSettings();

  for (const group of THEME_SETTING_GROUPS) {
    const value = raw[group];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      defaults[group] = structuredClone(value as Record<string, unknown>);
    }
  }

  return defaults;
}
