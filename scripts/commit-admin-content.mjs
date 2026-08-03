// ============================================================================
// 构建后回写：把 R2 同步下来的内容提交并推回 GitHub 仓库
//
// 在 sync-admin-r2-content.mjs 之后运行。Pages 构建环境是干净克隆，
// 因此 src/content、src/data、src/config 下的任何 diff 都来自 R2 同步。
//
// 需要 Pages 环境变量：
//   GITHUB_CONTENT_PUSH_TOKEN  GitHub fine-grained PAT（Contents: Read and write）
//   GITHUB_CONTENT_REPO        可选，默认 Ficorcc/Ficor.net
//
// 未配置 token 时静默跳过（本地开发/CI 不受影响）。
// 推送失败不会让构建失败（内容仍在 R2，下次构建会重试）。
// ============================================================================

import { execFileSync } from 'node:child_process';

const env = process.env;
const token = env.GITHUB_CONTENT_PUSH_TOKEN ?? '';
const repo = env.GITHUB_CONTENT_REPO ?? 'Ficorcc/Ficor.net';
// Pages 构建会注入 CF_PAGES_BRANCH；本地/其他环境回退到 main
const branch = env.CF_PAGES_BRANCH || env.GITHUB_BRANCH || 'main';
const watchPaths = ['src/content', 'src/data', 'src/config'];

if (!token.trim()) {
  console.log('[content-push] Skip; GITHUB_CONTENT_PUSH_TOKEN not set');
  process.exit(0);
}

const sanitize = (value) => String(value).split(token).join('***');

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (allowFail) return '';
    const detail = sanitize(e.stderr || e.stdout || e.message);
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

// 1. 检查同步后是否有内容变化
const status = git(['status', '--porcelain', '--', ...watchPaths]);
if (!status.trim()) {
  console.log('[content-push] No content changes; nothing to commit');
  process.exit(0);
}

// 2. 提交
git(['config', 'user.name', 'vii-ink-bot']);
git(['config', 'user.email', 'vii-ink-bot@users.noreply.github.com']);
git(['add', '--', ...watchPaths]);

const date = new Date().toISOString().slice(0, 10);
git(['commit', '-m', `chore: sync content from admin R2 (${date})`]);
console.log(`[content-push] Committed changes:\n${status.trim()}`);

// 3. 推送（失败时 rebase 后重试一次；仍失败则放弃，不影响构建）
const pushUrl = `https://x-access-token:${token}@github.com/${repo}.git`;

function tryPush() {
  try {
    git(['push', pushUrl, `HEAD:${branch}`]);
    return true;
  } catch (e) {
    console.warn(`[content-push] ${sanitize(e.message)}`);
    return false;
  }
}

if (tryPush()) {
  console.log(`[content-push] Pushed to ${repo}@${branch}`);
  process.exit(0);
}

console.log('[content-push] Retry after rebase...');
git(['fetch', pushUrl, branch], { allowFail: true });
git(['rebase', 'FETCH_HEAD'], { allowFail: true });

if (tryPush()) {
  console.log(`[content-push] Pushed to ${repo}@${branch} (after rebase)`);
} else {
  console.warn('[content-push] Push failed; content remains in R2 and will retry on next build');
}
process.exit(0);
