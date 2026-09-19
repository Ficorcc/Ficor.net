// ============================================================================
// 反向通道：仓库 scripts/data/*.json → R2 data/*.json
//
// 与 push-content-to-admin.mjs（正文反向通道）互补：那个管 content/，
// 这个管站点数据（友链 / 订阅 / 小记）。用途是「后台数据被写坏或丢条目时，
// 用仓库里保存的原始快照把它修回去」。
//
// 为什么需要它：前台与后台都从 R2 的 data/ 读取，而 R2 是单向权威源。
// 一旦 R2 里的 data/links.json 丢条目（历史上真实发生过：46 条友链只剩 1 条），
// 构建时同步会把残缺数据写进 src/data/links.ts，整站友链一起消失 ——
// 此时必须能反过来把仓库里的原始数据推回 R2。
//
// 安全设计：
//   1. 默认「计划模式」，只对比并打印差异，加 --apply 才写入；
//   2. 写入前若发现条目数会减少，默认拒绝执行，必须显式加 --force；
//   3. 本地源写入前自动备份整个 miniflare 状态目录（含元数据库）。
//
// 用法：
//   node ./scripts/push-site-data.mjs                       # 查看计划
//   node ./scripts/push-site-data.mjs --apply               # 写入
//   node ./scripts/push-site-data.mjs --only=links --apply  # 只处理友链
//   node ./scripts/push-site-data.mjs --source=remote --apply
//   node ./scripts/push-site-data.mjs --apply --force       # 允许条目数减少
//   node ./scripts/push-site-data.mjs --emit-console        # 生成浏览器控制台还原脚本
//
// `--emit-console` 用于「没有 R2 凭据、但浏览器里已登录后台」的场景：
// 生成一段自带载荷的脚本，粘贴到 https://<站点>/admin/ 的 Console 即可写入。
// 载荷内联在脚本里，因此快照更新后必须重新生成，不要手改产物。
//
// 环境变量：
//   ADMIN_R2_*              远端 R2 凭据；缺省时回退本地模拟 R2
//   ADMIN_PUSH_BACKUP_DIR   本地备份目录，默认系统临时目录
// ============================================================================

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadEnvFile } from './lib/load-env.mjs';
import { subscriptionsOf, visibleLinksOf } from './lib/content-sync.mjs';
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
const force = argv.includes('--force');
const emitConsole = argv.includes('--emit-console');
const only = flagValue('only');

/**
 * 站点数据快照登记表。
 * key      —— R2 对象键
 * file     —— 仓库里保存的原始快照
 * adminKey —— 后台 DATA_SAVE 的 key（生成浏览器脚本时用）
 */
const SNAPSHOTS = [
  {
    name: 'links',
    label: '友链 + 站点信息',
    key: 'data/links.json',
    file: path.resolve('scripts/data/links.original.json'),
    adminKey: 'links'
  }
];

const selected = only ? SNAPSHOTS.filter((item) => item.name === only) : SNAPSHOTS;
if (selected.length === 0) {
  console.error(`[site-data] 未知的 --only=${only}，可选：${SNAPSHOTS.map((s) => s.name).join(' / ')}`);
  process.exit(1);
}

/**
 * 生成浏览器控制台脚本时要用到的「期望值」。
 *
 * 判定逻辑不在这里重写 —— 直接复用 `lib/content-sync.mjs` 里那两份
 * 有测试覆盖、且与前端 `publicCommunity` / `communityData` 对齐的实现。
 * 生成脚本里只写死算好的数字，不在浏览器端再抄一遍过滤条件。
 */
function expectationsOf(payload) {
  return {
    links: visibleLinksOf(payload).length,
    subscriptions: subscriptionsOf(payload).length,
    total: Array.isArray(payload?.links) ? payload.links.length : 0
  };
}

