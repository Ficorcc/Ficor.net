// ============================================================================
// GitHub Actions 部署触发
// 通过 workflow_dispatch API 触发主站仓库的部署工作流
// ============================================================================

export interface DeployConfig {
  owner: string;
  repo: string;
  workflow: string; // workflow 文件名，如 deploy.yml
  ref?: string; // 分支，默认 main
}

export interface DeployResult {
  ok: boolean;
  message: string;
  workflowRunUrl?: string;
}

/**
 * 触发 GitHub Actions workflow。
 * 需要 token 有 repo + workflow 权限。
 */
export async function triggerDeploy(
  token: string,
  config: DeployConfig,
  payload?: Record<string, unknown>
): Promise<DeployResult> {
  const ref = config.ref ?? 'main';
  const workflowFile = config.workflow.startsWith('.github/')
    ? config.workflow
    : `.github/workflows/${config.workflow}`;

  // workflow_dispatch 端点
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${workflowFile}/dispatches`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'vii-ink-admin'
      },
      body: JSON.stringify({
        ref,
        inputs: payload ?? {}
      })
    });

    if (res.status === 204) {
      // workflow_dispatch 成功返回 204 No Content
      return {
        ok: true,
        message: '部署已触发',
        workflowRunUrl: `https://github.com/${config.owner}/${config.repo}/actions`
      };
    }

    if (res.status === 401 || res.status === 403) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return {
        ok: false,
        message: `GitHub Token 权限不足: ${err.message ?? res.statusText}`
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        message: `未找到 workflow 文件：${config.workflow}（确认仓库 ${config.owner}/${config.repo} 中存在此文件）`
      };
    }

    if (res.status === 422) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      return {
        ok: false,
        message: `触发失败: ${err.message ?? 'workflow 可能未启用 workflow_dispatch'}`
      };
    }

    const errText = await res.text();
    return {
      ok: false,
      message: `GitHub API 返回 ${res.status}: ${errText}`
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : '网络请求失败'
    };
  }
}

/**
 * 检查 GitHub Token 是否有效（获取用户信息）。
 */
export async function verifyGithubToken(token: string): Promise<{ ok: boolean; login?: string; message?: string }> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'vii-ink-admin'
      }
    });
    if (res.ok) {
      const data = (await res.json()) as { login?: string };
      return { ok: true, login: data.login };
    }
    return { ok: false, message: `Token 无效（${res.status}）` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '请求失败' };
  }
}
