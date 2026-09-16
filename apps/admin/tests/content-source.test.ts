import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSourceMarkdownFiles } from '../src/lib/server/github/content-source';

afterEach(() => vi.unstubAllGlobals());

describe('GitHub content source', () => {
  it('retries public reads without a bad token', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer bad-token' });
        return Response.json({ message: 'Bad credentials' }, { status: 401 });
      }
      if (fetchMock.mock.calls.length === 2) {
        expect(JSON.stringify(init?.headers ?? {})).not.toContain('Authorization');
        return Response.json({
          tree: [
            {
              path: 'src/content/essay/hello.md',
              type: 'blob',
              sha: 'abc',
              size: 12
            }
          ],
          truncated: false
        });
      }
      expect(String(url)).toBe('https://raw.githubusercontent.com/Ficorcc/Ficor.net/main/src/content/essay/hello.md');
      expect(JSON.stringify(init?.headers ?? {})).not.toContain('Authorization');
      return new Response('---\ntitle: Hello\ndate: 2026-09-16\n---\n正文');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSourceMarkdownFiles(
      'bad-token',
      { owner: 'Ficorcc', repo: 'Ficor.net', ref: 'main' },
      'essay'
    );

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      slug: 'hello',
      markdown: '---\ntitle: Hello\ndate: 2026-09-16\n---\n正文'
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
