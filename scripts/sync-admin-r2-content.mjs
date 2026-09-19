// ============================================================================
// 内容同步：R2（后台）→ 仓库（主站构建输入）
//
// 本地开发与生产构建跑的是同一个脚本、同一套逻辑，唯一区别是「内容源」：
//   · 配置了 ADMIN_R2_* 凭据        → 直连真实 R2（Cloudflare Pages 构建走这条）
//   · 未配置凭据但有本地模拟 R2      → 读取 wrangler/miniflare 落盘数据（本地开发）
// 可用 ADMIN_R2_SOURCE=auto|remote|local 强制指定。
//
// 用法：
//   node ./scripts/sync-admin-r2-content.mjs                     # 自动选择内容源
//   node ./scripts/sync-admin-r2-content.mjs --dry-run           # 只看会做什么
//   node ./scripts/sync-admin-r2-content.mjs --on-conflict=skip  # 保守：不覆盖，只报告
//   node ./scripts/sync-admin-r2-content.mjs --source=local
//
// 冲突保护（重要）：
//   当某个文件在 R2 与仓库里都存在但内容不同时，是否覆盖仓库版本由「冲突策略」决定。
//   默认是 overwrite —— R2 是唯一真源，本地与生产必须跑同一套逻辑。
//
//   历史上 local 源默认是 skip，用来挡住本地模拟 R2 里那批旧格式副本；
//   那批数据已对账清理（`npm run content:check` 报 0 差异），
//   skip 现在只会造成两个后果：
//     · 后台改了已有文章/友链/订阅，前端不更新（本地开发链路断掉）；
//     · 本地 skip、生产 overwrite，两端行为分叉。
//   需要保守模式（例如想先人工 review）时，显式加 --on-conflict=skip。
//
// 站点数据骤减告警（重要）：
//   data/links.json 与 data/feed.json 落盘前，会先比对「可见友链数 / 订阅数」。
//   指标腰斩（且基线 ≥5）时打出醒目告警 —— 线上出过「46 条友链只剩 1 条」的事故，
//   当时同步脚本照单全收、前端友链页几乎空白，却全程没有任何提示。
//   默认只告警不阻断（后台批量下架是正常操作）；要硬失败用 ADMIN_R2_SYNC_STRICT=1。
//
//   相关环境变量：
//   ADMIN_R2_ACCOUNT_ID / ADMIN_R2_ACCESS_KEY_ID / ADMIN_R2_SECRET_ACCESS_KEY
//   ADMIN_R2_BUCKET           默认 admin-r2
//   ADMIN_R2_PREFIX           默认 content/
//   ADMIN_R2_SETTINGS_PREFIX  默认 settings/
//   ADMIN_R2_DATA_PREFIX      默认 data/
//   ADMIN_R2_SOURCE           auto | remote | local（默认 auto）
//   ADMIN_R2_LOCAL_STATE      本地模拟 R2 根目录，默认 apps/admin/.wrangler/state/v3
//   ADMIN_R2_SYNC_ON_CONFLICT skip | overwrite（默认 overwrite，与生产一致）
//   ADMIN_R2_SYNC_PRUNE       =1 时删除仓库里「R2 已不存在」的内容（默认关闭，防误删）
//   ADMIN_R2_SYNC_STRICT      =1 时找不到内容源直接报错退出（默认仅告警跳过）
// ============================================================================

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  collectLocalFiles,
  contentRelativePathFromKey,
  DATA_METRICS,
  dataObjectTarget,
  detectDataCollapse,
  linksModuleSource,
  pruneDeletedContent
} from './lib/content-sync.mjs';
import { loadEnvFile } from './lib/load-env.mjs';
import { resolveContentSource } from './lib/r2-source.mjs';

// 根目录若有 .env 则合并进来（已存在的环境变量优先，Pages/CI 不受影响）
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

const conflictFlag = flagValue('on-conflict');
if (conflictFlag) env.ADMIN_R2_SYNC_ON_CONFLICT = conflictFlag;