/** 生成一段自带载荷的浏览器控制台脚本：用已登录的后台会话把数据写回 R2。 */
function consoleScript(snapshot, payload) {
  const expected = expectationsOf(payload);
  const hidden = expected.total - expected.links;

  return `// ============================================================================
// 把 ${snapshot.file.replace(process.cwd() + '/', '')} 里的数据填回后台（R2），并重建 + 重新发布快照。
//
// 用法：
//   1. 浏览器登录后台：https://<你的站点>/admin/
//   2. 打开开发者工具 → Console
//   3. 整段粘贴本文件内容，回车
//
// 用的是浏览器里现有的登录会话（同源 cookie），不需要额外凭据。
//   DATA_SAVE key=${snapshot.adminKey}   → 写入 R2 的 ${snapshot.key}（${expected.total} 条，${expected.links} 可见 + ${hidden} 隐藏）
//   CONTENT_PUBLISH     → 触发 Cloudflare Pages 重建，并重新发布 published/community.json
//
// 本文件由 \`npm run site-data:push -- --emit-console\` 生成，请勿手改。
// ============================================================================
(async () => {
  const payload = ${JSON.stringify(payload)};

  // 期望值由生成器用 lib/content-sync.mjs 里那两份与前端对齐的实现算好写进来，
  // 这里不再重写过滤条件 —— 判定逻辑只存在一份，且有单元测试覆盖。
  const EXPECTED = ${JSON.stringify(expected)};

  const api = async (request, csrf) => {
    const response = await fetch('/admin/api/' + request.event, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      body: JSON.stringify(request),
      credentials: 'include'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + (data.message || data.error || ''));
    return data;
  };

  const view = async () => {
    const response = await fetch('/admin/api/community', { credentials: 'include', cache: 'no-store' });
    return response.json();
  };

  try {
    const before = await view();
    console.log('[修复前] 可见友链 ' + before.links.length + ' 条，订阅 ' + before.subscriptionCount + ' 个，siteInfo.url = ' + JSON.stringify(before.siteInfo.url));

    const { csrfToken } = await api({ event: 'CSRF_ISSUE' });

    console.log('[1/2] 写入 R2 的 ${snapshot.key}', await api({ event: 'DATA_SAVE', key: '${snapshot.adminKey}', value: payload }, csrfToken));
    console.log('[2/2] 触发重建与快照发布', await api({ event: 'CONTENT_PUBLISH' }, csrfToken));

    const after = await view();
    console.log('[修复后] 可见友链 ' + after.links.length + ' 条，订阅 ' + after.subscriptionCount + ' 个，siteInfo.url = ' + JSON.stringify(after.siteInfo.url));
    console.log('预期：可见友链 ' + EXPECTED.links + ' 条，订阅 ' + EXPECTED.subscriptions + ' 个');

    if (after.links.length === EXPECTED.links && after.subscriptionCount === EXPECTED.subscriptions) {
      console.log('✓ 数据已恢复。等 Pages 构建完成（约 1-2 分钟）后刷新前台页面。');
    } else {
      console.warn('⚠ 数量与预期不符，请把上面的输出发给我。');
    }
  } catch (error) {
    console.error('执行失败：' + error.message);
    if (String(error.message).includes('401')) console.error('→ 看起来没有登录，请先登录后台页面再重跑。');
  }
})();
`;
}

if (emitConsole) {
  const written = [];
  for (const snapshot of selected) {
    const payload = JSON.parse(await readFile(snapshot.file, 'utf8'));
    const target = path.resolve('scripts/data', `restore-${snapshot.name}.console.js`);
    await writeFile(target, consoleScript(snapshot, payload), 'utf8');
    written.push([target, expectationsOf(payload)]);
  }
  console.log('[site-data] 已生成浏览器控制台脚本：');
  for (const [target, expected] of written) {
    console.log(
      `   ${target.replace(process.cwd() + '/', '')}  （内联 ${expected.total} 条，${expected.links} 可见，订阅 ${expected.subscriptions}）`
    );
  }
  console.log('[site-data] 用法：登录后台 → 开发者工具 Console → 整段粘贴 → 回车。');
  process.exit(0);
}

/** 顶层数组字段的条目数，用于「条目数不许减少」这道闸门。 */
function entryCount(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const arrays = Object.values(payload).filter(Array.isArray);
  return arrays.reduce((max, list) => Math.max(max, list.length), 0);
}

const stable = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());

/** 逐字段比较，返回差异描述；无差异返回空数组。 */
function diffFields(before, after, prefix = '') {
  const changes = [];
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  for (const key of keys) {
    const left = before?.[key];
    const right = after?.[key];
    const at = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(left) || Array.isArray(right)) {
      const a = Array.isArray(left) ? left : [];
      const b = Array.isArray(right) ? right : [];
      if (a.length !== b.length) {
        changes.push(`${at}: ${a.length} 条 → ${b.length} 条`);
        continue;
      }
      let changed = 0;
      for (let i = 0; i < a.length; i += 1) {
        if (stable(a[i]) !== stable(b[i])) changed += 1;
      }
      if (changed) changes.push(`${at}: ${changed}/${a.length} 条内容不同`);
      continue;
    }
    if (stable(left) !== stable(right)) {
      changes.push(`${at}: ${JSON.stringify(left)} → ${JSON.stringify(right)}`);
    }
  }
  return changes;
}

