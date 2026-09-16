import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, type ApiContext } from '../src/lib/api/dispatcher';
import { triggerPagesDeploy } from '../src/lib/server/deploy/cloudflare';
import { triggerDeploy } from '../src/lib/server/deploy/github';
import { readCommunity, readPublishedCommunity, publishCommunity, prepareCommunityPublication } from '../src/lib/server/community';
import { handleScheduled } from '../src/lib/server/backup';
import { fetchMemos } from '../src/lib/server/memos/client';

vi.mock('../src/lib/server/deploy/cloudflare', () => ({ triggerPagesDeploy: vi.fn() }));
vi.mock('../src/lib/server/deploy/github', async (original) => ({ ...await original<object>(), triggerDeploy: vi.fn() }));
vi.mock('../src/lib/server/memos/client', () => ({ fetchMemos: vi.fn(async () => []) }));
vi.mock('../src/lib/server/r2/theme-settings', () => ({ writeThemeSettings: vi.fn(async () => ({ site: {} })) }));

function context() {
  const values = new Map<string, unknown>();
  const r2 = {
    get: vi.fn(async (key: string) => values.has(key) ? { text: async () => JSON.stringify(values.get(key)) } : null),
    put: vi.fn(async (key: string, value: string) => { values.set(key, JSON.parse(value)); })
  };
  return {
    request: new Request('https://example.test/admin/api/event', { method: 'POST', headers: { 'x-csrf-token': 'csrf' } }),
    env: { R2: r2, DB: {}, CLOUDFLARE_DEPLOY_HOOK: 'https://example.test/hook', GITHUB_TOKEN: 'test' },
    locals: { session: { id: 's', token: 'token' }, ip: 'test' },
    repos: {
      sessions: { findByToken: vi.fn(async () => ({ csrf_token: 'csrf' })) },
      audit: { log: vi.fn() },
      config: { set: vi.fn(async () => ({ revision: 1 })), get: vi.fn() },
      schedules: { findDue: vi.fn(async () => []), markDone: vi.fn() }
    },
    content: { write: vi.fn(), writeRaw: vi.fn(), delete: vi.fn(), list: vi.fn(async () => []) }, body: {}
  } as unknown as ApiContext;
}
const link = { name: '待发布友链', url: 'https://friend.test', feed: 'https://friend.test/rss' };
const save = async (ctx: ApiContext, event: string, fields: Record<string, unknown>) => {
  ctx.body = { event, ...fields, deploy: true }; // Simulate old clients still requesting automatic deploy.
  return dispatch(event, ctx);
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(triggerPagesDeploy).mockResolvedValue({ ok: true, message: '部署已受理' });
});