const isDryRun = argv.includes('--dry-run');
const conflictOverride = (env.ADMIN_R2_SYNC_ON_CONFLICT ?? '').trim().toLowerCase();
if (conflictOverride && !['skip', 'overwrite'].includes(conflictOverride)) {
  throw new Error(`ADMIN_R2_SYNC_ON_CONFLICT 只能是 skip / overwrite，收到 "${env.ADMIN_R2_SYNC_ON_CONFLICT}"`);
}

const sourcePrefix = (env.ADMIN_R2_PREFIX ?? 'content/').replace(/^\/+/, '');
const settingsPrefix = (env.ADMIN_R2_SETTINGS_PREFIX ?? 'settings/').replace(/^\/+/, '');
const dataPrefix = (env.ADMIN_R2_DATA_PREFIX ?? 'data/').replace(/^\/+/, '');
const shouldPrune = env.ADMIN_R2_SYNC_PRUNE === '1';
const isStrict = env.ADMIN_R2_SYNC_STRICT === '1';
const contentRoot = path.resolve('src/content');
const settingsRoot = path.resolve('src/data/settings');
// data/ 前缀的目标文件由 lib/content-sync.mjs 的 dataObjectTarget 统一映射，
// 这里不再各自硬编码路径，避免与一致性检查脚本产生分歧。

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const { source, reason, credentialsMissing } = await resolveContentSource({ env });

if (!source) {
  const detail = [
    '[admin-r2] 未找到可用的内容源，已跳过内容同步。',
    `  原因：${reason}`,
    `  缺失凭据：${credentialsMissing.join(', ') || '(无)'}`,
    '  解决方式：',
    '    · 本地开发：先在 apps/admin 运行 `npm run dev` 并保存过内容，再重试；',
    '    · 生产构建：配置 ADMIN_R2_ACCOUNT_ID / ADMIN_R2_ACCESS_KEY_ID / ADMIN_R2_SECRET_ACCESS_KEY。'
  ].join('\n');

  if (isStrict) {
    console.error(detail);
    process.exit(1);
  }
  console.warn(detail);
  process.exit(0);
}

// 冲突策略：默认一律 overwrite。R2 是唯一真源，本地与生产必须同一套逻辑 ——
// 按内容源给不同默认值会让「本地看着对、部署后不一样」。
// 想先人工 review 再落盘时用 --on-conflict=skip 或先跑 --dry-run。
const onConflict = conflictOverride || 'overwrite';

console.log(`[admin-r2] 内容源：${source.label}（${reason}）`);
if (isDryRun) console.log('[admin-r2] 试运行模式：不会写入任何文件。');
console.log(`[admin-r2] 冲突策略：${onConflict}${conflictOverride ? '（显式指定）' : '（默认）'}`);

const toLocalPath = (key, prefix = sourcePrefix, root = contentRoot) => {
  if (!key.startsWith(prefix)) return null;
  const relativePath = key.slice(prefix.length).replace(/\\/g, '/');
  if (!relativePath || relativePath.split('/').some((part) => part === '..')) return null;

  const target = path.resolve(root, relativePath);
  if (!target.startsWith(`${root}${path.sep}`)) return null;
  return { relativePath, target };
};

/** 读取仓库现有文件内容，不存在返回 null */
async function readExisting(target) {
  try {
    return await readFile(target);
  } catch {
    return null;
  }
}

/**
 * 被 R2 版本覆盖掉的仓库文件，用于同步结束后明确告知 ——
 * 默认策略是 overwrite，如果你手改过某个文件，需要一眼看到它被覆盖了。
 * @type {string[]}
 */
const overwritten = [];

/** 仓库内的展示路径（相对项目根），用于日志 */
const displayPath = (target) => path.relative(process.cwd(), target).replace(/\\/g, '/') || target;

/**
 * 写入单个对象，返回 'added' | 'updated' | 'unchanged' | 'conflict'
 *
 * @param {string} key
 * @param {string} target
 * @param {Buffer} [prefetched] 已经取回的 body。站点数据要先读文本做骤减比对，
 *   若这里再取一次会白跑一趟；传进来即可复用，也保证比对与落盘的是同一份字节。
 */
