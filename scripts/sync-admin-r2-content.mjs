import { createHash, createHmac } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const env = process.env;
const accountId = env.ADMIN_R2_ACCOUNT_ID ?? env.R2_ACCOUNT_ID ?? '';
const accessKeyId = env.ADMIN_R2_ACCESS_KEY_ID ?? env.R2_ACCESS_KEY_ID ?? '';
const secretAccessKey = env.ADMIN_R2_SECRET_ACCESS_KEY ?? env.R2_SECRET_ACCESS_KEY ?? '';
const bucket = env.ADMIN_R2_BUCKET ?? 'admin-r2';
const sourcePrefix = (env.ADMIN_R2_PREFIX ?? 'content/').replace(/^\/+/, '');
const settingsPrefix = (env.ADMIN_R2_SETTINGS_PREFIX ?? 'settings/').replace(/^\/+/, '');
const dataPrefix = (env.ADMIN_R2_DATA_PREFIX ?? 'data/').replace(/^\/+/, '');
const shouldPrune = env.ADMIN_R2_SYNC_PRUNE === '1';
const contentRoot = path.resolve('src/content');
const settingsRoot = path.resolve('src/data/settings');
const dataRoot = path.resolve('src/data');
const configRoot = path.resolve('src/config');
const endpointHost = `${accountId}.r2.cloudflarestorage.com`;
const endpointOrigin = `https://${endpointHost}`;
const region = 'auto';
const service = 's3';

const requiredValues = { accountId, accessKeyId, secretAccessKey, bucket };
const missing = Object.entries(requiredValues)
  .filter(([, value]) => !String(value).trim())
  .map(([key]) => key);

if (missing.length > 0) {
  console.log(`[admin-r2] Skip content sync; missing env: ${missing.join(', ')}`);
  process.exit(0);
}

const hashHex = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const hmacHex = (key, value) => createHmac('sha256', key).update(value).digest('hex');

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

const toAmzDate = (date) => date.toISOString().replace(/[:-]|\.\d{3}/g, '');
const toDateStamp = (date) => date.toISOString().slice(0, 10).replace(/-/g, '');

const getSigningKey = (dateStamp) => {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
};

async function signedFetch(method, key = '', query = {}) {
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = toDateStamp(now);
  const pathname = `/${bucket}${key ? `/${key}` : ''}`;
  const encodedPath = canonicalUri(pathname);
  const queryString = canonicalQueryString(query);
  const payloadHash = 'UNSIGNED-PAYLOAD';
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
  const canonicalRequest = [
    method,
    encodedPath,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
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
    headers: {
      ...headers,
      authorization
    }
  });
}

const decodeXml = (value) =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');

async function listObjectsForPrefix(prefix) {
  const keys = [];
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

    for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
      keys.push(decodeXml(match[1]));
    }

    const tokenMatch = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
    continuationToken = tokenMatch ? decodeXml(tokenMatch[1]) : '';
  } while (continuationToken);

  return keys;
}

async function listObjects() {
  return listObjectsForPrefix(sourcePrefix);
}

const toLocalPath = (key, prefix = sourcePrefix, root = contentRoot) => {
  if (!key.startsWith(prefix)) return null;
  const relativePath = key.slice(prefix.length).replace(/\\/g, '/');
  if (!relativePath || relativePath.split('/').some((part) => part === '..')) return null;

  const target = path.resolve(root, relativePath);
  if (!target.startsWith(`${root}${path.sep}`)) return null;
  return { relativePath, target };
};

async function fetchObjectBody(key) {
  const response = await signedFetch('GET', key);
  if (!response.ok) {
    throw new Error(`R2 get failed for ${key} (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadObject(key, target) {
  const body = await fetchObjectBody(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

async function downloadObjectText(key) {
  return (await fetchObjectBody(key)).toString('utf8');
}

async function collectLocalFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectLocalFiles(fullPath, base));
    } else if (entry.isFile()) {
      files.push(path.relative(base, fullPath).replace(/\\/g, '/'));
    }
  }

  return files;
}

async function pruneLocalContent(remoteRelativePaths) {
  if (!shouldPrune || remoteRelativePaths.size === 0) return 0;

  let removed = 0;
  for (const relativePath of await collectLocalFiles(contentRoot)) {
    if (!remoteRelativePaths.has(relativePath)) {
      await rm(path.join(contentRoot, relativePath), { force: true });
      removed += 1;
    }
  }
  return removed;
}

const remoteKeys = await listObjects();
const remoteRelativePaths = new Set();
let copied = 0;

for (const key of remoteKeys) {
  const local = toLocalPath(key);
  if (!local) continue;
  remoteRelativePaths.add(local.relativePath);
  await downloadObject(key, local.target);
  copied += 1;
}

const removed = await pruneLocalContent(remoteRelativePaths);

const settingsKeys = settingsPrefix === sourcePrefix
  ? []
  : (await listObjectsForPrefix(settingsPrefix));
let copiedSettings = 0;

for (const key of settingsKeys) {
  const local = toLocalPath(key, settingsPrefix, settingsRoot);
  if (!local || !local.relativePath.endsWith('.json')) continue;
  await downloadObject(key, local.target);
  copiedSettings += 1;
}

const dataKeys = dataPrefix === sourcePrefix
  ? []
  : (await listObjectsForPrefix(dataPrefix));
let copiedData = 0;

function linksModuleSource(jsonText) {
  const payload = JSON.parse(jsonText);
  return [
    '// Generated from admin R2 data/links.json during Astro build.',
    `const payload = ${JSON.stringify(payload, null, 2)};`,
    '',
    'export const siteInfo = payload.siteInfo ?? {};',
    'export const links = Array.isArray(payload.links) ? payload.links : [];',
    ''
  ].join('\n');
}

for (const key of dataKeys) {
  const local = toLocalPath(key, dataPrefix, dataRoot);
  if (!local || !local.relativePath.endsWith('.json')) continue;

  if (local.relativePath === 'links.json') {
    const target = path.resolve(dataRoot, 'links.ts');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, linksModuleSource(await downloadObjectText(key)));
  } else if (local.relativePath === 'feed.json') {
    await downloadObject(key, path.resolve(configRoot, 'feed.json'));
  } else {
    await downloadObject(key, local.target);
  }
  copiedData += 1;
}

console.log(`[admin-r2] Synced ${copied} content object(s) from r2://${bucket}/${sourcePrefix} to src/content${removed ? `; pruned ${removed}` : ''}.`);
console.log(`[admin-r2] Synced ${copiedSettings} settings object(s) from r2://${bucket}/${settingsPrefix} to src/data/settings.`);
console.log(`[admin-r2] Synced ${copiedData} data object(s) from r2://${bucket}/${dataPrefix} to src/data and src/config.`);
