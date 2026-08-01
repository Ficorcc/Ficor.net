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
  if (!ctx.env.AI) throw error(503, 'Workers AI 未绑定');

  const aiConfig = await ctx.repos.config.get<{ model: string; metadata_prompt: string }>('ai');
  const model = aiConfig?.model ?? '@cf/qwen/qwen1.5-14b-chat-aliyun';
  const systemPrompt =
    aiConfig?.metadata_prompt ??
    '分析文章内容，输出 JSON：{title, description, tags:[], date}。只输出 JSON。';

  const result = await aiRun(ctx.env.AI, model, systemPrompt, content.slice(0, 3000));

  // 尝试从结果中提取 JSON
  const jsonStr = extractJson(result);
  let metadata: Record<string, unknown> = {};
  try {
    metadata = jsonStr ? JSON.parse(jsonStr) : {};
  } catch {
    // 解析失败返回原始文本
    return json({ ok: false, raw: result, error: 'AI 返回的内容无法解析为 JSON' });
  }

  return json({ ok: true, metadata });
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
  })) as { response?: string };

  return response.response ?? '';
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
