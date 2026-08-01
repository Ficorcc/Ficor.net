<!--
  系统设置
-->
<script lang="ts">
  import { toast } from '$lib/stores/toast';
  import { api } from '$lib/utils/api';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import {
    cloneThemeSettings,
    mergeThemeSettings,
    type ThemeSettingsBundle
  } from '$lib/utils/theme-settings';

  let { data } = $props();

  // 类型断言：config 是 Record<string, Record<string, unknown>>
  const allConfig = (data.config ?? {}) as Record<string, Record<string, unknown>>;

  // 本地可编辑的配置副本
  let ratelimitConfig = $state<Record<string, unknown>>(structuredClone(allConfig.ratelimit ?? {}));
  let watermarkConfig = $state<Record<string, unknown>>(structuredClone(allConfig.watermark ?? {}));
  let imageConfig = $state<Record<string, unknown>>(structuredClone(allConfig.image ?? {}));
  let deployConfig = $state<Record<string, unknown>>(structuredClone(allConfig.deploy ?? {}));
  let themeSettings = $state<ThemeSettingsBundle>(
    mergeThemeSettings(data.themeSettings ?? cloneThemeSettings())
  );
  let themeTab = $state<'site' | 'shell' | 'home' | 'page' | 'ui'>('site');
  let customSocialJson = $state(
    JSON.stringify(getArray(getRecord(themeSettings.site.socialLinks).custom), null, 2)
  );

  let saving = $state<string | null>(null);

  const themeTabs = [
    { label: '站点', value: 'site' },
    { label: '侧栏', value: 'shell' },
    { label: '首页', value: 'home' },
    { label: '页面', value: 'page' },
    { label: '界面', value: 'ui' }
  ];
  const introLinkOptions = [
    { id: 'archive', label: '归档' },
    { id: 'essay', label: '随笔' },
    { id: 'bits', label: '絮语' },
    { id: 'memo', label: '小记' },
    { id: 'about', label: '关于' },
    { id: 'tag', label: '#标签' }
  ];

  async function save(key: string, value: unknown) {
    saving = key;
    const result = await api('CONFIG_UPDATE', { key, value });
    if (result.ok) {
      toast.ok(`${key} 配置已保存`);
    } else {
      toast.error(result.error ?? '保存失败');
    }
    saving = null;
  }

  async function saveThemeSettings(deploy = false) {
    let custom: unknown = [];
    try {
      custom = JSON.parse(customSocialJson || '[]');
      if (!Array.isArray(custom)) {
        toast.error('自定义社交链接必须是 JSON 数组');
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? `自定义社交链接 JSON 错误：${e.message}` : '自定义社交链接 JSON 错误');
      return;
    }

    getRecord(themeSettings.site.socialLinks).custom = custom;
    saving = deploy ? 'theme-deploy' : 'theme';
    const result = await api<{ settings?: ThemeSettingsBundle; deploy?: { ok: boolean; message?: string } }>(
      'THEME_SETTINGS_SAVE',
      { settings: themeSettings, deploy }
    );

    if (result.ok) {
      const payload = result.data as Record<string, unknown> | undefined;
      if (payload && 'settings' in payload) {
        themeSettings = mergeThemeSettings(payload.settings);
        customSocialJson = JSON.stringify(getArray(getRecord(themeSettings.site.socialLinks).custom), null, 2);
      }
      if (deploy) {
        const deployResult = payload?.deploy as { ok?: boolean; message?: string } | undefined;
        toast[deployResult?.ok === false ? 'error' : 'ok'](deployResult?.message ?? '主题设置已保存，已触发主站重建');
      } else {
        toast.ok('站点信息已保存');
      }
    } else {
      toast.error(result.error ?? '保存失败');
    }
    saving = null;
  }

  function str(v: unknown): string {
    return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  }
  function num(v: unknown): number {
    return typeof v === 'number' ? v : 0;
  }
  function bool(v: unknown, fallback = false): boolean {
    return typeof v === 'boolean' ? v : fallback;
  }
  function getRecord(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }
  function getArray(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
  }
  function setNested(root: Record<string, unknown>, key: string, value: unknown) {
    root[key] = value;
  }
  function updateIntroLink(id: string, checked: boolean) {
    const links = new Set(getArray(themeSettings.home.introMoreLinks).map(String));
    if (checked) links.add(id);
    else links.delete(id);
    themeSettings.home.introMoreLinks = Array.from(links).slice(0, 2);
  }
