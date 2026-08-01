// See https://svelte.dev/docs/kit/types#app.d.ts
// 用于与 Cloudflare Workers 平台交互的类型声明

declare global {
  namespace App {
    // interface Error {}
    // interface PageData {}

    /** 从 fetch hook 的 event.locals 传递的数据 */
    interface Locals {
      /** 当前已认证的会话（未登录时为 null） */
      session: SessionData | null;
      /** 客户端 IP（从 CF-Connecting-IP 提取） */
      ip: string;
      /** 当前请求是否通过了 CSRF 校验 */
      csrfValid: boolean;
    }

    /** 平台绑定：由 adapter-cloudflare 注入
     *  env 包含 wrangler.toml 里的 D1/R2/AI 绑定和 vars/secrets
     *  context 提供 waitUntil / cf 等运行时上下文
     */
    interface Platform {
      env: {
        DB: D1Database;
        R2: R2Bucket;
        AI: Ai;
        PUBLIC_ORIGINS?: string;
        SESSION_MAX_AGE_DAYS?: string;
        RATE_LIMIT_MAX?: string;
        RATE_LIMIT_WINDOW?: string;
        BACKUP_RETENTION_DAYS?: string;
        ADMIN_PASSWORD?: string;
        GITHUB_TOKEN?: string;
        GITHUB_OWNER?: string;
        GITHUB_REPO?: string;
        GITHUB_WORKFLOW?: string;
        GITHUB_REF?: string;
        MEMOS_API_URL?: string;
        MEMOS_ACCESS_TOKEN?: string;
        MEMOS_FILTER?: string;
        WALINE_TOKEN?: string;
      };
      context: {
        waitUntil(promise: Promise<unknown>): void;
      };
      cf?: Record<string, unknown>;
      caches?: CacheStorage;
    }
  }
}

export interface SessionData {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export {};
