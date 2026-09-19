// ============================================================================
// 统一内容源适配器
//
// 后台（SvelteKit on Workers）把文章写入 R2 的 `content/` 前缀，主站（Astro）
// 则从仓库里的 `src/content/` 读取。两者之间的唯一桥梁就是这个模块：
//
//   remote —— 通过 S3 兼容接口（SigV4 签名）直连真实 R2，用于 CI / 生产构建。
//   local  —— 直接读取 wrangler/miniflare 落在磁盘上的本地模拟 R2，
//             用于本地开发，让本地后台写的内容能被本地前端看到。
//
// 两种实现暴露完全相同的接口（listKeys / getObject），因此上层同步逻辑
// 只有一份 —— 本地和部署后跑的是同一套代码。
// ============================================================================

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

const decodeXml = (value) =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');

const encodePathSegment = (segment) =>
  encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const canonicalUri = (rawPath) => rawPath.split('/').map(encodePathSegment).join('/');

const canonicalQueryString = (params) =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [encodePathSegment(key), encodePathSegment(String(value))])
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

const hashHex = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const hmacHex = (key, value) => createHmac('sha256', key).update(value).digest('hex');

const toAmzDate = (date) => date.toISOString().replace(/[:-]|\.\d{3}/g, '');
const toDateStamp = (date) => date.toISOString().slice(0, 10).replace(/-/g, '');

// ---------------------------------------------------------------------------
// remote：S3 兼容接口直连真实 R2
// ---------------------------------------------------------------------------

