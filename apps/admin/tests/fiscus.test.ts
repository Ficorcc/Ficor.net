import { describe, expect, it } from 'vitest';
import { shouldAutoApprove, validateCommentInput } from '../src/lib/server/fiscus/moderation';
import { withFiscus } from '../src/lib/server/fiscus/runtime';

const env = { DB: {} } as App.Platform['env'];

describe('Fiscus comment validation', () => {
  const input = {
    pageId: '/essay/hello-world/',
    authorName: '访客',
    authorEmail: 'guest@example.com',
    content: '写得很好'
  };

  it('only accepts internal page paths as page ids', () => {
    expect(validateCommentInput(input).ok).toBe(true);
    expect(validateCommentInput({ ...input, pageId: 'https://evil.test/post' }).ok).toBe(false);
    expect(validateCommentInput({ ...input, pageId: '//evil.test/post' }).ok).toBe(false);
  });

  it('does not auto approve by email history unless explicitly configured', () => {
    expect(withFiscus(env, () => shouldAutoApprove(99, { autoApprove: false, trustedAuthorAutoApproveCount: 0 }))).toBe(false);
    expect(withFiscus(env, () => shouldAutoApprove(1, { autoApprove: true, trustedAuthorAutoApproveCount: 0 }))).toBe(true);
  });
});
