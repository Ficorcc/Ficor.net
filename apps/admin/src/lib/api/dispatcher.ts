// ============================================================================
// API 事件分发器（纯逻辑，不含 SvelteKit 的 RequestHandler 类型）
// 被路由 src/routes/api/[...event]/+server.ts 调用
// ============================================================================

import { json, error } from '@sveltejs/kit';
import { createRepos } from '$lib/server/db';
import { ContentStore } from '$lib/server/r2/content';
import { validateEvent } from './schemas';
import { isValidEvent, MUTATION_EVENTS, PUBLIC_EVENTS, Event } from './events';
import { ESSAY_PUBLIC_SLUG_RE, validateFrontmatter } from '$lib/utils/content-schema';
import { parseMarkdown, serializeMarkdown } from '$lib/utils/frontmatter';
import { resolveDeployConfig, triggerDeploy } from '$lib/server/deploy/github';
import { triggerPagesDeploy } from '$lib/server/deploy/cloudflare';
import { handleAiPolish, handleAiMetadata, handleAiModerate } from '$lib/server/ai/handlers';
import { listImages, deleteImage } from '$lib/server/r2/images';
import { writeThemeSettings } from '$lib/server/r2/theme-settings';
import { fetchSourceMarkdownFiles, type SourceRepoConfig } from '$lib/server/github/content-source';
import { fetchMemos } from '$lib/server/memos/client';
import { refreshCommunityFeeds } from '$lib/server/community-feeds';
import { prepareCommunityPublication, publishCommunity } from '$lib/server/community';
import { saveCommunityLinks } from '$lib/server/community';
import { isSiteDataKey, writeJsonData } from '$lib/server/r2/site-data';
import { listComments, moderateComment, countComments } from '$lib/server/fiscus/admin';
import { updateCommentSettings } from '$lib/server/fiscus/settings';
import { withFiscus } from '$lib/server/fiscus/runtime';
import { parseLevels } from '$lib/server/fiscus/levels';
import { recomputeCommentLevels } from '$lib/server/fiscus/db';

export interface ApiContext {
  request: Request;
  env: App.Platform['env'];
  repos: ReturnType<typeof createRepos>;
  content: ContentStore;
  locals: App.Locals;
  body: Record<string, unknown>;
}

