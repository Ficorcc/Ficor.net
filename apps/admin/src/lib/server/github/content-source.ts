import type { Collection } from '$lib/utils/content-schema';

export interface SourceRepoConfig {
  owner: string;
  repo: string;
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

interface GitBlobResponse {
  content?: string;
  encoding?: string;
  message?: string;
}

const githubHeaders = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'vii-ink-admin'
});

const trimSlash = (value: string) => value.replace(/^\/+|\/+$/g, '');

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function fetchGithubJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: githubHeaders(token) });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };

  if (!res.ok) {
    throw new Error(data.message ? `GitHub API ${res.status}: ${data.message}` : `GitHub API ${res.status}`);
  }

  return data;
}

export async function fetchSourceMarkdownFiles(
  token: string,
  repo: SourceRepoConfig,
  collection: Collection
): Promise<SourceMarkdownFile[]> {
  const ref = repo.ref?.trim() || 'main';
  const root = `src/content/${collection}/`;
  const treeUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const tree = await fetchGithubJson<GitTreeResponse>(treeUrl, token);

  if (!Array.isArray(tree.tree)) {
    throw new Error('GitHub 返回的文件树为空');
  }

  if (tree.truncated) {
    throw new Error('主站仓库文件树过大，GitHub 返回结果被截断，无法安全同步');
  }

  const markdownItems = tree.tree.filter((item): item is Required<Pick<GitTreeItem, 'path' | 'sha'>> & GitTreeItem => {
    const itemPath = item.path ?? '';
    return item.type === 'blob' && itemPath.startsWith(root) && itemPath.endsWith('.md') && Boolean(item.sha);
  });

  const files: SourceMarkdownFile[] = [];
  for (const item of markdownItems) {
    const relativePath = trimSlash(item.path.slice(root.length));
    const slug = relativePath.replace(/\.md$/i, '');
    if (!slug || slug.split('/').some((part) => part === '..')) continue;

    const blobUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/blobs/${item.sha}`;
    const blob = await fetchGithubJson<GitBlobResponse>(blobUrl, token);
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
      throw new Error(`无法读取主站文件：${item.path}`);
    }

    files.push({
      collection,
      slug,
      path: item.path,
      sha: item.sha,
      size: item.size ?? 0,
      markdown: decodeBase64Utf8(blob.content)
    });
  }

  return files;
}
