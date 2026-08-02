// ============================================================================
// API 事件分发器（纯逻辑，不含 SvelteKit 的 RequestHandler 类型）
// 被路由 src/routes/api/[...event]/+server.ts 调用
// ============================================================================

import { json, error } from '@sveltejs/kit';
import { createRepos } from '$lib/server/db';
import { ContentStore } from '$lib/server/r2/content';
import { validateEvent } from './schemas';
import { isValidEvent, MUTATION_EVENTS, PUBLIC_EVENTS, Event } from './events';
import { validateFrontmatter } from '$lib/utils/content-schema';
import { resolveDeployConfig, triggerDeploy } from '$lib/server/deploy/github';
import { handleAiPolish, handleAiMetadata, handleAiModerate } from '$lib/server/ai/handlers';
import { listImages, deleteImage } from '$lib/server/r2/images';
import { writeThemeSettings } from '$lib/server/r2/theme-settings';
import { fetchSourceMarkdownFiles, type SourceRepoConfig } from '$lib/server/github/content-source';
import { fetchMemos } from '$lib/server/memos/client';
import { isSiteDataKey, writeJsonData } from '$lib/server/r2/site-data';
import {
  deleteWalineComment,
  listWalineComments,
  resolveWalineConfig,
  updateWalineCommentStatus
} from '$lib/server/waline/client';

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

async function handleCommentSubmit(ctx: ApiContext) {
  const id = crypto.randomUUID();
  await ctx.repos.comments.create({
    id,
    post_id: ctx.body.postId as string | undefined,
    post_title: ctx.body.postTitle as string | undefined,
    author: ctx.body.author as string,
    email: ctx.body.email as string | undefined,
    link: ctx.body.link as string | undefined,
    content: ctx.body.content as string
  });
  return json({ ok: true, id });
}

async function handleCommentList(ctx: ApiContext) {
  const status = ctx.body.status as string | undefined;
  const page = (ctx.body.page as number) ?? 1;
  const pageSize = (ctx.body.pageSize as number) ?? 20;
  const result = await listWalineComments({
    ...resolveWalineConfig(ctx.env),
    status: status as 'pending' | 'approved' | 'spam' | undefined,
    page,
    pageSize
  });
  return json({ ok: true, ...result });
}

async function handleCommentModerate(ctx: ApiContext) {
  const { id, status } = ctx.body as { id: string; status: string };
  await updateWalineCommentStatus({
    ...resolveWalineConfig(ctx.env),
    id,
    status: status as 'approved' | 'pending' | 'spam' | 'deleted'
  });
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
  await deleteWalineComment({ ...resolveWalineConfig(ctx.env), id });
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
  const { collection, slug, frontmatter, body, deploy } = ctx.body as {
    collection: string;
    slug: string;
    frontmatter: Record<string, unknown>;
    body: string;
    deploy?: boolean;
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

  if (deploy) {
    const deployResult = await triggerDeployIfNeeded(ctx);
    return json({ ok: true, deploy: deployResult });
  }
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
  const result = await triggerDeployIfNeeded(ctx);
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

async function handleDataSave(ctx: ApiContext) {
  const key = String(ctx.body.key ?? '');
  if (!isSiteDataKey(key)) {
    throw error(400, '未知的数据类型');
  }

  await writeJsonData(ctx.env.R2, key, ctx.body.value);

  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'DATA_SAVE',
    target: key,
    ip: ctx.locals.ip
  });

  if (ctx.body.deploy) {
    const deployResult = await triggerDeployIfNeeded(ctx);
    return json({ ok: true, key, deploy: deployResult });
  }

  return json({ ok: true, key });
}

async function handleMemosSync(ctx: ApiContext) {
  const items = await fetchMemos(ctx.env);
  await writeJsonData(ctx.env.R2, 'memos', items);

  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'MEMOS_SYNC',
    target: 'memos',
    detail: { count: items.length },
    ip: ctx.locals.ip
  });

  if (ctx.body.deploy) {
    const deployResult = await triggerDeployIfNeeded(ctx);
    return json({ ok: true, items, count: items.length, deploy: deployResult });
  }

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
  const { settings, deploy } = ctx.body as {
    settings: Record<string, unknown>;
    deploy?: boolean;
  };

  const saved = await writeThemeSettings(ctx.env.R2, settings);
  await ctx.repos.audit.log({
    sessionId: ctx.locals.session!.id,
    action: 'THEME_SETTINGS_SAVE',
    detail: { groups: Object.keys(saved) },
    ip: ctx.locals.ip
  });

  if (deploy) {
    const deployResult = await triggerDeployIfNeeded(ctx);
    return json({ ok: true, settings: saved, deploy: deployResult });
  }

  return json({ ok: true, settings: saved });
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
  services.push(
    ctx.env.GITHUB_TOKEN
      ? { name: 'GitHub 部署', status: 'ok' }
      : { name: 'GitHub 部署', status: 'degraded', detail: '未配置 GITHUB_TOKEN' }
  );

  // 统计
  const commentCounts = await ctx.repos.comments.countByStatus().catch(() => ({}));
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
      message: `缺少 GITHUB_TOKEN，无法触发 ${config.owner}/${config.repo} 的 ${config.workflow}`
    };
  }

  return triggerDeploy(ctx.env.GITHUB_TOKEN, config);
}
