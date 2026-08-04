import type { CollectionEntry } from 'astro:content';
import { getPublished, getPageSlice, getTotalPages } from './content';
import { getMemos, getMemoAnchorId, type MemoItem } from './memos';
import { createWithBase, formatDateTime } from '../utils/format';
import { deriveMarkdownText, truncateText } from '../utils/excerpt';

export type BitsEntry = CollectionEntry<'bits'>;
export type BitsYearOption = {
  value: number;
  count: number;
};

export type BitsStreamItem =
  | { kind: 'bit'; bit: BitsEntry; date: Date }
  | { kind: 'memo'; memo: MemoItem; date: Date };

export type BitsIndexItem = {
  key: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  text: string;
  excerpt: string;
  date: string | null;
  dateLabel: string | null;
  year: number | null;
  page: number;
  href: string;
  thumbnail?: {
    src: string;
    width: number;
    height: number;
    alt: string;
  } | null;
};

export type BitsDerivedText = {
  plainText: string;
  text: string;
  excerpt: string;
  shouldRenderFull: boolean;
};

const MAX_INDEX_TEXT = 600;
const FULL_RENDER_LIMIT = 180;
export const MAX_PRIMARY_BITS_FILTER_YEARS = 2;
const orderByBitsDate = (a: BitsEntry, b: BitsEntry) => b.data.date.valueOf() - a.data.date.valueOf();
const shouldMemoizeBitQueries = import.meta.env.PROD;
const base = import.meta.env.BASE_URL ?? '/';
const withBase = createWithBase(base);

let sortedBitsPromise: Promise<BitsEntry[]> | null = null;
let sortedStreamPromise: Promise<BitsStreamItem[]> | null = null;
const bitsIndexPromiseByPageSize = new Map<number, Promise<BitsIndexItem[]>>();
const bitsDerivedTextById = new Map<string, BitsDerivedText>();

const cloneBitEntries = (entries: readonly BitsEntry[]) => entries.slice();

const loadSortedBits = () =>
  getPublished('bits', {
    orderBy: orderByBitsDate
  });

export const getBitSlug = (entry: BitsEntry) => entry.data.slug ?? entry.id;

export const getBitAnchorId = (key: string) => `bit-${key}`;

export const getBitsPagePath = (page: number) => (page <= 1 ? '/bits/' : `/bits/page/${page}/`);

const buildBitsYearOptions = (items: readonly BitsStreamItem[]): BitsYearOption[] => {
  const yearCountMap = new Map<number, number>();

  for (const item of items) {
    const year = item.date.getFullYear();
    yearCountMap.set(year, (yearCountMap.get(year) ?? 0) + 1);
  }

  return Array.from(yearCountMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([value, count]) => ({
      value,
      count
    }));
};

export async function getSortedBits() {
  if (!shouldMemoizeBitQueries) {
    return loadSortedBits();
  }

  sortedBitsPromise ??= loadSortedBits();
  return cloneBitEntries(await sortedBitsPromise);
}

const loadSortedStream = async (): Promise<BitsStreamItem[]> => {
  const [bits, memos] = await Promise.all([getSortedBits(), getMemos()]);
  const stream: BitsStreamItem[] = [
    ...bits.map((bit) => ({ kind: 'bit' as const, bit, date: bit.data.date })),
    ...memos.map((memo) => ({ kind: 'memo' as const, memo, date: memo.date }))
  ];
  stream.sort((a, b) => b.date.valueOf() - a.date.valueOf());
  return stream;
};

export async function getSortedStream(): Promise<BitsStreamItem[]> {
  if (!shouldMemoizeBitQueries) {
    return loadSortedStream();
  }

  sortedStreamPromise ??= loadSortedStream();
  return (await sortedStreamPromise).slice();
}

export async function getBitsPageData(currentPage: number, pageSize: number) {
  const stream = await getSortedStream();
  const totalCount = stream.length;
  const totalPages = Math.max(getTotalPages(totalCount, pageSize), 1);

  return {
    items: getPageSlice(stream, currentPage, pageSize),
    yearOptions: buildBitsYearOptions(stream),
    totalCount,
    totalPages
  };
}

