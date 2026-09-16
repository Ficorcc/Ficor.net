import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMemos } from '../src/lib/server/memos/client';

afterEach(() => vi.unstubAllGlobals());

describe('Memos client', () => {
  it('reports missing access token clearly on authenticated Memos servers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { code: 16, message: 'authentication required' },
      { status: 401 }
    )));

    await expect(fetchMemos({ MEMOS_API_URL: 'https://memos.example.test' }))
      .rejects
      .toThrow('Memos 需要访问令牌，请在后台环境变量中配置 MEMOS_ACCESS_TOKEN');
  });
});