export function createRemoteSource({ accountId, accessKeyId, secretAccessKey, bucket }) {
  const endpointHost = `${accountId}.r2.cloudflarestorage.com`;
  const endpointOrigin = `https://${endpointHost}`;
  const region = 'auto';
  const service = 's3';

  const getSigningKey = (dateStamp) => {
    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    return hmac(kService, 'aws4_request');
  };

  async function signedFetch(method, key = '', query = {}, body = null) {
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = toDateStamp(now);
    const pathname = `/${bucket}${key ? `/${key}` : ''}`;
    const encodedPath = canonicalUri(pathname);
    const queryString = canonicalQueryString(query);
    // 有请求体时必须用真实负载哈希参与签名，否则 R2 会拒绝。
    const payload = body === null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const payloadHash = payload === null ? 'UNSIGNED-PAYLOAD' : hashHex(payload);
    const headers = {
      host: endpointHost,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate
    };
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((header) => `${header}:${headers[header]}\n`)
      .join('');
    const canonicalRequest = [method, encodedPath, queryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hashHex(canonicalRequest)].join('\n');
    const signature = hmacHex(getSigningKey(dateStamp), stringToSign);
    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(', ');

    const url = `${endpointOrigin}${encodedPath}${queryString ? `?${queryString}` : ''}`;
    return fetch(url, {
      method,
      headers: { ...headers, authorization },
      ...(payload === null ? {} : { body: payload })
    });
  }

  async function listEntries(prefix) {
    const entries = [];
    let continuationToken = '';

    do {
      const response = await signedFetch('GET', '', {
        'list-type': '2',
        prefix,
        'continuation-token': continuationToken
      });
      const xml = await response.text();
      if (!response.ok) {
        throw new Error(`R2 list failed (${response.status}): ${xml.slice(0, 500)}`);
      }

      for (const block of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const body = block[1];
        const key = /<Key>([\s\S]*?)<\/Key>/.exec(body);
        if (!key) continue;
        const size = /<Size>([\s\S]*?)<\/Size>/.exec(body);
        const etag = /<ETag>([\s\S]*?)<\/ETag>/.exec(body);
        entries.push({
          key: decodeXml(key[1]),
          size: size ? Number(size[1]) : 0,
          etag: etag ? decodeXml(etag[1]) : ''
        });
      }

      const tokenMatch = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
      continuationToken = tokenMatch ? decodeXml(tokenMatch[1]) : '';
    } while (continuationToken);

    return entries;
  }

  const listKeys = async (prefix) => (await listEntries(prefix)).map((entry) => entry.key);

  async function getObject(key) {
    const response = await signedFetch('GET', key);
    if (!response.ok) {
      throw new Error(`R2 get failed for ${key} (${response.status}): ${(await response.text()).slice(0, 500)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async function putObject(key, body, options = {}) {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const response = await signedFetch('PUT', key, {}, payload);
    if (!response.ok) {
      throw new Error(`R2 put failed for ${key} (${response.status}): ${(await response.text()).slice(0, 500)}`);
    }
    // R2 的 ETag 是内容 MD5；这里只用它做变更比对，不作为强一致依据。
    return { etag: response.headers.get('etag') ?? '', size: payload.length, contentType: options.contentType };
  }

  return {
    kind: 'remote',
    label: `r2://${bucket} (remote)`,
    bucket,
    listKeys,
    listEntries,
    getObject,
    putObject
  };
}

// ---------------------------------------------------------------------------
// local：读取 wrangler / miniflare 的本地模拟 R2
//
// miniflare 把对象元数据存在 SQLite（`_mf_objects` 表），把内容按 blob_id
// 存成独立文件。这里同时读取两者：以 SQLite 拿 key → blob_id 映射，再去
// blobs 目录取内容。SQLite 文件名是内部哈希，所以用「blob 是否存在于目标
// bucket 目录」来确认数据库归属，避免多 bucket 时串数据。
// ---------------------------------------------------------------------------

let sqliteModulePromise = null;

const loadSqlite = async () => {
  sqliteModulePromise ??= (async () => {
    // node:sqlite 在部分 Node 版本上会打印实验性警告，这里只静音这一条，
    // 其余警告照常抛出，避免掩盖真正的问题。
    const originalEmitWarning = process.emitWarning;
    process.emitWarning = (warning, ...rest) => {
      const message = typeof warning === 'string' ? warning : (warning?.message ?? '');
      if (message.includes('SQLite is an experimental feature')) return;
      return originalEmitWarning.call(process, warning, ...rest);
    };

    try {
      return await import('node:sqlite');
    } finally {
      process.emitWarning = originalEmitWarning;
    }
  })();

  return sqliteModulePromise;
};

export async function createLocalSource({ stateRoot, bucket, projectRoot }) {
  const bucketRoot = path.join(stateRoot, 'r2', bucket);
  const blobsDir = path.join(bucketRoot, 'blobs');
  const metaDir = path.join(stateRoot, 'r2', 'miniflare-R2BucketObject');

  if (!existsSync(blobsDir)) {
    throw new Error(
      `本地模拟 R2 不存在：${blobsDir}\n` +
        '  请先在 apps/admin 下运行一次 `npm run dev` 并保存过内容，或改用远端源（配置 ADMIN_R2_* 凭据）。'
    );
  }

  const { DatabaseSync } = await loadSqlite();

  /**
   * 定位当前 bucket 对应的元数据库。
   * miniflare 的 SQLite 文件名是内部哈希，无法从 bucket 名推导，所以按
   * 「库里的 blob 是否落在本 bucket 的 blobs 目录」来判断归属。
   */
  const resolveBucketDbFile = () => {
    if (!existsSync(metaDir)) return null;

    const sqliteFiles = readdirSync(metaDir).filter((name) => name.endsWith('.sqlite'));
    if (sqliteFiles.length === 0) return null;
    if (sqliteFiles.length === 1) return path.join(metaDir, sqliteFiles[0]);

    let best = null;
    let bestScore = -1;

    for (const file of sqliteFiles) {
      const fullPath = path.join(metaDir, file);
      let db;
      try {
        db = new DatabaseSync(fullPath, { readOnly: true });
      } catch {
        continue;
      }
      try {
        const rows = db.prepare('SELECT blob_id FROM _mf_objects').all();
        let score = 0;
        for (const row of rows) {
          if (existsSync(path.join(blobsDir, String(row.blob_id)))) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          best = fullPath;
        }
      } catch {
        // 忽略读不动的库
      } finally {
        try {
          db.close();
        } catch {}
      }
    }

    return best;
  };

  /** @type {Map<string, { blobId: string; size: number; etag: string }> | null} */
  let index = null;

  const readIndex = () => {
    if (!existsSync(metaDir)) return new Map();

    const sqliteFiles = readdirSync(metaDir).filter((name) => name.endsWith('.sqlite'));
    const merged = new Map();

    for (const file of sqliteFiles) {
      const fullPath = path.join(metaDir, file);
      let db;
      try {
        db = new DatabaseSync(fullPath, { readOnly: true });
      } catch {
        continue; // 被写入进程独占时跳过，下次轮询会补上
      }

      try {
        const rows = db.prepare('SELECT key, blob_id, size, etag FROM _mf_objects').all();
        for (const row of rows) {
          const key = String(row.key);
          const blobId = String(row.blob_id);
          // blob 不在当前 bucket 目录里 → 这条属于别的 bucket，跳过。
          if (!existsSync(path.join(blobsDir, blobId))) continue;
          merged.set(key, {
            blobId,
            size: Number(row.size) || 0,
            etag: row.etag ? String(row.etag) : ''
          });
        }
      } catch {
        // 表结构不符合预期（miniflare 版本变化）→ 交给上层报错
      } finally {
        try {
          db.close();
        } catch {}
      }
    }

    return merged;
  };

  const ensureIndex = (force = false) => {
    if (force || !index) index = readIndex();
    return index;
  };

  async function listEntries(prefix) {
    const current = ensureIndex(true);
    return [...current.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, entry]) => ({ key, size: entry.size, etag: entry.etag }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  const listKeys = async (prefix) => (await listEntries(prefix)).map((entry) => entry.key);

  async function getObject(key) {
    const current = ensureIndex();
    const entry = current.get(key);
    if (!entry) {
      // 可能是新写入的对象，强制刷新一次索引再试
      const refreshed = ensureIndex(true);
      const retry = refreshed.get(key);
      if (!retry) throw new Error(`本地模拟 R2 中不存在对象：${key}`);
      return readFileSync(path.join(blobsDir, retry.blobId));
    }
    return readFileSync(path.join(blobsDir, entry.blobId));
  }

  // 写入直接操作 miniflare 的本地存储：blobs 目录 + SQLite 元数据表。
  //
  // 之所以不用 `wrangler r2 object put --local`：wrangler 把 objectPath 当 URL 处理，
  // 会对非 ASCII 的 key 做百分号编码（「出发.md」会变成「%E5%87%BA%E5%8F%91.md」），
  // 与后台通过 R2 binding 写入的字面 key 对不上，等于凭空多出一份重复对象。
  // 这里按 miniflare 自身的表结构写入，保证 key 与后台一致。
  const dbFile = resolveBucketDbFile();

  async function putObject(key, body, options = {}) {
    if (!dbFile) {
      throw new Error(`无法定位本地模拟 R2 的元数据库：${metaDir}`);
    }

    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const { DatabaseSync } = await loadSqlite();
    const db = new DatabaseSync(dbFile);
    db.exec('PRAGMA busy_timeout = 5000');

    try {
      const previous = db.prepare('SELECT blob_id FROM _mf_objects WHERE key = ?').get(key);
      const previousBlobId = previous ? String(previous.blob_id) : null;

      // blob_id 只是 blob 文件的唯一名，沿用 miniflare 的形态（64 位随机 + 16 位后缀）
      const blobId = randomBytes(32).toString('hex') + randomBytes(8).toString('hex');
      await writeFile(path.join(blobsDir, blobId), payload);

      db.prepare(
        `INSERT INTO _mf_objects (key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           blob_id = excluded.blob_id,
           version = excluded.version,
           size = excluded.size,
           etag = excluded.etag,
           uploaded = excluded.uploaded,
           checksums = excluded.checksums,
           http_metadata = excluded.http_metadata,
           custom_metadata = excluded.custom_metadata`
      ).run(
        key,
        blobId,
        randomBytes(16).toString('hex'),
        payload.length,
        createHash('md5').update(payload).digest('hex'),
        Date.now(),
        '{}',
        '{}',
        JSON.stringify(options.customMetadata ?? {})
      );

      // 清理被替换掉的旧 blob（仅当没有其他 key 还在引用它）
      if (previousBlobId && previousBlobId !== blobId) {
        const stillUsed = db.prepare('SELECT COUNT(*) AS c FROM _mf_objects WHERE blob_id = ?').get(previousBlobId);
        if (!stillUsed || Number(stillUsed.c) === 0) {
          await rm(path.join(blobsDir, previousBlobId), { force: true });
        }
      }
    } finally {
      try {
        db.close();
      } catch {}
    }

    index = null; // 索引失效，下次读取会重新扫描
    return { etag: '', size: payload.length };
  }

  return {
    kind: 'local',
    label: `${bucketRoot} (local miniflare)`,
    bucket,
    bucketRoot,
    listKeys,
    listEntries,
    getObject,
    putObject
  };
}

// ---------------------------------------------------------------------------
// 源解析：让同一套上层逻辑在本地与生产各自选到正确的存储
// ---------------------------------------------------------------------------

export const DEFAULT_BUCKET = 'admin-r2';
export const DEFAULT_LOCAL_STATE = path.join('apps', 'admin', '.wrangler', 'state', 'v3');

/**
 * @param {{ env?: Record<string, string | undefined>; projectRoot?: string }} [options]
 * @returns {Promise<{ source: null | { kind: string; label: string; bucket: string; listKeys: Function; getObject: Function }; reason: string; credentialsMissing: string[] }>}
 */
export async function resolveContentSource(options = {}) {
  const env = options.env ?? process.env;
  const projectRoot = options.projectRoot ?? process.cwd();

  const accountId = env.ADMIN_R2_ACCOUNT_ID ?? env.R2_ACCOUNT_ID ?? '';
  const accessKeyId = env.ADMIN_R2_ACCESS_KEY_ID ?? env.R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = env.ADMIN_R2_SECRET_ACCESS_KEY ?? env.R2_SECRET_ACCESS_KEY ?? '';
  const bucket = env.ADMIN_R2_BUCKET ?? DEFAULT_BUCKET;

  const credentials = { accountId, accessKeyId, secretAccessKey };
  const credentialsMissing = Object.entries(credentials)
    .filter(([, value]) => !String(value).trim())
    .map(([key]) => key);

  const requested = (env.ADMIN_R2_SOURCE ?? 'auto').trim().toLowerCase();
  if (!['auto', 'remote', 'local'].includes(requested)) {
    throw new Error(`ADMIN_R2_SOURCE 只能是 auto / remote / local，收到 "${env.ADMIN_R2_SOURCE}"`);
  }

  const localStateRoot = path.resolve(projectRoot, env.ADMIN_R2_LOCAL_STATE ?? DEFAULT_LOCAL_STATE);
  const localBucketRoot = path.join(localStateRoot, 'r2', bucket);

  const tryLocal = async () => {
    if (!existsSync(localBucketRoot)) return null;
    try {
      return await createLocalSource({ stateRoot: localStateRoot, bucket, projectRoot });
    } catch {
      return null;
    }
  };

  if (requested === 'remote') {
    if (credentialsMissing.length > 0) {
      throw new Error(`ADMIN_R2_SOURCE=remote 但缺少凭据：${credentialsMissing.join(', ')}`);
    }
    return {
      source: createRemoteSource({ ...credentials, bucket }),
      reason: 'ADMIN_R2_SOURCE=remote',
      credentialsMissing
    };
  }

  if (requested === 'local') {
    const local = await tryLocal();
    if (!local) {
      throw new Error(`ADMIN_R2_SOURCE=local 但未找到本地模拟 R2：${localBucketRoot}`);
    }
    return { source: local, reason: 'ADMIN_R2_SOURCE=local', credentialsMissing };
  }

  // auto：有凭据优先用真实 R2（生产构建走这条），否则回退本地模拟存储。
  if (credentialsMissing.length === 0) {
    return {
      source: createRemoteSource({ ...credentials, bucket }),
      reason: '检测到 ADMIN_R2_* 凭据，使用远端 R2',
      credentialsMissing
    };
  }

  const local = await tryLocal();
  if (local) {
    return {
      source: local,
      reason: `未配置 ADMIN_R2_* 凭据，回退到本地模拟 R2`,
      credentialsMissing
    };
  }

  return { source: null, reason: `未配置 ADMIN_R2_* 凭据，且未找到本地模拟 R2（${localBucketRoot}）`, credentialsMissing };
}

export const fileExists = (target) => {
  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
};
