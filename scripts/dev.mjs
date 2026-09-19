// ============================================================================
// 开发启动器：Astro dev + 后台内容监听
//
// 让「本地开发」和「部署后的站点」跑在同一套数据逻辑上：
//   后台保存文章 → R2（本地为模拟存储）→ 监听器自动同步 → src/content → 前端热更新
//
// 用法：
//   npm run dev                 # 等价于 node ./scripts/dev.mjs
//   npm run dev -- --port 4322  # 额外参数透传给 astro dev
//   npm run dev:astro           # 只要 Astro，不启动监听
//
// 单独启动监听：npm run content:watch
// ============================================================================

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// 先合并 .env，再启动子进程 —— 这样 astro dev 与监听器都能看到同样的变量
// （SITE_URL / ADMIN_URL / ADMIN_R2_* 等）。
loadEnvFile({ cwd: projectRoot });

const astroBin = path.join(projectRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');
const watchScript = path.join(__dirname, 'watch-admin-content.mjs');

const forwardedArgs = process.argv.slice(2);
const children = [];
let shuttingDown = false;

/** 按行转发子进程输出，避免多进程日志交错成一行 */
function pipeLines(stream, write) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) write(line);
  });
  stream.on('end', () => {
    if (buffer) write(buffer);
  });
}

function start(label, args, options = {}) {
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    ...options
  });

  const prefix = `[${label}]`;
  pipeLines(child.stdout, (line) => console.log(`${prefix} ${line}`));
  pipeLines(child.stderr, (line) => console.warn(`${prefix} ${line}`));

  child.on('error', (error) => {
    console.error(`${prefix} 启动失败：${error.message}`);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {}
    }
  }

  setTimeout(() => process.exit(code), 150).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}

// ---- 1. 内容监听（失败不影响 Astro 启动）----
const watcher = start('content', [watchScript]);

watcher.on('close', (code) => {
  if (!shuttingDown && code !== 0) {
    console.warn(`[content] 监听进程已退出（退出码 ${code}），Astro 继续运行。`);
    console.warn('[content] 可单独执行 `npm run content:watch` 重试。');
  }
});

// ---- 2. Astro 开发服务器 ----
const astro = start('astro', [astroBin, 'dev', ...forwardedArgs]);

astro.on('close', (code) => {
  shutdown(code ?? 0);
});