/** 主分发函数，由路由 +server.ts 调用 */
export async function dispatch(event: string, ctx: ApiContext): Promise<Response> {
  // 公开事件不需要鉴权
  const isPublic = PUBLIC_EVENTS.has(event);
  if (!isPublic && !ctx.locals.session) {
    throw error(401, '未登录或会话已过期');
  }

  // CSRF 校验（mutation 事件）
  if (MUTATION_EVENTS.has(event) && ctx.locals.session) {
    const csrfToken = ctx.request.headers.get('x-csrf-token');
    if (!csrfToken) {
      throw error(403, '缺少 CSRF token');
    }
    const sessionRow = await ctx.repos.sessions.findByToken(ctx.locals.session.token);
    if (!sessionRow || sessionRow.csrf_token !== csrfToken) {
      throw error(403, 'CSRF token 无效或已过期');
    }
  }

  // 校验请求体
  const validation = validateEvent(event, ctx.body);
  if (!validation.success) {
    throw error(400, `参数校验失败: ${validation.errors.join('; ')}`);
  }
  ctx.body = validation.data;

  // 路由到 handler
  switch (event) {
    case Event.CSRF_ISSUE:
      return handleCsrfIssue(ctx);
    case Event.COMMENT_SUBMIT:
      return handleCommentSubmit(ctx);
    case Event.COMMENT_MODERATE:
      return handleCommentModerate(ctx);
    case Event.COMMENT_DELETE:
      return handleCommentDelete(ctx);
    case Event.CONTENT_LIST:
      return handleContentList(ctx);
    case Event.CONTENT_GET:
      return handleContentGet(ctx);
    case Event.CONTENT_SAVE:
      return handleContentSave(ctx);
    case Event.CONTENT_DELETE:
      return handleContentDelete(ctx);
    case Event.CONTENT_SEARCH:
      return handleContentSearch(ctx);
    case Event.CONTENT_PUBLISH:
      return handleContentPublish(ctx);
    case Event.CONTENT_PULL_SOURCE:
      return handleContentPullSource(ctx);
    case Event.CONTENT_IMPORT_MARKDOWN:
      return handleContentImportMarkdown(ctx);
    case Event.FEEDS_REFRESH: {
      const result = await refreshCommunityFeeds(ctx.env.R2, Number(ctx.body.cursor ?? 0));
      await ctx.repos.audit.log({ sessionId: ctx.locals.session!.id, action: 'FEEDS_REFRESH', detail: result, ip: ctx.locals.ip });
      return json({ ok: true, ...result });
    }
    case Event.DATA_SAVE:
      return handleDataSave(ctx);
    case Event.MEMOS_SYNC:
      return handleMemosSync(ctx);
    case Event.IMAGE_LIST:
      return json({ ok: true, items: await listImages(ctx.env.R2, String(ctx.body.prefix ?? '')) });
    case Event.IMAGE_DELETE:
      return handleImageDelete(ctx);
    case Event.AI_POLISH:
      return handleAiPolish(ctx);
    case Event.AI_METADATA:
      return handleAiMetadata(ctx);
    case Event.AI_MODERATE:
      return handleAiModerate(ctx);
    case Event.SCHEDULE_CREATE:
      return handleScheduleCreate(ctx);
    case Event.SCHEDULE_CANCEL:
      return handleScheduleCancel(ctx);
    case Event.CONFIG_GET:
      return json({ ok: true, config: await ctx.repos.config.getAll() });
    case Event.CONFIG_UPDATE:
      return handleConfigUpdate(ctx);
    case Event.THEME_SETTINGS_SAVE:
      return handleThemeSettingsSave(ctx);
    case Event.COMMENT_SETTINGS_SAVE:
      return handleCommentSettingsSave(ctx);
    case Event.AUDIT_LIST:
      return handleAuditList(ctx);
    case Event.HEALTH_CHECK:
      return handleHealthCheck(ctx);
    case Event.STATS_GET:
      return json({ ok: true, stats: await ctx.repos.stats.getAll() });
    case Event.SCHEDULE_LIST:
      return json({ ok: true, items: await ctx.repos.schedules.list() });
    case Event.COMMENT_LIST:
      return handleCommentList(ctx);
    default:
      throw error(400, `未实现的 event: ${event}`);
  }
}

// ---------------------------------------------------------------------------
// Handler 实现
// ---------------------------------------------------------------------------

async function handleCsrfIssue(ctx: ApiContext) {
  if (!ctx.locals.session) throw error(401, '未登录');
  const sessionRow = await ctx.repos.sessions.findByToken(ctx.locals.session.token);
  if (!sessionRow) throw error(401, '会话无效');
  return json({ ok: true, csrfToken: sessionRow.csrf_token });
}

async function handleCommentSubmit(_ctx: ApiContext): Promise<Response> {
  throw error(410, '请使用 /admin/api/comments 提交评论');
}

async function handleCommentList(ctx: ApiContext) {
  const result = await listComments(ctx.env, ctx.body.status as string | undefined, ctx.body.page as number | undefined, ctx.body.pageSize as number | undefined);
  return json({ ok: true, ...result });
}

async function handleCommentModerate(ctx: ApiContext) {
  const { id, status } = ctx.body as { id: string; status: string };
  await moderateComment(ctx.env, id, status);
  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'COMMENT_MODERATE',
    target: id,
    detail: { status },
    ip: ctx.locals.ip
  });
  return json({ ok: true });
}

async function handleCommentDelete(ctx: ApiContext) {
  const { id } = ctx.body as { id: string };
  await moderateComment(ctx.env, id, 'deleted');
  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'COMMENT_DELETE',
    target: id,
    ip: ctx.locals.ip
  });
  return json({ ok: true });
}

async function handleContentList(ctx: ApiContext) {
  const collection = ctx.body.collection as string;
  const items = await ctx.content.list(collection);
  return json({ ok: true, items });
}

