import type { Collection } from '$lib/utils/content-schema';

export interface SourceRepoConfig {
  owner?: string;
  repo?: string;
  ref?: string;
}

export interface SourceMarkdownFile {
  collection: Collection;
  slug: string;
  path: string;
  sha: string;
  size: number;
  markdown: string;
}

export interface SourceMarkdownBatch {
  files: SourceMarkdownFile[];
  total: number;
  nextCursor?: number;
}

export interface SourceMarkdownBatchOptions {
  cursor?: number;
  limit?: number;
}

interface GitTreeItem {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
  size?: number;
  url?: string;
}

interface GitTreeResponse {
  tree?: GitTreeItem[];
  truncated?: boolean;
  message?: string;
}

const githubHeaders = (token?: string) => {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'vii-ink-admin'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const trimSlash = (value: string) => value.replace(/^\/+|\/+$/g, '');

async function fetchGithubJson<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, { headers: githubHeaders(token) });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };

  if (!res.ok) {
    throw new Error(data.message ? `GitHub API ${res.status}: ${data.message}` : `GitHub API ${res.status}`);
  }

  return data;
}

async function fetchGithubRawText(url: string, token?: string): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': 'vii-ink-admin'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(message ? `GitHub Raw ${res.status}: ${message}` : `GitHub Raw ${res.status}`);
  }

  return res.text();
}

export async function fetchSourceMarkdownFiles(
  token: string | undefined,
  repo: SourceRepoConfig,
  collection: Collection,
  options: SourceMarkdownBatchOptions = {}
): Promise<SourceMarkdownBatch> {
  const ref = repo.ref?.trim() || 'main';
  const owner = repo.owner?.trim();
  const repoName = repo.repo?.trim();
  if (!owner || !repoName) {
    throw new Error('主站 GitHub 仓库配置不完整');
  }
  const cursor = Math.max(0, Math.floor(options.cursor ?? 0));
  const limit = Math.max(1, Math.min(20, Math.floor(options.limit ?? 12)));
  const root = `src/content/${collection}/`;
  const treeUrl = `https://api.github.com/repos/${owner}/${repoName}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const tree = await fetchGithubJson<GitTreeResponse>(treeUrl, token);

  if (!Array.isArray(tree.tree)) {
    throw new Error('GitHub 返回的文件树为空');
  }

  if (tree.truncated) {
    throw new Error('主站仓库文件树过大，GitHub 返回结果被截断，无法安全同步');
  }

  const markdownItems = tree.tree
    .filter((item): item is Required<Pick<GitTreeItem, 'path' | 'sha'>> & GitTreeItem => {
      const itemPath = item.path ?? '';
      return item.type === 'blob' && itemPath.startsWith(root) && itemPath.endsWith('.md') && Boolean(item.sha);
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const files: SourceMarkdownFile[] = [];
  const selectedItems = markdownItems.slice(cursor, cursor + limit);
  for (const item of selectedItems) {
    const relativePath = trimSlash(item.path.slice(root.length));
    const slug = relativePath.replace(/\.md$/i, '');
    if (!slug || slug.split('/').some((part) => part === '..')) continue;

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repoName}/${encodeURIComponent(ref)}/${item.path
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`;
    const markdown = await fetchGithubRawText(rawUrl, token);

    files.push({
      collection,
      slug,
      path: item.path,
      sha: item.sha,
      size: item.size ?? 0,
      markdown
    });
  }

  const nextCursor = cursor + selectedItems.length;
  return {
    files,
    total: markdownItems.length,
    nextCursor: nextCursor < markdownItems.length ? nextCursor : undefined
  };
}
