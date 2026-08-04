// ============================================================================
// Memos 说说数据层
// 数据文件 src/data/memos.json 由构建时的 R2 同步生成（见
// scripts/sync-admin-r2-content.mjs），本地没有该文件时按空列表处理。
// ============================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface MemoItem {
  id: string;
  content: string;
  date: Date;
  pinned: boolean;
}

interface RawMemo {
  id?: unknown;
  memosName?: unknown;
  content?: unknown;
  createdAt?: unknown;
  pinned?: unknown;
}

const MEMOS_FILE = path.resolve('src/data/memos.json');

const shouldMemoize = import.meta.env.PROD;
let memosPromise: Promise<MemoItem[]> | null = null;

function normalizeMemo(raw: RawMemo, index: number): MemoItem | null {
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  if (!content) return null;

  const fallbackId = raw.memosName ? String(raw.memosName).split('/').pop() : undefined;
  const id = String(raw.id ?? fallbackId ?? `memo-${index + 1}`);

  const parsed = typeof raw.createdAt === 'string' ? new Date(raw.createdAt) : null;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(0);

  return { id, content, date, pinned: Boolean(raw.pinned) };
}

async function loadMemos(): Promise<MemoItem[]> {
  let text: string;
  try {
    text = await readFile(MEMOS_FILE, 'utf8');
  } catch {
    // 本地开发/未同步 R2 时没有数据文件
    return [];
  }

  try {
    const payload = JSON.parse(text) as unknown;
    if (!Array.isArray(payload)) return [];
    return payload
      .map((item, index) => normalizeMemo(item as RawMemo, index))
      .filter((item): item is MemoItem => item !== null);
  } catch {
    return [];
  }
}

export async function getMemos(): Promise<MemoItem[]> {
  if (!shouldMemoize) return loadMemos();
  memosPromise ??= loadMemos();
  return (await memosPromise).slice();
}

export const getMemoAnchorId = (id: string) => `memo-${id}`;
