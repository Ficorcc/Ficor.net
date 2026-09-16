import { describe, expect, it } from 'vitest';
import { isValidSlug, slugify } from '../src/lib/utils/slug';
import { ESSAY_PUBLIC_SLUG_RE } from '../../../src/utils/slug-rules';

describe('article slugs', () => {
  it('accepts existing Chinese article slugs without changing their URL', () => {
    expect(isValidSlug('教师节')).toEqual({ ok: true });
    expect(ESSAY_PUBLIC_SLUG_RE.test('教师节')).toBe(true);
  });

  it('uses Chinese titles as a safe slug when no explicit slug is supplied', () => {
    expect(slugify('教师节')).toBe('教师节');
    expect(slugify('教师节 2026！')).toBe('教师节-2026');
  });

  it('continues to reject spaces, separators, uppercase ASCII, and reserved slugs', () => {
    expect(isValidSlug('教师 节').ok).toBe(false);
    expect(isValidSlug('教师/节').ok).toBe(false);
    expect(isValidSlug('Teacher-Day').ok).toBe(false);
    expect(isValidSlug('admin').ok).toBe(false);
  });
});
