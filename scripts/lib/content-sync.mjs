import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * @param {string} key
 * @param {string} [prefix]
 * @returns {string | null}
 */
export function contentRelativePathFromKey(key, prefix = 'content/') {
  if (!key.startsWith(prefix) || !key.endsWith('.md')) return null;
  const relativePath = key.slice(prefix.length).replace(/\\/g, '/');
  if (!relativePath || relativePath.split('/').some((part) => part === '..' || part === '')) return null;
  return relativePath;
}

/**
 * @param {string} key
 * @param {string} [prefix]
 * @returns {string | null}
 */
export function tombstoneRelativePathFromKey(key, prefix = 'deleted/content/') {
  if (!key.startsWith(prefix) || !key.endsWith('.json')) return null;
  const raw = key.slice(prefix.length, -'.json'.length).replace(/\\/g, '/');
  const [collection, slug, extra] = raw.split('/');
  if (extra || !collection || !slug || collection === '..' || slug === '..') return null;
  return `${collection}/${slug}.md`;
}

/**
 * @param {string} dir
 * @param {string} [base]
 * @returns {Promise<string[]>}
 */
export async function collectLocalFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  /** @type {string[]} */
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

/**
 * @param {{ contentRoot: string; remoteRelativePaths: Set<string>; tombstoneKeys: string[] }} input
 * @returns {Promise<number>}
 */
export async function pruneDeletedContent(input) {
  const { contentRoot, remoteRelativePaths, tombstoneKeys } = input;
  const localFiles = new Set(await collectLocalFiles(contentRoot));
  let removed = 0;

  for (const key of tombstoneKeys) {
    const relativePath = tombstoneRelativePathFromKey(key);
    if (!relativePath || remoteRelativePaths.has(relativePath) || !localFiles.has(relativePath)) continue;
    await rm(path.join(contentRoot, relativePath), { force: true });
    removed++;
  }

  return removed;
}
