// ============================================================================
// 极简 .env 加载器
//
// 为什么需要它：本目录下的脚本都是 `node ./scripts/xxx.mjs` 直接跑的纯 Node
// 脚本，只读 `process.env`。Node 本身不会加载 `.env`（除非用 --env-file 启动），
// 所以没有这一层的话，根目录放 `.env` 是完全没有效果的。
//
// 设计取舍：
//   · 只在文件存在时生效，且**绝不覆盖已存在的环境变量** ——
//     这样 Cloudflare Pages / CI 里注入的真实变量永远优先，
//     干净克隆里没有 `.env`，加载器就是一次 existsSync，零副作用。
//   · 不做变量插值、不处理 `\n` 转义，只去成对引号。够用即可，
//     需要复杂语义请直接在 shell 里 export。
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_FILE = '.env';

/**
 * 读取并合并 .env 到环境变量中。
 *
 * @param {{ cwd?: string; file?: string; env?: Record<string, string | undefined> }} [options]
 * @returns {{ loaded: boolean; path: string; applied: string[]; skipped: string[] }}
 */
export function loadEnvFile(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const file = options.file ?? DEFAULT_FILE;
  const env = options.env ?? process.env;
  const target = path.resolve(cwd, file);

  if (!existsSync(target)) {
    return { loaded: false, path: target, applied: [], skipped: [] };
  }

  let raw;
  try {
    raw = readFileSync(target, 'utf8');
  } catch {
    return { loaded: false, path: target, applied: [], skipped: [] };
  }

  const applied = [];
  const skipped = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // 兼容 `export FOO=bar` 写法
    const body = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
    const separator = body.indexOf('=');
    if (separator <= 0) continue;

    const key = body.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = body.slice(separator + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    }

    // 真实环境变量优先：Pages / CI 注入的值不会被本地文件盖掉
    if (String(env[key] ?? '').length > 0) {
      skipped.push(key);
      continue;
    }

    env[key] = value;
    applied.push(key);
  }

  return { loaded: true, path: target, applied, skipped };
}
