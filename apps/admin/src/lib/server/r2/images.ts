// ============================================================================
// R2 图片管理（列表/上传/删除）
// 图片存储前缀：images/uploads/<YYYY>/<MM>/<hash>.<ext>
// ============================================================================

export interface ImageItem {
  key: string;
  size: number;
  uploaded: string;
  etag: string;
}

export interface ImageStorageEstimate {
  totalSize: number;
  count: number;
  truncated?: boolean;
}

export interface ImageListResult {
  items: ImageItem[];
  storage: ImageStorageEstimate;
}

/** 生成图片存储 key */
export function generateImageKey(filename: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'bin';
  const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `images/uploads/${yyyy}/${mm}/${hash}.${ext}`;
}

/** 列出图片 */
export async function listImages(r2: R2Bucket, prefix = ''): Promise<ImageItem[]> {
  const fullPrefix = prefix ? `images/${prefix}` : 'images/';
  const result = await r2.list({ prefix: fullPrefix, limit: 200 });
  return result.objects.map((obj) => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded.toISOString(),
    etag: obj.etag
  }));
}

/** 列出首屏图片，并复用同一次 R2 list 结果生成首屏统计 */
export async function listImagesWithStorage(r2: R2Bucket, prefix = ''): Promise<ImageListResult> {
  const fullPrefix = prefix ? `images/${prefix}` : 'images/';
  const result = await r2.list({ prefix: fullPrefix, limit: 200 });
  const items = result.objects.map((obj) => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded.toISOString(),
    etag: obj.etag
  }));

  return {
    items,
    storage: {
      totalSize: result.objects.reduce((sum, obj) => sum + obj.size, 0),
      count: result.objects.length,
      truncated: result.truncated
    }
  };
}

/** 上传图片（原始字节） */
export async function uploadImage(
  r2: R2Bucket,
  data: ArrayBuffer | ReadableStream<Uint8Array>,
  contentType: string,
  filename: string
): Promise<{ key: string; url: string }> {
  const key = generateImageKey(filename);
  await r2.put(key, data as ArrayBuffer | ReadableStream, {
    httpMetadata: { contentType }
  });
  return { key, url: key }; // 实际 URL 由主站 CDN 或 R2 公开访问决定
}

/** 删除图片 */
export async function deleteImage(r2: R2Bucket, key: string): Promise<void> {
  await r2.delete(key);
}

/** 估算图片总存储量 */
export async function estimateStorage(r2: R2Bucket, maxPages = Infinity): Promise<ImageStorageEstimate> {
  let totalSize = 0;
  let count = 0;
  let cursor: string | undefined;
  let pages = 0;
  let truncated = false;

  do {
    const result = await r2.list({ prefix: 'images/', cursor, limit: 500 });
    pages++;
    for (const obj of result.objects) {
      totalSize += obj.size;
      count++;
    }
    truncated = result.truncated;
    cursor = result.truncated && pages < maxPages ? result.cursor : undefined;
  } while (cursor);

  return { totalSize, count, truncated };
}
