// ============================================================================
// 内容一致性检查：R2（后台真源） vs 仓库 src/content（主站输入）
//
// 回答一个问题：「后台显示的文章，和前端能看到的文章，是不是同一批？」
//
// 用法：
//   node ./scripts/check-content-consistency.mjs
//   node ./scripts/check-content-consistency.mjs --source=local
//   node ./scripts/check-content-consistency.mjs --strict   # 不一致时退出码 1
//
// 输出四类正文差异：
//   1. 仅 R2 有   —— 后台写了但从未同步到仓库，前端看不到（本地必现）
//   2. 仅仓库有   —— 仓库里有但后台没有，后台列表看不到
//   3. 内容不一致 —— 两边都有同名文件，但正文不同（同步会覆盖仓库版本）
//   4. 公开 slug 冲突 —— 两篇文章算出同一个公开 URL，构建时会直接报错
//
// 另外单独比对 settings/ 与 data/ 前缀（后台写的主题设置与站点数据）：
//   这两个前缀的文件同样会被同步到仓库，只看正文会漏掉。
// ============================================================================

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { dataObjectTarget, linksModuleSource } from './lib/content-sync.mjs';
import { loadEnvFile } from './lib/load-env.mjs';
import { resolveContentSource } from './lib/r2-source.mjs';

loadEnvFile();

const env = process.env;
const sourceFlag = process.argv.slice(2).find((arg) => arg.startsWith('--source='));
if (sourceFlag) env.ADMIN_R2_SOURCE = sourceFlag.slice('--source='.length);
const isStrict = process.argv.includes('--strict');

const COLLECTIONS = ['essay', 'bits', 'memo'];
const contentPrefix = (env.ADMIN_R2_PREFIX ?? 'content/').replace(/^\/+/, '');
const settingsPrefix = (env.ADMIN_R2_SETTINGS_PREFIX ?? 'settings/').replace(/^\/+/, '');
const dataPrefix = (env.ADMIN_R2_DATA_PREFIX ?? 'data/').replace(/^\/+/, '');
const contentRoot = path.resolve('src/content');

// 与 src/utils/slug-rules.ts 保持一致：essay 的公开 slug 必须是单段
// kebab-case（允许中文），且不能与兄弟静态路由同名。
const ESSAY_PUBLIC_SLUG_RE = /^[a-z0-9\p{Script=Han}]+(?:-[a-z0-9\p{Script=Han}]+)*$/u;
const RESERVED_ESSAY_SLUGS = new Set([
  'about',
  'admin',
  'api',
  'archive',
  'bits',
  'checks',
  'essay',
  'friends',
  'links',
  'memo',
  'page',
  'robots.txt',
  'rss.xml',
  'tag'
]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** 读取仓库里某个集合的全部 markdown 文件内容（按文件名） */
function readRepoCollection(collection) {
  const dir = path.join(contentRoot, collection);
  const files = new Map();
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const full = path.join(dir, entry.name);
    files.set(entry.name, readFileSync(full));
  }
  return files;
}

