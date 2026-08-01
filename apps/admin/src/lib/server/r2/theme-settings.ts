import {
  DEFAULT_THEME_SETTINGS,
  THEME_SETTING_GROUPS,
  cloneThemeSettings,
  mergeThemeSettings,
  type ThemeSettingsBundle,
  type ThemeSettingsGroup
} from '$lib/utils/theme-settings';

const keyForGroup = (group: ThemeSettingsGroup) => `settings/${group}.json`;

async function readGroup(r2: R2Bucket, group: ThemeSettingsGroup): Promise<Record<string, unknown>> {
  const obj = await r2.get(keyForGroup(group));
  if (!obj) return cloneThemeSettings(DEFAULT_THEME_SETTINGS)[group];

  try {
    const parsed = JSON.parse(await obj.text());
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to defaults when a remote settings file is malformed.
  }

  return cloneThemeSettings(DEFAULT_THEME_SETTINGS)[group];
}

export async function readThemeSettings(r2: R2Bucket): Promise<ThemeSettingsBundle> {
  const entries = await Promise.all(THEME_SETTING_GROUPS.map(async (group) => [group, await readGroup(r2, group)] as const));
  return mergeThemeSettings(Object.fromEntries(entries));
}

export async function writeThemeSettings(r2: R2Bucket, settings: unknown): Promise<ThemeSettingsBundle> {
  const next = mergeThemeSettings(settings);
  await Promise.all(
    THEME_SETTING_GROUPS.map((group) =>
      r2.put(keyForGroup(group), JSON.stringify(next[group], null, 2), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
        customMetadata: {
          group,
          updatedAt: new Date().toISOString()
        }
      })
    )
  );
  return next;
}
