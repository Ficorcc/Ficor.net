// ============================================================================
// 图片上传 API（multipart/form-data）
// 单独路由，不走 JSON dispatcher，因为接收的是文件流
// ============================================================================

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRepos } from '$lib/server/db';
import { uploadImage } from '$lib/server/r2/images';
import { validateCsrf } from '$lib/server/auth/csrf';
import { processImage } from '$lib/server/image/photon';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  if (!platform?.env?.DB || !platform?.env?.R2) {
    throw error(503, 'R2 存储未配置');
  }
  if (!locals.session) {
    throw error(401, '未登录');
  }

  // CSRF 校验
  const csrfToken = request.headers.get('x-csrf-token');
  if (!csrfToken) throw error(403, '缺少 CSRF token');
  const repos = createRepos(platform.env.DB);
  const sessionRow = await repos.sessions.findByToken(locals.session.token);
  if (!sessionRow || sessionRow.csrf_token !== csrfToken) {
    throw error(403, 'CSRF token 无效');
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw error(400, '未提供文件');
  }

  if (!file.type.startsWith('image/')) {
    throw error(400, '只支持图片文件');
  }

  // 限制 20MB
  const MAX_SIZE = 20 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw error(413, '图片不能超过 20MB');
  }

  const arrayBuffer = await file.arrayBuffer();

  // 读取图片处理配置
  const imageConfig = await repos.config.get<{
    auto_webp: boolean;
    max_width: number;
    quality: number;
  }>('image');

  const watermarkConfig = await repos.config.get<{
    enabled: boolean;
    image_key: string;
    position: string;
    opacity: number;
    scale: number;
  }>('watermark');

  // 图片处理（WebP 转换 + 水印）
  let processedData = arrayBuffer;
  let contentType = file.type;
  let filename = file.name;

  try {
    const processed = await processImage({
      data: arrayBuffer,
      contentType: file.type,
      config: imageConfig ?? { auto_webp: true, max_width: 2400, quality: 82 },
      watermark: watermarkConfig,
      r2: platform.env.R2
    });
    processedData = processed.data;
    contentType = processed.contentType;
    if (processed.contentType === 'image/webp') {
      filename = filename.replace(/\.[^.]+$/, '.webp');
    }
  } catch (e) {
    // 图片处理失败则用原图
    console.error('图片处理失败:', e);
  }

  // 上传到 R2
  const result = await uploadImage(platform.env.R2, processedData, contentType, filename);

  // 审计
  await repos.audit.log({
    sessionId: locals.session.id,
    action: 'IMAGE_UPLOAD',
    target: result.key,
    detail: { originalName: file.name, size: file.size },
    ip: locals.ip
  });

  return json({ ok: true, key: result.key, url: result.url });
};