async function handleContentGet(ctx: ApiContext) {
  const { collection, slug } = ctx.body as { collection: string; slug: string };
  const item = await ctx.content.read(collection, slug);
  if (!item) throw error(404, '文章不存在');
  return json({ ok: true, frontmatter: item.frontmatter, body: item.body });
}

async function handleContentSave(ctx: ApiContext) {
  const { collection, slug, frontmatter, body } = ctx.body as {
    collection: string;
    slug: string;
    frontmatter: Record<string, unknown>;
    body: string;
  };

  const fmValidation = validateFrontmatter(collection, frontmatter);
  if (!fmValidation.success) {
    throw error(400, `frontmatter 校验失败: ${fmValidation.errors.join('; ')}`);
  }

  await ctx.content.write(collection, slug, fmValidation.data, body);

  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'CONTENT_SAVE',
    target: `${collection}/${slug}`,
    ip: ctx.locals.ip
  });

  return json({ ok: true });
}

async function handleContentDelete(ctx: ApiContext) {
  const { collection, slug } = ctx.body as { collection: string; slug: string };
  await ctx.content.delete(collection, slug);
  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'CONTENT_DELETE',
    target: `${collection}/${slug}`,
    ip: ctx.locals.ip
  });
  return json({ ok: true });
}

async function handleContentSearch(ctx: ApiContext) {
  const { keyword } = ctx.body as { keyword: string };
  const results = await ctx.content.search(keyword);
  return json({ ok: true, results });
}

async function handleContentPublish(ctx: ApiContext) {
  // Only this explicit action may trigger a build. Capture saved community data first.
  const publication = await prepareCommunityPublication(ctx.env.R2);
  const dueSchedules = await ctx.repos.schedules.findDue();
  const result = await triggerDeployIfNeeded(ctx);
  if (result.ok) {
    try {
      await publishCommunity(ctx.env.R2, publication);
      for (const schedule of dueSchedules) await ctx.repos.schedules.markDone(schedule.id);
    } catch {
      // The build was already accepted: do not encourage retrying it as a failed trigger.
      result.message += '；部署已受理，但共享数据发布记录未完成，请检查后台日志后处理';
      await ctx.repos.audit.log({ sessionId: ctx.locals.session!.id, action: 'PUBLICATION_RECORD_FAILED', ip: ctx.locals.ip });
    }
  }
  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'CONTENT_PUBLISH',
    detail: result,
    ip: ctx.locals.ip
  });
  return json({ ok: result.ok, message: result.message, deploy: result });
}

async function handleContentPullSource(ctx: ApiContext) {
  const collection = ctx.body.collection as 'essay' | 'bits' | 'memo';
  const cursor = typeof ctx.body.cursor === 'number' ? ctx.body.cursor : 0;
  const token = ctx.env.GITHUB_TOKEN;
  const deployConfig = await ctx.repos.config.get<SourceRepoConfig>('deploy');
  const { owner, repo, ref } = resolveDeployConfig(deployConfig, ctx.env);

  if (!owner || !repo) {
    throw error(400, '主站 GitHub 仓库配置不完整，请先在系统设置里填写部署仓库');
  }

  let batch;
  try {
    batch = await fetchSourceMarkdownFiles(token, { owner, repo, ref }, collection, { cursor, limit: 12 });
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : '主站数据源抓取失败');
  }
  for (const file of batch.files) {
    await ctx.content.writeRaw(collection, file.slug, file.markdown);
  }

  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'CONTENT_PULL_SOURCE',
    target: collection,
    detail: {
      owner,
      repo,
      ref: ref || 'main',
      count: batch.files.length,
      cursor,
      nextCursor: batch.nextCursor,
      total: batch.total
    },
    ip: ctx.locals.ip
  });

  return json({
    ok: true,
    count: batch.files.length,
    total: batch.total,
    nextCursor: batch.nextCursor,
    done: batch.nextCursor === undefined,
    source: `${owner}/${repo}`,
    ref: ref || 'main'
  });
}