const getSearchIndexText = (plainText: string) =>
  plainText.length > MAX_INDEX_TEXT ? plainText.slice(0, MAX_INDEX_TEXT) : plainText;

const buildBitsDerivedText = (bit: BitsEntry): BitsDerivedText => {
  const { plainText, excerptText } = deriveMarkdownText(bit.body ?? '');

  return {
    plainText,
    text: getSearchIndexText(plainText),
    excerpt: truncateText(excerptText, FULL_RENDER_LIMIT),
    shouldRenderFull: plainText.length <= FULL_RENDER_LIMIT
  };
};

export function getBitsDerivedText(bit: BitsEntry): BitsDerivedText {
  if (!shouldMemoizeBitQueries) {
    return buildBitsDerivedText(bit);
  }

  let derivedText = bitsDerivedTextById.get(bit.id);
  if (!derivedText) {
    derivedText = buildBitsDerivedText(bit);
    bitsDerivedTextById.set(bit.id, derivedText);
  }

  return derivedText;
}

const buildMemoDerivedText = (memo: MemoItem): BitsDerivedText => {
  const { plainText, excerptText } = deriveMarkdownText(memo.content);

  return {
    plainText,
    text: getSearchIndexText(plainText),
    excerpt: truncateText(excerptText, FULL_RENDER_LIMIT),
    shouldRenderFull: plainText.length <= FULL_RENDER_LIMIT
  };
};

export function getMemoDerivedText(memo: MemoItem): BitsDerivedText {
  if (!shouldMemoizeBitQueries) {
    return buildMemoDerivedText(memo);
  }

  const cacheKey = `memo:${memo.id}`;
  let derivedText = bitsDerivedTextById.get(cacheKey);
  if (!derivedText) {
    derivedText = buildMemoDerivedText(memo);
    bitsDerivedTextById.set(cacheKey, derivedText);
  }

  return derivedText;
}

const buildBitsIndex = async (pageSize: number) => {
  const stream = await getSortedStream();
  return stream.map((item, index) => {
    const page = Math.floor(index / pageSize) + 1;

    if (item.kind === 'memo') {
      const { memo } = item;
      const derivedText = getMemoDerivedText(memo);

      return {
        key: `memo-${memo.id}`,
        slug: `memo-${memo.id}`,
        title: '',
        description: '',
        tags: ['说说'],
        text: derivedText.text,
        excerpt: derivedText.excerpt,
        date: memo.date.toISOString(),
        dateLabel: formatDateTime(memo.date),
        year: memo.date.getFullYear(),
        page,
        href: `${withBase(getBitsPagePath(page))}#${getMemoAnchorId(memo.id)}`,
        thumbnail: null
      };
    }

    const { bit } = item;
    const derivedText = getBitsDerivedText(bit);
    const firstImage = bit.data.images?.[0];

    return {
      key: bit.id,
      slug: getBitSlug(bit),
      title: bit.data.title ?? '',
      description: bit.data.description ?? '',
      tags: bit.data.tags ?? [],
      text: derivedText.text,
      excerpt: derivedText.excerpt,
      date: bit.data.date ? bit.data.date.toISOString() : null,
      dateLabel: bit.data.date ? formatDateTime(bit.data.date) : null,
      year: bit.data.date ? bit.data.date.getFullYear() : null,
      page,
      href: `${withBase(getBitsPagePath(page))}#${getBitAnchorId(bit.id)}`,
      thumbnail: firstImage
        ? {
            src: withBase(firstImage.src),
            width: firstImage.width,
            height: firstImage.height,
            alt: firstImage.alt ?? ''
          }
        : null
    };
  });
};

export async function getBitsSearchIndex(pageSize: number) {
  if (!shouldMemoizeBitQueries) {
    return buildBitsIndex(pageSize);
  }

  let promise = bitsIndexPromiseByPageSize.get(pageSize);
  if (!promise) {
    promise = buildBitsIndex(pageSize);
    bitsIndexPromiseByPageSize.set(pageSize, promise);
  }

  const index = await promise;
  return index.map((item) => ({
    ...item,
    tags: item.tags.slice(),
    thumbnail: item.thumbnail
      ? {
          ...item.thumbnail
        }
      : null
  }));
}