/** 从 frontmatter 里取 slug；取不到则回退到文件名（与主站 slug-rules 一致） */
function publicSlug(markdown, fileName) {
  const stem = fileName.replace(/\.md$/i, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown.toString('utf8'));
  if (!match) return stem;

  const slugLine = /^slug:\s*(.+?)\s*$/m.exec(match[1]);
  if (!slugLine) return stem;

  return slugLine[1].replace(/^["']|["']$/g, '').trim() || stem;
}

const { source, reason } = await resolveContentSource({ env });

if (!source) {
  console.error(`[consistency] 未找到可用的内容源：${reason}`);
  process.exit(1);
}

console.log(`[consistency] 内容源：${source.label}`);
console.log(`[consistency] 对比目标：${contentRoot}`);
console.log('');

let totalProblems = 0;

for (const collection of COLLECTIONS) {
  const prefix = `${contentPrefix}${collection}/`;
  const r2Keys = (await source.listKeys(prefix)).filter((key) => key.endsWith('.md'));
  const repoFiles = readRepoCollection(collection);

  const r2ByName = new Map(r2Keys.map((key) => [key.slice(prefix.length), key]));
  const onlyR2 = [...r2ByName.keys()].filter((name) => !repoFiles.has(name)).sort();
  const onlyRepo = [...repoFiles.keys()].filter((name) => !r2ByName.has(name)).sort();

  const differing = [];
  for (const [name, key] of r2ByName) {
    const repoBody = repoFiles.get(name);
    if (!repoBody) continue;
    const r2Body = await source.getObject(key);
    if (sha256(r2Body) !== sha256(repoBody)) {
      differing.push({ name, r2Size: r2Body.length, repoSize: repoBody.length });
    }
  }

  // 公开 slug 检测：先找非法/保留字（构建会直接失败），再找重复
  const slugOwners = new Map();
  const invalidSlugs = [];
  for (const [name, body] of repoFiles) {
    const slug = publicSlug(body, name);

    if (collection === 'essay') {
      if (!ESSAY_PUBLIC_SLUG_RE.test(slug)) {
        invalidSlugs.push({ name, slug, reason: '含非法字符（只允许小写字母、数字、中文、连字符）' });
        continue;
      }
      if (RESERVED_ESSAY_SLUGS.has(slug)) {
        invalidSlugs.push({ name, slug, reason: '与兄弟静态路由同名' });
        continue;
      }
    }

    const owners = slugOwners.get(slug) ?? [];
    owners.push(name);
    slugOwners.set(slug, owners);
  }
  const conflicts = [...slugOwners.entries()].filter(([, owners]) => owners.length > 1);

  const problemCount = onlyR2.length + onlyRepo.length + differing.length + conflicts.length + invalidSlugs.length;
  totalProblems += problemCount;

  const status = problemCount === 0 ? '✓ 一致' : `✗ ${problemCount} 处差异`;
  console.log(`── ${collection}：R2 ${r2Keys.length} 篇 / 仓库 ${repoFiles.size} 篇  ${status}`);

  if (onlyR2.length) {
    console.log(`   ⚠ 仅 R2 有（${onlyR2.length}）—— 后台写了但前端看不到：`);
    onlyR2.forEach((name) => console.log(`      · ${name}`));
  }
  if (onlyRepo.length) {
    console.log(`   ⚠ 仅仓库有（${onlyRepo.length}）—— 后台列表里没有：`);
    onlyRepo.forEach((name) => console.log(`      · ${name}`));
  }
  if (differing.length) {
    console.log(`   ⚠ 内容不一致（${differing.length}）—— 同步会用 R2 版本覆盖仓库：`);
    differing.forEach(({ name, r2Size, repoSize }) =>
      console.log(`      · ${name}  (R2 ${r2Size}B / 仓库 ${repoSize}B)`)
    );
  }
  if (invalidSlugs.length) {
    console.log(`   ✗ 非法公开 slug（${invalidSlugs.length}）—— 构建会直接失败：`);
    invalidSlugs.forEach(({ name, slug, reason }) =>
      console.log(`      · ${name}  → "${slug}"  ${reason}`)
    );
  }
  if (conflicts.length) {
    console.log(`   ✗ 公开 slug 冲突（${conflicts.length}）—— 构建会直接失败：`);
    conflicts.forEach(([slug, owners]) => console.log(`      · "${slug}" ← ${owners.join(', ')}`));
  }
  if (problemCount === 0) {
    console.log('   前后端内容完全一致。');
  }
  console.log('');
}

// ---- 设置与站点数据 ----
// 正文之外，后台还会写 settings/ 与 data/ 前缀。这些文件同样会被同步到仓库，
// 但消费者不同（例如 data/links.json 会派生成 src/data/links.ts），
// 所以单独比对一遍 —— 只看正文会漏掉这类差异。
{
  const settingsKeys = settingsPrefix === contentPrefix ? [] : await source.listKeys(settingsPrefix);
  const dataKeys = dataPrefix === contentPrefix ? [] : await source.listKeys(dataPrefix);

  /** 逐项比对：R2 对象 → 仓库目标文件 */
  async function compareSection(label, keys, prefix, resolveTarget) {
    const rows = [];

    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      const name = key.slice(prefix.length).replace(/\\/g, '/');
      const target = resolveTarget(name);
      if (!target) continue;

      const targetPath = path.resolve(target.path);
      let repoBody = null;
      try {
        repoBody = readFileSync(targetPath);
      } catch {
        repoBody = null;
      }

      if (repoBody === null) {
        rows.push({ name, repoPath: target.path, status: 'missing' });
        continue;
      }

      const rawText = (await source.getObject(key)).toString('utf8');
      // 派生文件必须用与同步脚本完全相同的生成器，否则会误报差异
      const expected = target.generated ? Buffer.from(linksModuleSource(rawText)) : Buffer.from(rawText);
      rows.push({
        name,
        repoPath: target.path,
        status: sha256(expected) === sha256(repoBody) ? 'same' : 'differ'
      });
    }

    const missing = rows.filter((row) => row.status === 'missing');
    const differing = rows.filter((row) => row.status === 'differ');
    const problemCount = missing.length + differing.length;
    totalProblems += problemCount;

    console.log(`── ${label}：R2 ${rows.length} 个对象  ${problemCount === 0 ? '✓ 一致' : `✗ ${problemCount} 处差异`}`);

    if (missing.length) {
      console.log(`   ⚠ 仓库缺少对应文件（${missing.length}）—— 同步会新建：`);
      missing.forEach((row) => console.log(`      · ${row.name} → ${row.repoPath}`));
    }
    if (differing.length) {
      console.log(`   ⚠ 内容不一致（${differing.length}）—— 同步会用 R2 版本覆盖仓库：`);
      differing.forEach((row) => console.log(`      · ${row.name} → ${row.repoPath}`));
    }
    if (problemCount === 0) {
      console.log('   前后端数据完全一致。');
    }
    console.log('');
  }

  await compareSection('设置', settingsKeys, settingsPrefix, (name) =>
    name.endsWith('.json') ? { path: `src/data/settings/${name}`, generated: false } : null
  );
  await compareSection('站点数据', dataKeys, dataPrefix, dataObjectTarget);
}

if (totalProblems === 0) {
  console.log('[consistency] 结论：后台与前端（正文 + 设置 + 站点数据）完全一致。');
  process.exit(0);
}

console.log(`[consistency] 结论：共 ${totalProblems} 处差异。`);
console.log('[consistency] 执行 `npm run content:sync` 可将 R2 内容同步到仓库；');
console.log('[consistency] 数据类差异若确认以 R2 为准，加 `--on-conflict=overwrite`。');

if (isStrict) process.exit(1);
