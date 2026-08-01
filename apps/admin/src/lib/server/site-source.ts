import { createRepos } from './db';
import { resolveDeployConfig, type DeployConfig } from './deploy/github';

export interface SourceSiteDataEnv {
  DB?: D1Database;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_WORKFLOW?: string;
  GITHUB_REF?: string;
}

const headers = (token?: string) => {
  const value: Record<string, string> = {
    Accept: 'text/plain, application/json',
    'User-Agent': 'vii-ink-admin'
  };
  if (token) value.Authorization = `Bearer ${token}`;
  return value;
};

async function getDeployConfig(env: SourceSiteDataEnv): Promise<DeployConfig> {
  if (!env.DB) return resolveDeployConfig(null, env);

  try {
    const repos = createRepos(env.DB);
    const deployConfig = await repos.config.get<Partial<DeployConfig>>('deploy');
    return resolveDeployConfig(deployConfig, env);
  } catch {
    return resolveDeployConfig(null, env);
  }
}

async function fetchSourceText(env: SourceSiteDataEnv, path: string): Promise<string | null> {
  const config = await getDeployConfig(env);
  const ref = config.ref || 'main';
  const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${encodeURIComponent(ref)}/${path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;

  const res = await fetch(rawUrl, { headers: headers(env.GITHUB_TOKEN) });
  if (!res.ok) return null;
  return res.text();
}

function parseLiteral(text: string): unknown {
  const jsonLike = text
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(jsonLike);
}

function extractAssignedLiteral(source: string, name: string): string | null {
  const marker = new RegExp(`export\\s+const\\s+${name}(?:\\s*:[^=]+)?\\s*=\\s*`);
  const match = marker.exec(source);
  if (!match) return null;

  let index = match.index + match[0].length;
  while (/\s/.test(source[index] ?? '')) index += 1;

  const opener = source[index];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : '';
  if (!closer) return null;

  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let i = index; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;
    if (depth === 0) return source.slice(index, i + 1);
  }
  return null;
}

export async function fetchSourceLinks(env: SourceSiteDataEnv): Promise<Record<string, unknown> | null> {
  const source = await fetchSourceText(env, 'src/data/links.ts');
  if (!source) return null;

  const siteInfoLiteral = extractAssignedLiteral(source, 'siteInfo');
  const linksLiteral = extractAssignedLiteral(source, 'links');
  const siteInfo = siteInfoLiteral ? parseLiteral(siteInfoLiteral) : {};
  const links = linksLiteral ? parseLiteral(linksLiteral) : [];

  return {
    siteInfo,
    links: Array.isArray(links) ? links : []
  };
}

export async function fetchSourceFeed(env: SourceSiteDataEnv): Promise<Record<string, unknown> | null> {
  const source = await fetchSourceText(env, 'src/config/feed.json');
  if (!source?.trim()) return null;
  return JSON.parse(source) as Record<string, unknown>;
}