async function downloadObject(key, target, prefetched) {
  const body = prefetched ?? (await source.getObject(key));
  const existing = await readExisting(target);

  if (existing === null) {
    if (!isDryRun) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    }
    return 'added';
  }

  if (sha256(existing) === sha256(body)) return 'unchanged';

  // 内容不同 —— 是否覆盖取决于冲突策略
  if (onConflict === 'skip') return 'conflict';

  if (!isDryRun) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  overwritten.push(displayPath(target));
  return 'updated';
}

async function pruneLocalContent(remoteRelativePaths) {
  if (!shouldPrune || remoteRelativePaths.size === 0) return 0;

  let removed = 0;
  for (const relativePath of await collectLocalFiles(contentRoot)) {
    if (!remoteRelativePaths.has(relativePath)) {
      if (!isDryRun) await rm(path.join(contentRoot, relativePath), { force: true });
      removed += 1;
    }
  }
  return removed;
}

// ---- 正文 ----
const remoteKeys = await source.listKeys(sourcePrefix);
const remoteRelativePaths = new Set();
const stats = { added: 0, updated: 0, unchanged: 0, conflict: 0 };
/** @type {string[]} */
const conflicts = [];

for (const key of remoteKeys) {
  const local = toLocalPath(key);
  if (!local) continue;
  const contentPath = contentRelativePathFromKey(key, sourcePrefix);
  if (!contentPath) continue;
  remoteRelativePaths.add(contentPath);

  const result = await downloadObject(key, local.target);
  stats[result] += 1;
  if (result === 'conflict') conflicts.push(contentPath);
}

// ---- 墓碑（后台删除过的文章）----
const tombstoneKeys = await source.listKeys('deleted/content/');
const removedByTombstone = await pruneDeletedContent({
  contentRoot,
  remoteRelativePaths,
  tombstoneKeys: isDryRun ? [] : tombstoneKeys
});
const removed = removedByTombstone + (await pruneLocalContent(remoteRelativePaths));

// ---- 设置 ----
const settingsKeys = settingsPrefix === sourcePrefix ? [] : await source.listKeys(settingsPrefix);
const settingsStats = { added: 0, updated: 0, unchanged: 0, conflict: 0 };

for (const key of settingsKeys) {
  const local = toLocalPath(key, settingsPrefix, settingsRoot);
  if (!local || !local.relativePath.endsWith('.json')) continue;
  settingsStats[await downloadObject(key, local.target)] += 1;
}

// ---- 站点数据 ----
const dataKeys = dataPrefix === sourcePrefix ? [] : await source.listKeys(dataPrefix);
const dataStats = { added: 0, updated: 0, unchanged: 0, conflict: 0 };

/**
 * 由 R2 的 `data/links.json` 派生 `src/data/links.ts`。
 * 生成逻辑放在 `lib/content-sync.mjs`，与一致性检查脚本共用同一份实现。
 */

/** 写入「由 R2 派生生成」的文件（内容需先经转换，无法直接比对原始对象） */
async function writeGenerated(target, content) {
  const existing = await readExisting(target);

  if (existing === null) {
    if (!isDryRun) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    return 'added';
  }

  if (sha256(existing) === sha256(Buffer.from(content))) return 'unchanged';
  if (onConflict === 'skip') return 'conflict';

  if (!isDryRun) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  overwritten.push(displayPath(target));
  return 'updated';
}

// ---- 站点数据骤减告警 ----
// 真实事故的传播路径：R2 的 data/links.json 只剩 1 条友链 → 同步脚本照单全收 →
// src/data/links.ts 被覆盖成 1 条 → 前端友链页几乎空白。
// 全程没有任何提示，只有翻 git diff 才看得出来。这里在落盘前先比一遍「规模指标」。
//
// 指标与判定逻辑放在 `lib/content-sync.mjs`（detectDataCollapse），有单元测试覆盖。
// 刻意只告警、不阻断：在后台批量下架友链/订阅是正常操作，把它做成构建错误
// 只会逼人绕过校验。需要硬失败时显式设置 ADMIN_R2_SYNC_STRICT=1。

/** @type {{ name: string; label: string; before: number; after: number }[]} */
const collapses = [];