function slugFromMarkdownFilename(name: string): string {
  const filename = name
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.trim() ?? '';
  if (!/\.md$/i.test(filename)) {
    throw new Error(`不是 Markdown 文件：${name}`);
  }
  const slug = filename.replace(/\.md$/i, '').trim();
  if (!slug) throw new Error(`文件名缺少 slug：${name}`);
  return slug;
}

function importFallbackDate(lastModified?: number): string {
  const date = lastModified && Number.isFinite(lastModified) ? new Date(lastModified) : new Date();
  return date.toISOString().slice(0, 10);
}

function normalizeImportDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  const match = text.match(/^(\d{4})[-/.年]?(\d{1,2})[-/.月]?(\d{1,2})/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function importTitleFromMarkdown(name: string, body: string): string {
  const heading = body.match(/^\s*#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
  if (heading) return heading.replace(/[*_`]/g, '').trim() || heading;
  return name.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '').trim() || '未命名文章';
}

function normalizeImportedFrontmatter(
  collection: 'essay' | 'bits' | 'memo',
  name: string,
  body: string,
  frontmatter: Record<string, unknown>,
  lastModified?: number
): Record<string, unknown> {
  const normalized = Object.fromEntries(
    Object.entries(frontmatter).filter(([, value]) => value !== null)
  ) as Record<string, unknown>;

  if ((collection === 'essay' || collection === 'memo') && typeof normalized.title !== 'string') {
    normalized.title = importTitleFromMarkdown(name, body);
  }
  if (typeof normalized.title === 'string' && !normalized.title.trim() && collection !== 'bits') {
    normalized.title = importTitleFromMarkdown(name, body);
  }

  if (normalized.description !== undefined && typeof normalized.description !== 'string') {
    delete normalized.description;
  }

  const date = normalizeImportDate(normalized.date);
  if (date) {
    normalized.date = date;
  } else if (collection === 'essay' || collection === 'bits') {
    normalized.date = importFallbackDate(lastModified);
  } else {
    delete normalized.date;
  }

  if (normalized.tags !== undefined) {
    if (Array.isArray(normalized.tags)) {
      normalized.tags = normalized.tags.map((tag) => String(tag).trim()).filter(Boolean);
    } else if (typeof normalized.tags === 'string') {
      normalized.tags = normalized.tags.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean);
    } else {
      delete normalized.tags;
    }
  }

  for (const key of ['draft', 'archive', 'comment']) {
    const value = normalized[key];
    if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) {
      normalized[key] = value.trim().toLowerCase() === 'true';
    } else if (value !== undefined && typeof value !== 'boolean') {
      delete normalized[key];
    }
  }

  if (normalized.slug !== undefined && (typeof normalized.slug !== 'string' || !ESSAY_PUBLIC_SLUG_RE.test(normalized.slug))) {
    delete normalized.slug;
  }

  return normalized;
}

async function handleContentImportMarkdown(ctx: ApiContext) {
  const { collection, files, overwrite = false } = ctx.body as {
    collection: 'essay' | 'bits' | 'memo';
    overwrite?: boolean;
    files: Array<{ name: string; markdown: string; lastModified?: number }>;
  };
  const existingSlugs = new Set((await ctx.content.list(collection)).map((item) => item.slug));
  const imported: Array<{ name: string; slug: string }> = [];
  const skipped: Array<{ name: string; slug: string }> = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const file of files) {
    try {
      const slug = slugFromMarkdownFilename(file.name);
      if (existingSlugs.has(slug) && !overwrite) {
        skipped.push({ name: file.name, slug });
        continue;
      }
      const parsed = parseMarkdown(file.markdown);
      const frontmatter = normalizeImportedFrontmatter(
        collection,
        file.name,
        parsed.body,
        parsed.frontmatter,
        file.lastModified
      );
      const fmValidation = validateFrontmatter(collection, frontmatter);
      if (!fmValidation.success) {
        throw new Error(`frontmatter 校验失败: ${fmValidation.errors.join('; ')}`);
      }
      await ctx.content.writeRaw(collection, slug, serializeMarkdown(frontmatter, parsed.body));
      imported.push({ name: file.name, slug });
      existingSlugs.add(slug);
    } catch (e) {
      failed.push({ name: file.name, error: e instanceof Error ? e.message : '导入失败' });
    }
  }

  if (imported.length === 0 && skipped.length === 0) {
    const detail = failed.map((item) => `${item.name}: ${item.error}`).join('；');
    throw error(400, detail || '没有可导入的 Markdown 文件');
  }

  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'CONTENT_IMPORT_MARKDOWN',
    target: collection,
    detail: {
      imported: imported.length,
      skipped: skipped.length,
      failed: failed.length,
      slugs: imported.map((item) => item.slug)
    },
    ip: ctx.locals.ip
  });

  return json({
    ok: true,
    imported,
    skipped,
    failed,
    count: imported.length,
    skippedCount: skipped.length,
    failedCount: failed.length
  });
}

async function handleDataSave(ctx: ApiContext) {
  const key = String(ctx.body.key ?? '');
  if (!isSiteDataKey(key)) {
    throw error(400, '未知的数据类型');
  }

  if (key === 'links') {
    try { await saveCommunityLinks(ctx.env.R2, ctx.body.value); }
    catch (e) { throw error(400, e instanceof Error ? e.message : '友链保存失败'); }
  } else {
    await writeJsonData(ctx.env.R2, key, ctx.body.value);
  }

  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'DATA_SAVE',
    target: key,
    ip: ctx.locals.ip
  });


  return json({ ok: true, key });
}

async function handleMemosSync(ctx: ApiContext) {
  let items;
  try {
    items = await fetchMemos(ctx.env);
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : 'Memos 同步失败');
  }

  await writeJsonData(ctx.env.R2, 'memos', items);

  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'MEMOS_SYNC',
    target: 'memos',
    detail: { count: items.length },
    ip: ctx.locals.ip
  });


  return json({ ok: true, items, count: items.length });
}

async function handleImageDelete(ctx: ApiContext) {
  const { key } = ctx.body as { key: string };
  await deleteImage(ctx.env.R2, key);
  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'IMAGE_DELETE',
    target: key,
    ip: ctx.locals.ip
  });
  return json({ ok: true });
}

async function handleScheduleCreate(ctx: ApiContext) {
  const { collection, slug, scheduledAt } = ctx.body as {
    collection: string;
    slug: string;
    scheduledAt: string;
  };
  const id = crypto.randomUUID();
  await ctx.repos.schedules.create({ id, collection, slug, scheduledAt });
  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'SCHEDULE_CREATE',
    target: `${collection}/${slug}`,
    detail: { scheduledAt },
    ip: ctx.locals.ip
  });
  return json({ ok: true, id });
}

async function handleScheduleCancel(ctx: ApiContext) {
  const { id } = ctx.body as { id: string };
  const ok = await ctx.repos.schedules.cancel(id);
  if (!ok) throw error(400, '任务不存在或已不可取消');
  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'SCHEDULE_CANCEL',
    target: id,
    ip: ctx.locals.ip
  });
  return json({ ok: true });
}

async function handleConfigUpdate(ctx: ApiContext) {
  const { key, value, revision } = ctx.body as { key: string; value: unknown; revision?: number };
  try {
    const result = await ctx.repos.config.set(key, value, revision);
    await ctx.repos.audit.log({
      sessionId: ctx.locals.session!.id,
      action: 'CONFIG_UPDATE',
      target: key,
      detail: { revision: result.revision },
      ip: ctx.locals.ip
    });
    return json({ ok: true, revision: result.revision });
  } catch (e) {
    if (e instanceof Error && e.name === 'ConfigConflictError') {
      throw error(409, e.message);
    }
    throw e;
  }
}

async function handleThemeSettingsSave(ctx: ApiContext) {
  const { settings } = ctx.body as {
    settings: Record<string, unknown>;
  };

  const saved = await writeThemeSettings(ctx.env.R2, settings);
  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'THEME_SETTINGS_SAVE',
    detail: { groups: Object.keys(saved) },
    ip: ctx.locals.ip
  });


  return json({ ok: true, settings: saved });
}

/**
 * 保存评论设置（评论等级表 + 邮箱参数等）。
 *
 * 等级是在评论写入时算好并落库的，所以改了等级表之后既有评论不会自己变。
 * 默认顺手重算一次（`recomputeLevels` 传 false 可跳过），
 * 否则「改了等级名称但前台没反应」会被当成 bug。
 */
async function handleCommentSettingsSave(ctx: ApiContext) {
  const { settings, recomputeLevels = true } = ctx.body as {
    settings: Record<string, unknown>;
    recomputeLevels?: boolean;
  };

  const saved = await withFiscus(ctx.env, () => updateCommentSettings(settings));

  // 只有本次真的动了等级表才重算，避免每次保存文案都全表扫一遍
  const levelsChanged = Object.prototype.hasOwnProperty.call(settings, 'commentLevels');
  let recomputed = false;
  if (recomputeLevels && levelsChanged) {
    await withFiscus(ctx.env, () => recomputeCommentLevels(parseLevels(saved.commentLevels)));
    recomputed = true;
  }

  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'COMMENT_SETTINGS_SAVE',
    detail: { keys: Object.keys(settings), recomputed },
    ip: ctx.locals.ip
  });

  return json({ ok: true, settings: saved, recomputed });
}

async function handleAuditList(ctx: ApiContext) {
  const { action, page, pageSize } = ctx.body as {
    action?: string;
    page?: number;
    pageSize?: number;
  };
  const result = await ctx.repos.audit.list({ action, page, pageSize });
  return json({ ok: true, ...result });
}

async function handleHealthCheck(ctx: ApiContext) {
  const services: Array<{ name: string; status: 'ok' | 'degraded' | 'down'; detail?: string }> = [];

  // D1
  try {
    await ctx.repos.config.get('site');
    services.push({ name: 'D1 数据库', status: 'ok' });
  } catch (e) {
    services.push({ name: 'D1 数据库', status: 'down', detail: e instanceof Error ? e.message : '错误' });
  }

  // R2
  try {
    await ctx.env.R2.head('content/essay/.health');
    services.push({ name: 'R2 存储', status: 'ok' });
  } catch {
    services.push({ name: 'R2 存储', status: 'ok', detail: '可访问' });
  }

  // AI
  services.push(
    ctx.env.AI
      ? { name: 'Workers AI', status: 'ok' }
      : { name: 'Workers AI', status: 'down', detail: '未绑定' }
  );

  // 部署钩子
  if (ctx.env.CLOUDFLARE_DEPLOY_HOOK) {
    services.push({ name: 'Cloudflare 部署', status: 'ok' });
  } else {
    services.push(
      ctx.env.GITHUB_TOKEN
        ? { name: 'GitHub 部署', status: 'ok' }
        : { name: '部署', status: 'degraded', detail: '未配置 CLOUDFLARE_DEPLOY_HOOK 或 GITHUB_TOKEN' }
    );
  }

  // 统计
  const commentCounts = await countComments(ctx.env).catch(() => ({}));
  const essayCount = (await ctx.content.list('essay')).length;
  const bitsCount = (await ctx.content.list('bits')).length;

  return json({
    ok: true,
    services,
    stats: {
      comments: commentCounts,
      essays: essayCount,
      bits: bitsCount
    }
  });
}

async function triggerDeployIfNeeded(ctx: ApiContext) {
  // 优先直接调用 Cloudflare Pages 部署钩子（不经过 GitHub Actions）
  if (ctx.env.CLOUDFLARE_DEPLOY_HOOK) {
    return triggerPagesDeploy(ctx.env.CLOUDFLARE_DEPLOY_HOOK);
  }

  // 回退：通过 GitHub Actions workflow_dispatch 间接触发
  const deployConfig = await ctx.repos.config.get<{
    owner: string;
    repo: string;
    workflow: string;
    ref?: string;
  }>('deploy');

  const config = resolveDeployConfig(deployConfig, ctx.env);

  if (!ctx.env.GITHUB_TOKEN) {
    return {
      ok: false,
      message: `未配置 CLOUDFLARE_DEPLOY_HOOK 或 GITHUB_TOKEN，无法触发部署`
    };
  }

  return triggerDeploy(ctx.env.GITHUB_TOKEN, config);
}
