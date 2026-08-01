// ============================================================================
// AI Handler（润色/元数据/审核）
// 对接 Cloudflare Workers AI
// ============================================================================

import { json, error } from '@sveltejs/kit';
import type { ApiContext } from '$lib/api/dispatcher';

// ---------------------------------------------------------------------------
// 润色（流式输出）
// ---------------------------------------------------------------------------
export async function handleAiPolish(ctx: ApiContext): Promise<Response> {
  const { text } = ctx.body as { text: string };
  if (!ctx.env.AI) throw error(503, 'Workers AI 未绑定');

  const aiConfig = await ctx.repos.config.get<{ model: string; polish_prompt: string }>('ai');
  const model = aiConfig?.model ?? '@cf/qwen/qwen1.5-14b-chat-aliyun';
  const systemPrompt = aiConfig?.polish_prompt ?? '请改写以下文字使其更通顺自然，保持原意。';

  const stream = await aiStream(ctx.env.AI, model, systemPrompt, text);

  // 转 SSE 推送给前端
  const encoder = new TextEncoder();
  const sseStream = new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encoder.encode(`data: ${new TextDecoder().decode(value)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: e instanceof Error ? e.message : '生成失败' })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}

// ---------------------------------------------------------------------------
// 元数据补全（返回 JSON）
// ---------------------------------------------------------------------------
export async function handleAiMetadata(ctx: ApiContext): Promise<Response> {
  const { content } = ctx.body as { content: string };
  const fallbackMetadata = createLocalMetadata(content);

  if (!ctx.env.AI) {
    return json({
      ok: true,
      metadata: fallbackMetadata,
      source: 'local',
      warning: 'Workers AI 未绑定，已使用正文内容自动补齐'
    });
  }

  const aiConfig = await ctx.repos.config.get<{ model: string; metadata_prompt: string }>('ai');
  const model = aiConfig?.model ?? '@cf/qwen/qwen1.5-14b-chat-aliyun';
  const systemPrompt =
    aiConfig?.metadata_prompt ??
    '分析文章内容，输出 JSON：{title, description, tags:[], date}。只输出 JSON。';

  let result = '';
  try {
    result = await aiRun(ctx.env.AI, model, systemPrompt, content.slice(0, 3000));
  } catch (e) {
    return json({
      ok: true,
      metadata: fallbackMetadata,
      source: 'local',
      warning: `AI 元数据生成失败，已使用正文内容自动补齐：${toErrorMessage(e)}`
    });
  }

  // 尝试从结果中提取 JSON
  const jsonStr = extractJson(result);
  let metadata: Record<string, unknown> = {};
  try {
    metadata = jsonStr ? JSON.parse(jsonStr) : fallbackMetadata;
  } catch {
    return json({
      ok: true,
      metadata: fallbackMetadata,
      source: 'local',
      warning: 'AI 返回的内容无法解析为 JSON，已使用正文内容自动补齐'
    });
  }

  return json({ ok: true, metadata: normalizeMetadata(metadata, fallbackMetadata), source: 'ai' });
}

// ---------------------------------------------------------------------------
// 评论审核
// ---------------------------------------------------------------------------
export async function handleAiModerate(ctx: ApiContext): Promise<Response> {
  const { content: commentContent } = ctx.body as { content: string };
  if (!ctx.env.AI) throw error(503, 'Workers AI 未绑定');

  const aiConfig = await ctx.repos.config.get<{ model: string; moderate_prompt: string }>('ai');
  const model = aiConfig?.model ?? '@cf/qwen/qwen1.5-14b-chat-aliyun';
  const systemPrompt =
    aiConfig?.moderate_prompt ??
    '判断评论是否为垃圾/广告/不当内容。输出 JSON：{verdict: approve|review|spam, score: 0-1}。';

  const result = await aiRun(ctx.env.AI, model, systemPrompt, commentContent);

  const jsonStr = extractJson(result);
  try {
    const verdict = jsonStr ? JSON.parse(jsonStr) : { verdict: 'review', score: 0.5 };
    return json({ ok: true, ...verdict });
  } catch {
    return json({ ok: false, raw: result, verdict: 'review', score: 0.5 });
  }
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 非流式调用 AI */
async function aiRun(ai: Ai, model: string, systemPrompt: string, userContent: string): Promise<string> {
  const response = (await (ai.run as any)(model, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ]
  })) as { response?: string; result?: { response?: string } } | string;

  if (typeof response === 'string') return response;
  return response.response ?? response.result?.response ?? '';
}

/** 流式调用 AI，返回 ReadableStream */
async function aiStream(
  ai: Ai,
  model: string,
  systemPrompt: string,
  userContent: string
): Promise<ReadableStream<Uint8Array>> {
  const response = (await (ai.run as any)(model, {
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ]
  })) as ReadableStream<Uint8Array>;

  return response;
}

/** 从 AI 输出中提取 JSON（可能包裹在 ```json 代码块中） */
function extractJson(text: string): string | null {
  // 尝试提取 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // 尝试提取 { ... } 或 [ ... ]
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) return jsonMatch[1].trim();

  return null;
}

function normalizeMetadata(
  metadata: Record<string, unknown>,
  fallback: Record<string, unknown>
): Record<string, unknown> {
  return {
    title: asNonEmptyString(metadata.title) ?? fallback.title,
    description: asNonEmptyString(metadata.description) ?? fallback.description,
    tags: normalizeTags(metadata.tags) ?? fallback.tags,
    date: normalizeDate(metadata.date) ?? fallback.date
  };
}

function createLocalMetadata(content: string): Record<string, unknown> {
  const plain = toPlainText(content);
  const title = extractTitle(content, plain);
  const description = truncateText(firstParagraph(plain) || title, 120);
  const tags = extractTags(plain);

  return {
    title,
    description,
    tags,
    date: todayInShanghai()
  };
}

function extractTitle(content: string, plain: string): string {
  const heading = content.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim();
  if (heading) return truncateText(stripInlineMarkdown(heading), 32);

  const firstLine = plain
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return truncateText(firstLine || '未命名文章', 32);
}

function firstParagraph(text: string): string {
  return (
    text
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? ''
  );
}

function toPlainText(markdown: string): string {
  return stripInlineMarkdown(
    markdown
      .replace(/^---[\s\S]*?---\s*/m, '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}[-*+]\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_~>#`]/g, '')
    .trim();
}

function truncateText(text: string, max: number): string {
  const value = text.replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function extractTags(text: string): string[] {
  const candidates = [
    '生活',
    '家庭',
    '教育',
    '旅行',
    '节日',
    '网站',
    '博客',
    '折腾',
    '阅读',
    '工作',
    '孩子',
    '成长',
    '情绪',
    '记录',
    '随笔'
  ];

  const matched = candidates.filter((tag) => text.includes(tag));
  return Array.from(new Set(matched)).slice(0, 5);
}

function normalizeTags(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const tags = value.map((item) => String(item).trim()).filter(Boolean);
    return tags.length ? tags.slice(0, 8) : undefined;
  }
  if (typeof value === 'string') {
    const tags = value
      .split(/[,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return tags.length ? tags.slice(0, 8) : undefined;
  }
  return undefined;
}

function normalizeDate(value: unknown): string | undefined {
  const text = asNonEmptyString(value);
  if (!text) return undefined;
  const iso = text.match(/\d{4}-\d{1,2}-\d{1,2}/)?.[0];
  if (!iso) return undefined;
  const [year, month, day] = iso.split('-');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function todayInShanghai(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toErrorMessage(errorValue: unknown): string {
  return errorValue instanceof Error ? errorValue.message : '未知错误';
}
