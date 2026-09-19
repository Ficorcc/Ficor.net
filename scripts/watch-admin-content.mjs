// ============================================================================
// 开发时内容监听：后台保存 → 自动同步到仓库 → 前端热更新
//
// 轮询内容源（本地模拟 R2 或远端 R2）的对象清单，一旦发现新增/修改/删除，
// 就调用与生产构建完全相同的同步脚本，把内容与数据写进 src/content、src/data、
// src/config —— 所以后台改一篇文章或一条友链，前端几秒内就会热更新。
//
// 覆盖行为与生产一致（冲突策略默认 overwrite，R2 是唯一真源）：
// 同步脚本会把被覆盖的仓库文件逐个打印出来，手改过的内容不会被悄悄冲掉。
// 想先人工确认，用 ADMIN_WATCH_SYNC_ARGS=--on-conflict=skip 或 --dry-run。
//
// 用法：
//   node ./scripts/watch-admin-content.mjs
//   ADMIN_WATCH_INTERVAL=3000 node ./scripts/watch-admin-content.mjs
//
// 环境变量：
//   ADMIN_WATCH_INTERVAL  轮询间隔毫秒，默认 2000
//   ADMIN_WATCH_SYNC_ARGS 透传给同步脚本的额外参数（空格分隔）
// ============================================================================

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/load-env.mjs';
import { resolveContentSource } from './lib/r2-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const syncScript = path.join(__dirname, 'sync-admin-r2-content.mjs');

loadEnvFile();

const env = process.env;
const pollMs = Math.max(500, Number(env.ADMIN_WATCH_INTERVAL ?? 2000) || 2000);
const settleMs = 250;
const settleMaxMs = 3000;

const contentPrefix = (env.ADMIN_R2_PREFIX ?? 'content/').replace(/^\/+/, '');
const settingsPrefix = (env.ADMIN_R2_SETTINGS_PREFIX ?? 'settings/').replace(/^\/+/, '');
const dataPrefix = (env.ADMIN_R2_DATA_PREFIX ?? 'data/').replace(/^\/+/, '');
const watchPrefixes = [...new Set([contentPrefix, settingsPrefix, dataPrefix, 'deleted/content/'])];

const extraArgs = (env.ADMIN_WATCH_SYNC_ARGS ?? '').trim().split(/\s+/).filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stamp = () => new Date().toTimeString().slice(0, 8);
const log = (message) => console.log(`[watch ${stamp()}] ${message}`);

/** 计算内容源指纹：任一对象的新增/删除/大小变化都会改变它 */
async function computeSignature(source) {
  const parts = [];
  for (const prefix of watchPrefixes) {
    for (const entry of await source.listEntries(prefix)) {
      parts.push(`${entry.key}\u0000${entry.size}\u0000${entry.etag}`);
    }
  }
  return parts.join('\u0001');
}

let syncing = false;
let pendingSync = false;

async function runSync(reason) {
  if (syncing) {
    pendingSync = true;
    return;
  }
  syncing = true;

  log(`检测到变化（${reason}），开始同步…`);

  await new Promise((resolve) => {
    const child = spawn(process.execPath, [syncScript, ...extraArgs], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const pipe = (stream, write) => {
      let buffer = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) write(line);
      });
      stream.on('end', () => {
        if (buffer.trim()) write(buffer);
      });
    };

    pipe(child.stdout, (line) => console.log(`  ${line}`));
    pipe(child.stderr, (line) => console.warn(`  ${line}`));

    child.on('error', (error) => {
      console.error(`[watch] 同步进程启动失败：${error.message}`);
    });
    child.on('close', (code) => {
      if (code !== 0) console.warn(`[watch] 同步进程退出码 ${code}`);
      resolve();
    });
  });

  syncing = false;
  if (pendingSync) {
    pendingSync = false;
    await runSync('同步期间又有新变化');
  }
}

// ---- 主循环 ----
let source = null;
let lastSignature = null;
let waitingLogged = false;

log(`监听内容源变化，轮询间隔 ${pollMs}ms，前缀：${watchPrefixes.join(', ')}`);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  log('已停止监听。');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

while (!stopping) {
  try {
    if (!source) {
      const resolved = await resolveContentSource({ env });
      if (!resolved.source) {
        if (!waitingLogged) {
          log(`暂未找到内容源，${Math.round(pollMs / 1000)}s 后重试 —— ${resolved.reason}`);
          waitingLogged = true;
        }
        await sleep(pollMs);
        continue;
      }
      source = resolved.source;
      waitingLogged = false;
      log(`已连接内容源：${source.label}`);
    }

    let signature;
    try {
      signature = await computeSignature(source);
    } catch (error) {
      log(`读取内容源失败，稍后重试：${error.message}`);
      source = null;
      lastSignature = null;
      await sleep(pollMs);
      continue;
    }

    if (lastSignature === null) {
      lastSignature = signature;
      await runSync('启动时的首次同步');
    } else if (signature !== lastSignature) {
      // 等写入稳定下来再同步，避免读到写了一半的文件
      let settled = signature;
      let waited = 0;
      while (waited < settleMaxMs) {
        await sleep(settleMs);
        waited += settleMs;
        const next = await computeSignature(source).catch(() => settled);
        if (next === settled) break;
        settled = next;
      }

      lastSignature = settled;
      await runSync('内容源发生变化');
    }
  } catch (error) {
    log(`监听循环异常：${error?.message ?? error}`);
    source = null;
    await sleep(pollMs);
  }

  await sleep(pollMs);
}
