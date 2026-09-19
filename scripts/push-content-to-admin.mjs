// ============================================================================
// 反向通道：仓库 src/content → R2（后台内容库）
//
// 补齐「仓库有、后台没有」的方向，让后台列表与前端展示的是同一批文章。
// 典型用途：
//   1. 直接把 Markdown 提交进仓库的旧文章，导入后台后才能在后台编辑；
//   2. 后台 R2 里残留的历史旧格式副本（缺 slug/description/配图），
//      用仓库里更完整的版本覆盖回去。
//
// 默认是「计划模式」，只打印将要做什么，不会写入。确认后加 --apply 执行。
//
// 用法：
//   node ./scripts/push-content-to-admin.mjs                          # 查看计划
//   node ./scripts/push-content-to-admin.mjs --apply                  # 只推送 R2 缺失的
//   node ./scripts/push-content-to-admin.mjs --apply --include-divergent
//                                                                     # 连内容不一致的一起覆盖
//   node ./scripts/push-content-to-admin.mjs --source=local --apply
//   node ./scripts/push-content-to-admin.mjs --collection=essay --apply
//
// 环境变量：
//   ADMIN_PUSH_BACKUP_DIR  写入前备份本地 R2 的目录，默认系统临时目录
//   （远端源不备份，因为无法在本地复制远端存储）
// ============================================================================

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadEnvFile } from './lib/load-env.mjs';
import { resolveContentSource } from './lib/r2-source.mjs';

loadEnvFile();

const env = process.env;
const argv = process.argv.slice(2);
const flagValue = (name) => {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
};

const sourceFlag = flagValue('source');
if (sourceFlag) env.ADMIN_R2_SOURCE = sourceFlag;

const shouldApply = argv.includes('--apply');
const includeDivergent = argv.includes('--include-divergent');
const collectionFilter = flagValue('collection');
const limit = Number(flagValue('limit') ?? 0) || 0;

const COLLECTIONS = ['essay', 'bits', 'memo'];
const contentPrefix = (env.ADMIN_R2_PREFIX ?? 'content/').replace(/^\/+/, '');
const contentRoot = path.resolve('src/content');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/**
 * 构造与后台 ContentStore.writeMetadata 对齐的元数据。
 * 有这些字段，后台列表就能直接显示标题/日期，不必逐篇读取正文。
 */