</script>

<svelte:head>
  <title>系统设置 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <h1 class="page-header__title">系统设置</h1>
  <p class="page-header__sub">站点信息、图片、限流、水印、部署配置</p>
</div>

{#if data.error}
  <div class="panel">
    <div class="empty-state">
      <div class="empty-state__title">无法加载配置</div>
      <p class="text-sm">{data.error}</p>
    </div>
  </div>
{:else}
  <div class="settings-grid">
    <!-- 站点信息 -->
    <div class="panel panel--wide">
      <div class="panel__legend">
        站点信息 <span class="panel__legend-en">SITE</span>
      </div>
      <div class="field mb-4">
        <span class="field__label">设置分组</span>
        <Segmented options={themeTabs} value={themeTab} onchange={(v) => (themeTab = v as typeof themeTab)} />
      </div>

      {#if themeTab === 'site'}
        {@const footer = getRecord(themeSettings.site.footer)}
        {@const socialLinks = getRecord(themeSettings.site.socialLinks)}
        {@const presetOrder = getRecord(socialLinks.presetOrder)}
        <div class="form-grid">
          <div class="field">
            <span class="field__label">站点标题</span>
            <input type="text" value={str(themeSettings.site.title)} oninput={(e) => (themeSettings.site.title = e.currentTarget.value)} />
          </div>
          <div class="field">
            <span class="field__label">默认语言</span>
            <input type="text" value={str(themeSettings.site.defaultLocale)} oninput={(e) => (themeSettings.site.defaultLocale = e.currentTarget.value)} />
          </div>
          <div class="field field--full">
            <span class="field__label">站点描述</span>
            <textarea rows="2" value={str(themeSettings.site.description)} oninput={(e) => (themeSettings.site.description = e.currentTarget.value)}></textarea>
          </div>
          <div class="field">
            <span class="field__label">页脚起始年份</span>
            <input type="number" value={num(footer.startYear)} oninput={(e) => setNested(footer, 'startYear', parseInt(e.currentTarget.value) || new Date().getFullYear())} />
          </div>
          <div class="field">
            <span class="field__label">页脚版权</span>
            <input type="text" value={str(footer.copyright)} oninput={(e) => setNested(footer, 'copyright', e.currentTarget.value)} />
          </div>
          <div class="field field--full">
            <label class="fm-toggle">
              <input type="checkbox" checked={bool(footer.showCurrentYear, true)} onchange={(e) => setNested(footer, 'showCurrentYear', e.currentTarget.checked)} />
              <span>页脚显示当前年份</span>
            </label>
          </div>
          <div class="field">
            <span class="field__label">GitHub</span>
            <input type="url" value={str(socialLinks.github)} oninput={(e) => setNested(socialLinks, 'github', e.currentTarget.value || null)} />
          </div>
          <div class="field">
            <span class="field__label">X / Twitter</span>
            <input type="url" value={str(socialLinks.x)} oninput={(e) => setNested(socialLinks, 'x', e.currentTarget.value || null)} />
          </div>
          <div class="field">
            <span class="field__label">邮箱</span>
            <input type="email" value={str(socialLinks.email)} oninput={(e) => setNested(socialLinks, 'email', e.currentTarget.value || null)} />
          </div>
          <div class="field">
            <span class="field__label">社交排序 GitHub / X / 邮箱</span>
            <div class="inline-inputs">
              <input aria-label="GitHub 排序" type="number" value={num(presetOrder.github)} oninput={(e) => setNested(presetOrder, 'github', parseInt(e.currentTarget.value) || 1)} />
              <input aria-label="X 排序" type="number" value={num(presetOrder.x)} oninput={(e) => setNested(presetOrder, 'x', parseInt(e.currentTarget.value) || 2)} />
              <input aria-label="邮箱排序" type="number" value={num(presetOrder.email)} oninput={(e) => setNested(presetOrder, 'email', parseInt(e.currentTarget.value) || 3)} />
            </div>
          </div>
          <div class="field field--full">
            <span class="field__label">自定义社交链接 JSON</span>
            <textarea rows="8" bind:value={customSocialJson}></textarea>
            <div class="field__hint">保持 Theme Console 的完整能力：id、label、href、iconKey、visible、order。</div>
          </div>
        </div>
      {:else if themeTab === 'shell'}
        <div class="form-grid">
          <div class="field">
            <span class="field__label">侧栏标题</span>
            <input type="text" value={str(themeSettings.shell.brandTitle)} oninput={(e) => (themeSettings.shell.brandTitle = e.currentTarget.value)} />
          </div>
          <div class="field field--full">
            <span class="field__label">侧栏引语</span>
            <textarea rows="3" value={str(themeSettings.shell.quote)} oninput={(e) => (themeSettings.shell.quote = e.currentTarget.value)}></textarea>
          </div>
        </div>
        <div class="theme-table">
          <div class="theme-table__head">导航</div>
          {#each getArray(themeSettings.shell.nav) as navItem, index}
            {@const nav = getRecord(navItem)}
            <div class="theme-table__row">
              <span class="theme-table__id">{str(nav.id)}</span>
              <input aria-label="导航名称" type="text" value={str(nav.label)} oninput={(e) => setNested(nav, 'label', e.currentTarget.value)} />
              <input aria-label="装饰符" type="text" value={str(nav.ornament)} oninput={(e) => setNested(nav, 'ornament', e.currentTarget.value)} />
              <input aria-label="排序" type="number" value={num(nav.order) || index + 1} oninput={(e) => setNested(nav, 'order', parseInt(e.currentTarget.value) || index + 1)} />
              <label class="fm-toggle">
                <input type="checkbox" checked={bool(nav.visible, true)} onchange={(e) => setNested(nav, 'visible', e.currentTarget.checked)} />
                <span>显示</span>
              </label>
            </div>
          {/each}
        </div>
      {:else if themeTab === 'home'}
        <div class="form-grid">
          <div class="field field--full">
            <span class="field__label">首页导语</span>
            <textarea rows="5" value={str(themeSettings.home.introLead)} oninput={(e) => (themeSettings.home.introLead = e.currentTarget.value)}></textarea>
          </div>
          <div class="field">
            <span class="field__label">更多文章文字</span>
            <input type="text" value={str(themeSettings.home.introMore)} oninput={(e) => (themeSettings.home.introMore = e.currentTarget.value)} />
          </div>
          <div class="field">
            <span class="field__label">Hero 模式</span>
            <select value={str(themeSettings.home.heroPresetId)} onchange={(e) => (themeSettings.home.heroPresetId = e.currentTarget.value)}>
              <option value="default">默认图片</option>
              <option value="none">隐藏</option>
            </select>
          </div>
          <div class="field">
            <label class="fm-toggle">
              <input type="checkbox" checked={bool(themeSettings.home.showIntroLead, true)} onchange={(e) => (themeSettings.home.showIntroLead = e.currentTarget.checked)} />
              <span>显示首页导语</span>
            </label>
          </div>
          <div class="field">
            <label class="fm-toggle">
              <input type="checkbox" checked={bool(themeSettings.home.showIntroMore, true)} onchange={(e) => (themeSettings.home.showIntroMore = e.currentTarget.checked)} />
              <span>显示更多入口</span>
            </label>
          </div>
          <div class="field field--full">
            <span class="field__label">更多入口</span>
            <div class="check-list">
              {#each introLinkOptions as opt}
                <label class="fm-toggle">
                  <input type="checkbox" checked={getArray(themeSettings.home.introMoreLinks).map(String).includes(opt.id)} onchange={(e) => updateIntroLink(opt.id, e.currentTarget.checked)} />
                  <span>{opt.label}</span>
                </label>
              {/each}
            </div>
            <div class="field__hint">最多显示两个入口。</div>
          </div>
          <div class="field field--full">
            <span class="field__label">Hero 图片</span>
            <input type="text" value={str(themeSettings.home.heroImageSrc)} oninput={(e) => (themeSettings.home.heroImageSrc = e.currentTarget.value || null)} />
          </div>
          <div class="field">
            <span class="field__label">Hero 替代文本</span>
            <input type="text" value={str(themeSettings.home.heroImageAlt)} oninput={(e) => (themeSettings.home.heroImageAlt = e.currentTarget.value)} />
          </div>
        </div>
      {:else if themeTab === 'page'}
        <div class="form-grid">
          {#each ['essay', 'archive', 'bits', 'memo', 'about'] as pageId}
            {@const pageConfig = getRecord(themeSettings.page[pageId])}
            <div class="field">
              <span class="field__label">{pageId} 标题</span>
              <input type="text" value={str(pageConfig.title)} oninput={(e) => setNested(pageConfig, 'title', e.currentTarget.value || null)} />
            </div>
            <div class="field">
              <span class="field__label">{pageId} 副标题</span>
              <input type="text" value={str(pageConfig.subtitle)} oninput={(e) => setNested(pageConfig, 'subtitle', e.currentTarget.value || null)} />
            </div>
            {#if pageId === 'bits'}
              {@const author = getRecord(pageConfig.defaultAuthor)}
              <div class="field">
                <span class="field__label">Bits 默认作者</span>
                <input type="text" value={str(author.name)} oninput={(e) => setNested(author, 'name', e.currentTarget.value)} />
              </div>
              <div class="field">
                <span class="field__label">Bits 默认头像</span>
                <input type="text" value={str(author.avatar)} oninput={(e) => setNested(author, 'avatar', e.currentTarget.value)} />
              </div>
            {/if}
          {/each}
        </div>
      {:else}
        {@const codeBlock = getRecord(themeSettings.ui.codeBlock)}
        {@const readingMode = getRecord(themeSettings.ui.readingMode)}
        {@const articleMeta = getRecord(themeSettings.ui.articleMeta)}
        {@const layout = getRecord(themeSettings.ui.layout)}
        <div class="form-grid">
          <div class="field">
            <label class="fm-toggle">
              <input type="checkbox" checked={bool(codeBlock.showLineNumbers, true)} onchange={(e) => setNested(codeBlock, 'showLineNumbers', e.currentTarget.checked)} />
              <span>代码块显示行号</span>
            </label>
          </div>
          <div class="field">
            <label class="fm-toggle">
              <input type="checkbox" checked={bool(readingMode.showEntry, true)} onchange={(e) => setNested(readingMode, 'showEntry', e.currentTarget.checked)} />
              <span>显示阅读模式入口</span>
            </label>
          </div>
          <div class="field">
            <span class="field__label">侧栏分隔线</span>
            <select value={str(layout.sidebarDivider)} onchange={(e) => setNested(layout, 'sidebarDivider', e.currentTarget.value)}>
              <option value="default">默认</option>
              <option value="subtle">弱化</option>
              <option value="none">隐藏</option>
            </select>
          </div>
          <div class="field">
            <span class="field__label">日期前缀</span>
            <input type="text" value={str(articleMeta.dateLabel)} oninput={(e) => setNested(articleMeta, 'dateLabel', e.currentTarget.value)} />
          </div>
          <div class="field field--full">
            <div class="check-list">
              <label class="fm-toggle"><input type="checkbox" checked={bool(articleMeta.showDate, true)} onchange={(e) => setNested(articleMeta, 'showDate', e.currentTarget.checked)} /><span>显示日期</span></label>
              <label class="fm-toggle"><input type="checkbox" checked={bool(articleMeta.showTags, true)} onchange={(e) => setNested(articleMeta, 'showTags', e.currentTarget.checked)} /><span>显示标签</span></label>
              <label class="fm-toggle"><input type="checkbox" checked={bool(articleMeta.showWordCount, true)} onchange={(e) => setNested(articleMeta, 'showWordCount', e.currentTarget.checked)} /><span>显示字数</span></label>
              <label class="fm-toggle"><input type="checkbox" checked={bool(articleMeta.showReadingTime, true)} onchange={(e) => setNested(articleMeta, 'showReadingTime', e.currentTarget.checked)} /><span>显示阅读时长</span></label>
            </div>
          </div>
        </div>
      {/if}

      <div class="settings-actions">
        <button class="btn btn--primary btn--sm" onclick={() => saveThemeSettings(false)} disabled={saving === 'theme'}>
          {saving === 'theme' ? '保存中...' : '保存站点信息'}
        </button>
        <button class="btn btn--ghost btn--sm" onclick={() => saveThemeSettings(true)} disabled={saving === 'theme-deploy'}>
          {saving === 'theme-deploy' ? '触发中...' : '保存并重建主站'}
        </button>
      </div>
    </div>

    <!-- 图片处理 -->
    <div class="panel">
      <div class="panel__legend">
        图片处理 <span class="panel__legend-en">IMAGE</span>
      </div>
      <div class="form-grid">
        <div class="field">
          <span class="field__label">最大宽度</span>
          <input type="number" value={num(imageConfig.max_width)} oninput={(e) => (imageConfig.max_width = parseInt(e.currentTarget.value) || 2400)} />
        </div>
        <div class="field">
          <span class="field__label">WebP 质量</span>
          <input type="number" value={num(imageConfig.quality)} oninput={(e) => (imageConfig.quality = parseInt(e.currentTarget.value) || 82)} />
        </div>
        <div class="field field--full">
          <label class="fm-toggle">
            <input type="checkbox" checked={imageConfig.auto_webp !== false} onchange={(e) => (imageConfig.auto_webp = e.currentTarget.checked)} />
            <span>自动转 WebP</span>
          </label>
        </div>
      </div>
      <button class="btn btn--primary btn--sm mt-4" onclick={() => save('image', imageConfig)} disabled={saving === 'image'}>
        {saving === 'image' ? '保存中...' : '保存'}
      </button>
    </div>

    <!-- 水印 -->
    <div class="panel">
      <div class="panel__legend">
        水印 <span class="panel__legend-en">WATERMARK</span>
      </div>
      <div class="form-grid">
        <div class="field field--full">
          <label class="fm-toggle">
            <input type="checkbox" checked={watermarkConfig.enabled === true} onchange={(e) => (watermarkConfig.enabled = e.currentTarget.checked)} />
            <span>启用水印</span>
          </label>
        </div>
        <div class="field">
          <span class="field__label">水印图路径</span>
          <input type="text" value={str(watermarkConfig.image_key)} oninput={(e) => (watermarkConfig.image_key = e.currentTarget.value)} />
        </div>
        <div class="field">
          <span class="field__label">位置</span>
          <select value={str(watermarkConfig.position)} onchange={(e) => (watermarkConfig.position = e.currentTarget.value)}>
            <option value="top-left">左上</option>
            <option value="top-right">右上</option>
            <option value="bottom-left">左下</option>
            <option value="bottom-right">右下</option>
            <option value="center">居中</option>
          </select>
        </div>
        <div class="field">
          <span class="field__label">透明度 (0-1)</span>
          <input type="number" step="0.1" min="0" max="1" value={num(watermarkConfig.opacity)} oninput={(e) => (watermarkConfig.opacity = parseFloat(e.currentTarget.value) || 0.6)} />
        </div>
        <div class="field">
          <span class="field__label">大小比例 (0-1)</span>
          <input type="number" step="0.05" min="0" max="1" value={num(watermarkConfig.scale)} oninput={(e) => (watermarkConfig.scale = parseFloat(e.currentTarget.value) || 0.15)} />
        </div>
      </div>
      <button class="btn btn--primary btn--sm mt-4" onclick={() => save('watermark', watermarkConfig)} disabled={saving === 'watermark'}>
        {saving === 'watermark' ? '保存中...' : '保存'}
      </button>
    </div>

    <!-- 限流 -->
    <div class="panel">
      <div class="panel__legend">
        限流 <span class="panel__legend-en">RATE LIMIT</span>
      </div>
      <div class="form-grid">
        <div class="field">
          <span class="field__label">通用阈值（请求/窗口）</span>
          <input type="number" value={num(ratelimitConfig.max)} oninput={(e) => (ratelimitConfig.max = parseInt(e.currentTarget.value) || 60)} />
        </div>
        <div class="field">
          <span class="field__label">窗口（秒）</span>
          <input type="number" value={num(ratelimitConfig.window)} oninput={(e) => (ratelimitConfig.window = parseInt(e.currentTarget.value) || 60)} />
        </div>
        <div class="field">
          <span class="field__label">评论阈值</span>
          <input type="number" value={num(ratelimitConfig.comment_max)} oninput={(e) => (ratelimitConfig.comment_max = parseInt(e.currentTarget.value) || 5)} />
        </div>
        <div class="field">
          <span class="field__label">评论窗口（秒）</span>
          <input type="number" value={num(ratelimitConfig.comment_window)} oninput={(e) => (ratelimitConfig.comment_window = parseInt(e.currentTarget.value) || 300)} />
        </div>
      </div>
      <button class="btn btn--primary btn--sm mt-4" onclick={() => save('ratelimit', ratelimitConfig)} disabled={saving === 'ratelimit'}>
        {saving === 'ratelimit' ? '保存中...' : '保存'}
      </button>
    </div>

    <!-- 部署 -->
    <div class="panel">
      <div class="panel__legend">
        部署配置 <span class="panel__legend-en">DEPLOY</span>
      </div>
      <div class="form-grid">
        <div class="field">
          <span class="field__label">GitHub 用户名</span>
          <input type="text" value={str(deployConfig.owner)} oninput={(e) => (deployConfig.owner = e.currentTarget.value)} />
        </div>
        <div class="field">
          <span class="field__label">仓库名</span>
          <input type="text" value={str(deployConfig.repo)} oninput={(e) => (deployConfig.repo = e.currentTarget.value)} />
        </div>
        <div class="field field--full">
          <span class="field__label">Workflow 文件</span>
          <input type="text" value={str(deployConfig.workflow)} oninput={(e) => (deployConfig.workflow = e.currentTarget.value)} placeholder="deploy.yml" />
          <div class="field__hint">GITHUB_TOKEN 需用 wrangler secret 设置，不在此处填写</div>
        </div>
      </div>
      <button class="btn btn--primary btn--sm mt-4" onclick={() => save('deploy', deployConfig)} disabled={saving === 'deploy'}>
        {saving === 'deploy' ? '保存中...' : '保存'}
      </button>
    </div>
  </div>
{/if}

<style>
  .settings-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .panel--wide {
    border-color: color-mix(in srgb, var(--color-red) 22%, var(--color-border));
  }
  .settings-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 18px;
  }
  .inline-inputs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .theme-table {
    display: grid;
    gap: 8px;
  }
  .theme-table__head {
    font-family: var(--font-kai);
    font-size: 13px;
    color: var(--color-text-muted);
  }
  .theme-table__row {
    display: grid;
    grid-template-columns: 72px minmax(120px, 1fr) 72px 84px auto;
    gap: 8px;
    align-items: center;
  }
  .theme-table__id {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .check-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
  }
  .fm-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-family: var(--font-kai);
    font-size: 13px;
  }
  @media (max-width: 720px) {
    .theme-table__row {
      grid-template-columns: 1fr;
      padding: 12px 0;
      border-bottom: 1px solid var(--color-border);
    }
  }
</style>
