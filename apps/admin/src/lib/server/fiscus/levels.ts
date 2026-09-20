// ============================================================================
// 评论等级
//
// 判定依据：该邮箱**已通过审核**的评论条数（approvedCount）。
// 阈值与名称都可以在后台「系统设置 → 评论设置 → 评论等级」里改，
// 存进 fiscus_comment_settings 的 commentLevels 键（JSON 数组字符串）。
// ============================================================================

export interface CommentLevel {
  /** 达成条件：已通过审核的评论数下限（含） */
  min: number;
  /** 等级名称 */
  label: string;
}

/**
 * 默认等级。
 * 与改成可配置之前硬编码的值逐字一致 —— 保证没改过设置时行为不变，
 * 也保证升级后既有评论的等级不会突然变样。
 */
export const DEFAULT_LEVELS: CommentLevel[] = [
  { min: 30, label: "站友" },
  { min: 10, label: "常驻" },
  { min: 3, label: "熟客" },
  { min: 0, label: "访客" },
];

/** 兜底档的名称（min=0 那一档缺失时补上） */
export const FALLBACK_LEVEL_LABEL = "访客";

const MAX_LEVELS = 12;
const MAX_LABEL_LENGTH = 24;

function defaultLevels(): CommentLevel[] {
  return DEFAULT_LEVELS.map((level) => ({ ...level }));
}

/**
 * 归一化等级表：
 * - 丢掉畸形条目（缺名称、min 不是非负整数）
 * - 同一 min 只保留第一条
 * - 按 min 从高到低排序（`levelForApprovedCount` 依赖这个顺序）
 * - 保证末尾一定有一档 min=0 的兜底，否则低分用户无等级可落
 * - 空表回落到默认等级
 */
export function normalizeLevels(raw: unknown): CommentLevel[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<number>();
  const levels: CommentLevel[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const label = String(record.label ?? "").trim().slice(0, MAX_LABEL_LENGTH);
    const min = Number.parseInt(String(record.min ?? ""), 10);
    if (!label || !Number.isFinite(min) || min < 0) continue;
    if (seen.has(min)) continue;

    seen.add(min);
    levels.push({ min, label });
    if (levels.length >= MAX_LEVELS) break;
  }

  if (!levels.length) return defaultLevels();

  levels.sort((a, b) => b.min - a.min);
  if (levels.at(-1)!.min !== 0) levels.push({ min: 0, label: FALLBACK_LEVEL_LABEL });
  return levels;
}

/** 解析存储值：接受数组、JSON 字符串、或空值 */
export function parseLevels(raw: unknown): CommentLevel[] {
  if (Array.isArray(raw)) return normalizeLevels(raw);
  if (typeof raw === "string" && raw.trim()) {
    try {
      return normalizeLevels(JSON.parse(raw));
    } catch {
      // 存的是坏 JSON：当作没配过，回落默认
    }
  }
  return defaultLevels();
}

/** 取等级表里 min=0 那一档的名称，用于重算历史等级时的 ELSE 分支 */
export function fallbackLevelLabel(levels: CommentLevel[]): string {
  return levels.find((level) => level.min === 0)?.label ?? FALLBACK_LEVEL_LABEL;
}

/**
 * 按已通过审核的评论数取等级。
 * `levels` 必须是从高到低排好序的（`normalizeLevels` 的输出即可）。
 */
export function levelForApprovedCount(approvedCount: number, levels: CommentLevel[] = DEFAULT_LEVELS) {
  const count = Number.isFinite(approvedCount) ? Math.max(0, Math.trunc(approvedCount)) : 0;
  const table = levels.length ? levels : DEFAULT_LEVELS;
  const level = table.find((item) => count >= item.min) || table.at(-1)!;
  return {
    label: level.label,
    score: count,
  };
}