function buildMetadata(collection, name, body) {
  const text = body.toString('utf8');
  const slug = name.replace(/\.md$/i, '');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const block = frontmatter ? frontmatter[1] : '';
  const pick = (field) => {
    const match = new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm').exec(block);
    return match ? match[1].replace(/^["']|["']$/g, '').trim() : '';
  };
  const bodyText = frontmatter ? text.slice(frontmatter[0].length) : text;

  return {
    collection,
    slug,
    updatedAt: new Date().toISOString(),
    title: (pick('title') || slug).slice(0, 160),
    date: pick('date').slice(0, 40),
    excerpt: bodyText.replace(/[#*`\n]/g, ' ').trim().slice(0, 240),
    source: 'content-push'
  };
}

const { source, reason } = await resolveContentSource({ env });
if (!source) {
  console.error(`[push] 未找到可用的内容源：${reason}`);
  process.exit(1);
}

if (!source.putObject) {
  console.error('[push] 当前内容源不支持写入。');
  process.exit(1);
}

console.log(`[push] 目标：${source.label}（${reason}）`);
console.log(`[push] 来源：${contentRoot}`);
console.log(`[push] 模式：${shouldApply ? '写入' : '计划（只读，加 --apply 才写入）'}`);
console.log('');

const collections = collectionFilter ? [collectionFilter] : COLLECTIONS;

/** 计划项：{ collection, name, key, status, body, metadata } */
const plan = [];

for (const collection of collections) {
  const dir = path.join(contentRoot, collection);
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    continue;
  }

  const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name).sort();
  const remoteKeys = new Set(await source.listKeys(`${contentPrefix}${collection}/`));

  for (const name of files) {
    const key = `${contentPrefix}${collection}/${name}`;
    const body = await readFile(path.join(dir, name));

    if (!remoteKeys.has(key)) {
      plan.push({ collection, name, key, status: 'missing', body, metadata: buildMetadata(collection, name, body) });
      continue;
    }

    const remoteBody = await source.getObject(key);
    if (sha256(remoteBody) !== sha256(body)) {
      plan.push({ collection, name, key, status: 'divergent', body, metadata: buildMetadata(collection, name, body) });
    }
  }
}

const missing = plan.filter((item) => item.status === 'missing');
const divergent = plan.filter((item) => item.status === 'divergent');

console.log(`[push] R2 缺失 ${missing.length} 篇；内容不一致 ${divergent.length} 篇。`);
console.log('');

if (missing.length) {
  console.log('── 将在 R2 中新建（后台看不到的文章）──');
  missing.forEach((item) => console.log(`   + ${item.collection}/${item.name}`));
  console.log('');
}

if (divergent.length) {
  const mark = includeDivergent ? '将覆盖' : '跳过（需 --include-divergent）';
  console.log(`── R2 已存在但内容不同：${mark} ──`);
  divergent.slice(0, 15).forEach((item) => console.log(`   ~ ${item.collection}/${item.name}`));
  if (divergent.length > 15) console.log(`   … 其余 ${divergent.length - 15} 篇`);
  console.log('');
}

if (missing.length === 0 && (divergent.length === 0 || !includeDivergent)) {
  console.log('[push] 没有需要写入的内容，后台与仓库已一致。');
  process.exit(0);
}

if (!shouldApply) {
  console.log('[push] 这是计划模式，未写入任何内容。确认无误后加 --apply 执行。');
  process.exit(0);
}

// ---- 执行 ----
let queue = [...missing];
if (includeDivergent) queue = [...queue, ...divergent];
if (limit > 0) queue = queue.slice(0, limit);

// 本地源先备份：R2 是开发用存储，覆盖前留一份可回滚的快照
// 注意要连元数据库一起备份 —— 只备份 blobs 是没法回滚的。
if (source.kind === 'local' && source.bucketRoot) {
  const stateR2Root = path.dirname(source.bucketRoot);
  const backupRoot = path.resolve(env.ADMIN_PUSH_BACKUP_DIR ?? path.join(os.tmpdir(), 'viiink-r2-backups'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupRoot, stamp);
  try {
    await mkdir(backupDir, { recursive: true });
    await cp(stateR2Root, path.join(backupDir, path.basename(stateR2Root)), { recursive: true });
    console.log(`[push] 已备份本地 R2（含元数据库）→ ${backupDir}`);
    console.log('');
  } catch (error) {
    console.error(`[push] 备份失败，已中止写入：${error.message}`);
    process.exit(1);
  }
}

console.log(`[push] 开始写入 ${queue.length} 篇…`);
const startedAt = Date.now();
let done = 0;
const failures = [];

for (const item of queue) {
  try {
    await source.putObject(item.key, item.body, { customMetadata: item.metadata });
    done += 1;
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log(`   [${done}/${queue.length}] ${item.status === 'missing' ? '+' : '~'} ${item.collection}/${item.name}  (${elapsed}s)`);
  } catch (error) {
    failures.push({ item, message: error.message });
    console.error(`   ✗ ${item.collection}/${item.name} 失败：${error.message}`);
  }
}

console.log('');
console.log(`[push] 完成：成功 ${done} 篇，失败 ${failures.length} 篇，用时 ${((Date.now() - startedAt) / 1000).toFixed(0)}s。`);
if (failures.length) {
  console.log('[push] 失败清单：');
  failures.forEach(({ item }) => console.log(`   · ${item.collection}/${item.name}`));
}
console.log('[push] 建议接着跑 `npm run content:check` 复核一致性。');