describe('save only, publish explicitly', () => {
  it('multiple saves, refresh imports, settings and deletes trigger no deploy, even with legacy deploy=true', async () => {
    const ctx = context();
    const initialPublic = await readPublishedCommunity(ctx.env.R2);
    for (let n = 0; n < 3; n++) {
      await save(ctx, 'CONTENT_SAVE', { collection: 'essay', slug: 'test-post', frontmatter: { title: '文章', date: '2026-09-15', draft: false }, body: `正文 ${n}` });
    }
    await save(ctx, 'DATA_SAVE', { key: 'links', value: { links: [link] } });
    await save(ctx, 'DATA_SAVE', { key: 'memos', value: [] });
    await save(ctx, 'DATA_SAVE', { key: 'feed', value: { subscriptions: [] } });
    await save(ctx, 'MEMOS_SYNC', {});
    await save(ctx, 'THEME_SETTINGS_SAVE', { settings: { site: {} } });
    await save(ctx, 'CONFIG_UPDATE', { key: 'site', value: {} });
    await save(ctx, 'CONTENT_DELETE', { collection: 'essay', slug: 'test-post' });
    expect(ctx.content.write).toHaveBeenCalledTimes(3);
    expect(ctx.content.writeRaw).not.toHaveBeenCalled();
    expect(ctx.content.delete).toHaveBeenCalledOnce();
    expect((await readCommunity(ctx.env.R2)).links[0]?.name).toBe(link.name);
    expect(await readPublishedCommunity(ctx.env.R2)).toEqual(initialPublic);
    expect(triggerPagesDeploy).not.toHaveBeenCalled();
    expect(triggerDeploy).not.toHaveBeenCalled();
    ctx.body = { event: 'CONTENT_PUBLISH' };
    expect((await dispatch('CONTENT_PUBLISH', ctx)).status).toBe(200);
    expect(triggerPagesDeploy).toHaveBeenCalledOnce();
    expect(triggerDeploy).not.toHaveBeenCalled();
    expect((await readPublishedCommunity(ctx.env.R2)).links[0]?.name).toBe(link.name);
  });
  it('failed deployment leaves the published version and due schedules unchanged', async () => {
    const ctx = context();
    const current = await prepareCommunityPublication(ctx.env.R2);
    await publishCommunity(ctx.env.R2, current);
    await save(ctx, 'DATA_SAVE', { key: 'links', value: { links: [] } });
    vi.mocked(triggerPagesDeploy).mockResolvedValue({ ok: false, message: '触发失败' });
    ctx.body = { event: 'CONTENT_PUBLISH' };
    const response = await dispatch('CONTENT_PUBLISH', ctx);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(await readPublishedCommunity(ctx.env.R2)).toEqual(current);
    expect(ctx.repos.schedules.markDone).not.toHaveBeenCalled();
  });
  it('batches due schedules into one manual deployment', async () => {
    const ctx = context();
    vi.mocked(ctx.repos.schedules.findDue).mockResolvedValue([{ id: 'one' }, { id: 'two' }] as never);
    ctx.body = { event: 'CONTENT_PUBLISH' };
    await dispatch('CONTENT_PUBLISH', ctx);
    expect(triggerPagesDeploy).toHaveBeenCalledOnce();
    expect(ctx.repos.schedules.markDone).toHaveBeenCalledTimes(2);
  });
  it('cron does not trigger deployments', async () => {
    const ctx = context();
    await handleScheduled({ cron: '*/15 * * * *' } as ScheduledController, ctx.env, { waitUntil: vi.fn() });
    expect(triggerPagesDeploy).not.toHaveBeenCalled();
    expect(triggerDeploy).not.toHaveBeenCalled();
  });
  it('manual deployment still requires CSRF validation', async () => {
    const ctx = context();
    ctx.request = new Request('https://example.test/admin/api/CONTENT_PUBLISH', { method: 'POST' });
    ctx.body = { event: 'CONTENT_PUBLISH' };
    await expect(dispatch('CONTENT_PUBLISH', ctx)).rejects.toMatchObject({ status: 403 });
    expect(triggerPagesDeploy).not.toHaveBeenCalled();
  });
  it('returns a readable error when Memos sync is not configured', async () => {
    const ctx = context();
    vi.mocked(fetchMemos).mockRejectedValueOnce(new Error('缺少 MEMOS_API_URL，无法同步 Memos'));
    ctx.body = { event: 'MEMOS_SYNC' };
    await expect(dispatch('MEMOS_SYNC', ctx)).rejects.toMatchObject({
      status: 400,
      body: { message: '缺少 MEMOS_API_URL，无法同步 Memos' }
    });
  });
  it('imports multiple Markdown files into the current collection without deploying', async () => {
    const ctx = context();
    const response = await save(ctx, 'CONTENT_IMPORT_MARKDOWN', {
      collection: 'essay',
      files: [
        { name: 'first-post.md', markdown: '---\ntitle: 第一篇\ndate: 2026-09-16\n---\n正文' },
        { name: 'second-post.md', markdown: '---\ntitle: 第二篇\ndate: 2026-09-16\n---\n正文' }
      ]
    });
    await expect(response.json()).resolves.toMatchObject({ ok: true, count: 2, failedCount: 0 });
    expect(ctx.content.writeRaw).toHaveBeenCalledTimes(2);
    expect(ctx.content.writeRaw).toHaveBeenNthCalledWith(1, 'essay', 'first-post', expect.stringContaining('第一篇'));
    expect(ctx.content.writeRaw).toHaveBeenNthCalledWith(2, 'essay', 'second-post', expect.stringContaining('第二篇'));
    expect(triggerPagesDeploy).not.toHaveBeenCalled();
    expect(triggerDeploy).not.toHaveBeenCalled();
  });
  it('normalizes legacy Markdown metadata before importing', async () => {
    const ctx = context();
    const response = await save(ctx, 'CONTENT_IMPORT_MARKDOWN', {
      collection: 'essay',
      files: [{
        name: '旧文章.md',
        lastModified: Date.UTC(2025, 8, 30),
        markdown: '---\ntitle:\ndescription: null\ndate:\ntags: 博客，随笔\ndraft: "false"\nslug: 中文链接\n---\n# 旧文章标题\n正文'
      }]
    });
    await expect(response.json()).resolves.toMatchObject({ ok: true, count: 1, failedCount: 0 });
    expect(ctx.content.writeRaw).toHaveBeenCalledWith(
      'essay',
      '旧文章',
      expect.stringContaining('title: 旧文章标题')
    );
    expect(ctx.content.writeRaw).toHaveBeenCalledWith(
      'essay',
      '旧文章',
      expect.stringContaining('date: 2025-09-30')
    );
    expect(ctx.content.writeRaw).toHaveBeenCalledWith(
      'essay',
      '旧文章',
      expect.not.stringContaining('description:')
    );
    expect(triggerPagesDeploy).not.toHaveBeenCalled();
  });
  it('keeps existing articles when an imported Markdown filename is duplicated', async () => {
    const ctx = context();
    vi.mocked(ctx.content.list).mockResolvedValueOnce([{ slug: 'existing-post' }] as never);
    const response = await save(ctx, 'CONTENT_IMPORT_MARKDOWN', {
      collection: 'essay',
      files: [{ name: 'existing-post.md', markdown: '---\ntitle: 新版本\ndate: 2026-09-16\n---\n正文' }]
    });
    await expect(response.json()).resolves.toMatchObject({ ok: true, count: 0, skippedCount: 1 });
    expect(ctx.content.writeRaw).not.toHaveBeenCalled();
    expect(triggerPagesDeploy).not.toHaveBeenCalled();
  });
  it('overwrites an existing article only when explicitly requested', async () => {
    const ctx = context();
    vi.mocked(ctx.content.list).mockResolvedValueOnce([{ slug: 'existing-post' }] as never);
    const response = await save(ctx, 'CONTENT_IMPORT_MARKDOWN', {
      collection: 'essay',
      overwrite: true,
      files: [{ name: 'existing-post.md', markdown: '---\ntitle: 新版本\ndate: 2026-09-16\n---\n正文' }]
    });
    await expect(response.json()).resolves.toMatchObject({ ok: true, count: 1, skippedCount: 0 });
    expect(ctx.content.writeRaw).toHaveBeenCalledWith('essay', 'existing-post', expect.stringContaining('新版本'));
    expect(triggerPagesDeploy).not.toHaveBeenCalled();
  });
});