const { source, reason } = await resolveContentSource({ env });
if (!source) {
  console.error(`[site-data] 未找到可用的数据源：${reason}`);
  process.exit(1);
}
if (!source.putObject) {
  console.error('[site-data] 当前数据源不支持写入。');
  process.exit(1);
}

console.log(`[site-data] 目标：${source.label}（${reason}）`);
console.log(`[site-data] 模式：${shouldApply ? '写入' : '计划（只读，加 --apply 才写入）'}`);
console.log('');

/** 计划项：{ snapshot, payload, text, before, changes, blocked } */
const plan = [];

for (const snapshot of selected) {
  const text = await readFile(snapshot.file, 'utf8');
  const payload = JSON.parse(text);

  let before = null;
  let remoteMissing = false;
  try {
    before = JSON.parse(await source.getObject(snapshot.key));
  } catch {
    remoteMissing = true;
  }

  const changes = remoteMissing ? ['R2 中不存在该对象'] : diffFields(before, payload);
  const from = remoteMissing ? 0 : entryCount(before);
  const to = entryCount(payload);
  const blocked = !remoteMissing && to < from && !force;

  plan.push({ snapshot, payload, text, before, changes, from, to, remoteMissing, blocked });
}

console.log('── 差异 ──');
for (const item of plan) {
  const { snapshot, changes, from, to, remoteMissing } = item;
  if (changes.length === 0) {
    console.log(`   = ${snapshot.key}（${snapshot.label}）与仓库快照一致，无需写入`);
    continue;
  }
  console.log(`   ~ ${snapshot.key}（${snapshot.label}）`);
  if (!remoteMissing) console.log(`     条目数：${from} → ${to}`);
  changes.slice(0, 12).forEach((line) => console.log(`     · ${line}`));
  if (changes.length > 12) console.log(`     · … 其余 ${changes.length - 12} 项`);
}
console.log('');

const pending = plan.filter((item) => item.changes.length > 0);
const blocked = pending.filter((item) => item.blocked);

if (pending.length === 0) {
  console.log('[site-data] 无需写入，仓库快照与 R2 已一致。');
  process.exit(0);
}

if (blocked.length > 0) {
  console.error('[site-data] 已中止：以下对象写入后条目数会减少，这通常意味着快照或 R2 有问题。');
  blocked.forEach((item) => console.error(`   ✗ ${item.snapshot.key}：${item.from} → ${item.to}`));
  console.error('[site-data] 确认无误请加 --force 重跑。');
  process.exit(1);
}

if (!shouldApply) {
  console.log('[site-data] 这是计划模式，未写入任何内容。确认无误后加 --apply 执行。');
  process.exit(0);
}

// 本地源先备份：R2 是开发用存储，覆盖前留一份可回滚的快照。
// 注意要连元数据库一起备份 —— 只备份 blobs 是没法回滚的。
if (source.kind === 'local' && source.bucketRoot) {
  const stateR2Root = path.dirname(source.bucketRoot);
  const backupRoot = path.resolve(env.ADMIN_PUSH_BACKUP_DIR ?? path.join(os.tmpdir(), 'viiink-r2-backups'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupRoot, stamp);
  try {
    await mkdir(backupDir, { recursive: true });
    await cp(stateR2Root, path.join(backupDir, path.basename(stateR2Root)), { recursive: true });
    console.log(`[site-data] 已备份本地 R2（含元数据库）→ ${backupDir}`);
    console.log('');
  } catch (error) {
    console.error(`[site-data] 备份失败，已中止写入：${error.message}`);
    process.exit(1);
  }
}

console.log(`[site-data] 开始写入 ${pending.length} 个对象…`);
const failures = [];
for (const item of pending) {
  try {
    const body = Buffer.from(item.text, 'utf8');
    await source.putObject(item.snapshot.key, body, { contentType: 'application/json; charset=utf-8' });
    console.log(`   + ${item.snapshot.key}（${body.length} 字节）`);
  } catch (error) {
    failures.push({ key: item.snapshot.key, message: error.message });
    console.error(`   ✗ ${item.snapshot.key} 失败：${error.message}`);
  }
}

console.log('');
console.log(`[site-data] 完成：成功 ${pending.length - failures.length} 个，失败 ${failures.length} 个。`);
console.log('[site-data] 建议接着跑 `npm run content:sync && npm run content:check` 复核并同步到前端。');
if (failures.length) process.exit(1);
