// ============================================================================
// Cloudflare Pages 部署触发
// 直接调用 Pages 部署钩子（Deploy Hook）触发主站重建，
// 不经过 GitHub Actions，链路更短、状态更可控。
// ============================================================================

import type { DeployResult } from './github';

/**
 * 调用 Cloudflare Pages Deploy Hook。
 * 钩子 URL 在 Pages 项目 → Settings → Builds & deployments → Deploy hooks 创建，
 * 通过 `wrangler secret put CLOUDFLARE_DEPLOY_HOOK` 配置到 admin Worker。
 */
export async function triggerPagesDeploy(hookUrl: string): Promise<DeployResult> {
  try {
    const res = await fetch(hookUrl, { method: 'POST' });

    if (res.ok) {
      return {
        ok: true,
        message: '已触发 Cloudflare Pages 重建，几分钟后生效'
      };
    }

    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      message: `Pages 部署钩子返回 ${res.status}: ${errText || res.statusText}`
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : '网络请求失败'
    };
  }
}
