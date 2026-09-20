import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEVELS,
  FALLBACK_LEVEL_LABEL,
  levelForApprovedCount,
  normalizeLevels,
  parseLevels,
} from '../src/lib/server/fiscus/levels';

describe('评论等级', () => {
  it('默认等级与改成可配置之前硬编码的值一致', () => {
    // 回归护栏：这几个值一旦漂移，线上既有评论的等级会集体变样
    expect(DEFAULT_LEVELS).toEqual([
      { min: 30, label: '站友' },
      { min: 10, label: '常驻' },
      { min: 3, label: '熟客' },
      { min: 0, label: '访客' },
    ]);
  });

  it('按已通过审核的评论数取等级，边界值取「含」', () => {
    const at = (count: number) => levelForApprovedCount(count).label;
    expect(at(0)).toBe('访客');
    expect(at(2)).toBe('访客');
    expect(at(3)).toBe('熟客');
    expect(at(9)).toBe('熟客');
    expect(at(10)).toBe('常驻');
    expect(at(29)).toBe('常驻');
    expect(at(30)).toBe('站友');
    expect(at(9999)).toBe('站友');
  });

  it('score 回传的就是传入的计数，负数与小数会被规整', () => {
    expect(levelForApprovedCount(7).score).toBe(7);
    expect(levelForApprovedCount(-5).score).toBe(0);
    expect(levelForApprovedCount(3.9).score).toBe(3);
    // NaN 不该把等级判定带崩
    expect(levelForApprovedCount(Number.NaN).label).toBe('访客');
  });

  it('自定义等级表按 min 从高到低生效', () => {
    const levels = normalizeLevels([
      { min: 0, label: '路人' },
      { min: 5, label: '脸熟' },
      { min: 50, label: '老朋友' },
    ]);
    expect(levels.map((l) => l.min)).toEqual([50, 5, 0]);
    expect(levelForApprovedCount(4, levels).label).toBe('路人');
    expect(levelForApprovedCount(5, levels).label).toBe('脸熟');
    expect(levelForApprovedCount(50, levels).label).toBe('老朋友');
  });

  it('归一化会丢掉畸形条目并按 min 去重', () => {
    const levels = normalizeLevels([
      { min: 5, label: '甲' },
      { min: 5, label: '重复的乙' },
      { min: -1, label: '负数' },
      { min: 3, label: '   ' },
      { label: '没有 min' },
      'not-an-object',
      null,
    ]);
    expect(levels).toEqual([
      { min: 5, label: '甲' },
      { min: 0, label: FALLBACK_LEVEL_LABEL },
    ]);
  });

  it('缺少 min=0 兜底档时自动补上，否则低分用户无等级可落', () => {
    const levels = normalizeLevels([{ min: 10, label: '常驻' }]);
    expect(levels.at(-1)).toEqual({ min: 0, label: FALLBACK_LEVEL_LABEL });
    expect(levelForApprovedCount(0, levels).label).toBe(FALLBACK_LEVEL_LABEL);
  });

  it('等级名称会去空白并截断到 24 字', () => {
    const levels = normalizeLevels([{ min: 0, label: `  ${'长'.repeat(40)}  ` }]);
    expect(levels[0].label).toHaveLength(24);
  });

  it('空表 / 坏值回落默认等级', () => {
    expect(normalizeLevels([])).toEqual(DEFAULT_LEVELS);
    expect(normalizeLevels('不是数组')).toEqual(DEFAULT_LEVELS);
    expect(parseLevels('')).toEqual(DEFAULT_LEVELS);
    expect(parseLevels('{坏 JSON')).toEqual(DEFAULT_LEVELS);
    expect(parseLevels(undefined)).toEqual(DEFAULT_LEVELS);
  });

  it('parseLevels 同时接受数组与 JSON 字符串', () => {
    const raw = [{ min: 0, label: '路人' }];
    expect(parseLevels(raw)).toEqual(raw);
    expect(parseLevels(JSON.stringify(raw))).toEqual(raw);
  });

  it('默认等级不会被调用方就地改坏', () => {
    const levels = normalizeLevels([]);
    levels[0].label = '被改了';
    expect(DEFAULT_LEVELS[0].label).toBe('站友');
  });
});
