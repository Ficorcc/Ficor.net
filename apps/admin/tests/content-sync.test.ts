import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ContentStore } from '../src/lib/server/r2/content';
import { pruneDeletedContent } from '../../../scripts/lib/content-sync.mjs';

function bucket() {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn(async (key: string) => values.has(key) ? { text: async () => values.get(key) } : null),
    put: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    delete: vi.fn(async (key: string) => { values.delete(key); })
  };
}

describe('content deletion sync', () => {
  it('writes tombstones and clears them when content is recreated', async () => {
    const r2 = bucket();
    const store = new ContentStore(r2 as unknown as R2Bucket);
    await store.delete('essay', 'old-post');
    expect(r2.values.has('deleted/content/essay/old-post.json')).toBe(true);
    expect(r2.delete).toHaveBeenCalledWith('content/essay/old-post.md');
    await store.write('essay', 'old-post', { title: '恢复', date: '2026-09-16' }, '正文');
    expect(r2.values.has('content/essay/old-post.md')).toBe(true);
    expect(r2.delete).toHaveBeenCalledWith('deleted/content/essay/old-post.json');
  });

  it('only prunes files with explicit tombstones and never removes active remote content', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vii-content-'));
    await mkdir(path.join(root, 'essay'), { recursive: true });
    await writeFile(path.join(root, 'essay/old.md'), '');
    await writeFile(path.join(root, 'essay/keep.md'), '');
    await writeFile(path.join(root, 'essay/unimported.md'), '');

    const removed = await pruneDeletedContent({
      contentRoot: root,
      remoteRelativePaths: new Set(['essay/keep.md']),
      tombstoneKeys: [
        'deleted/content/essay/old.json',
        'deleted/content/essay/keep.json',
        'deleted/content/essay/unimported/unsafe.json'
      ]
    });

    expect(removed).toBe(1);
    await expect(readFile(path.join(root, 'essay/old.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(path.join(root, 'essay/keep.md'))).resolves.toBeDefined();
    await expect(readFile(path.join(root, 'essay/unimported.md'))).resolves.toBeDefined();
  });
});