for (const key of dataKeys) {
  if (!key.startsWith(dataPrefix)) continue;
  const name = key.slice(dataPrefix.length).replace(/\\/g, '/');

  const target = dataObjectTarget(name);
  if (!target) continue;

  const targetPath = path.resolve(target.path);
  const isTracked = name in DATA_METRICS;

  if (!target.generated && !isTracked) {
    dataStats[await downloadObject(key, targetPath)] += 1;
    continue;
  }

  // 先取回 body：一旦 downloadObject 落盘，就再也读不到仓库里的旧值了。
  const body = await source.getObject(key);

  if (isTracked) {
    const collapse = detectDataCollapse(name, await readExisting(targetPath), body);
    if (collapse) collapses.push(collapse);
  }

  dataStats[
    target.generated
      ? await writeGenerated(targetPath, linksModuleSource(body.toString('utf8')))
      : await downloadObject(key, targetPath, body)
  ] += 1;
}

// ---- 汇总 ----
const summary = (s) =>
  `新增 ${s.added} / 更新 ${s.updated} / 未变 ${s.unchanged} / 冲突跳过 ${s.conflict}`;

console.log(`[admin-r2] 正文：${summary(stats)}${removed ? `；清理 ${removed}` : ''}`);
console.log(`[admin-r2] 设置：${summary(settingsStats)} → src/data/settings`);
console.log(`[admin-r2] 站点数据：${summary(dataStats)} → src/data 与 src/config`);

const dataConflicts = settingsStats.conflict + dataStats.conflict;
if (dataConflicts > 0) {
  console.warn(
    `[admin-r2] ⚠ 有 ${dataConflicts} 个设置/数据文件在 R2 与仓库中内容不同，已保留仓库版本（--on-conflict=skip）。`
  );
}

if (collapses.length > 0) {
  console.warn('');
  console.warn('[admin-r2] ⚠ 站点数据骤减：R2 里的规模远小于仓库当前值。');
  for (const item of collapses) {
    console.warn(`    · ${item.name}：${item.label} ${item.before} → ${item.after}`);
  }
  console.warn('  同步已按 R2 版本覆盖仓库文件（R2 是唯一真源），前端会跟着变。');
  console.warn('  若这不是你刚在后台做的有意改动，说明 R2 数据可能被写坏了：');
  console.warn('    1) 打开后台友链/订阅列表，确认条目是否完整；');
  console.warn('    2) 需要还原时用 `scripts/data/links.original.json` 推回后台；');
  console.warn('    3) 还原后必须在后台点一次「保存并部署」，否则前端读的仍是旧的发布快照。');
  if (isStrict) {
    console.error('[admin-r2] ADMIN_R2_SYNC_STRICT=1，按错误退出。');
    process.exit(1);
  }
}

if (conflicts.length > 0) {
  console.warn('');
  console.warn(`[admin-r2] ⚠ 有 ${conflicts.length} 篇文章在 R2 与仓库中内容不同，已保留仓库版本（--on-conflict=skip）：`);
  conflicts.slice(0, 10).forEach((item) => console.warn(`    · ${item}`));
  if (conflicts.length > 10) console.warn(`    … 其余 ${conflicts.length - 10} 篇见 \`npm run content:check\``);
}

// 默认策略是 overwrite，覆盖动作必须可见 —— 否则手改过的文件被悄悄冲掉。
if (overwritten.length > 0) {
  console.log('');
  console.log(`[admin-r2] 已用 R2 版本覆盖 ${overwritten.length} 个仓库文件：`);
  overwritten.slice(0, 15).forEach((item) => console.log(`    ~ ${item}`));
  if (overwritten.length > 15) console.log(`    … 其余 ${overwritten.length - 15} 个`);
  console.log('    这是预期行为（R2 是唯一真源）。若其中有你手写的改动，用 `git diff` 检查。');
}

if (!shouldPrune && remoteRelativePaths.size > 0 && !isDryRun) {
  console.log('[admin-r2] 提示：未开启清理（ADMIN_R2_SYNC_PRUNE=1），仓库中 R2 已不存在的文章会保留。');
}
