<!--
  登录页
-->
<script lang="ts">
  import { base } from '$app/paths';
  import { enhance } from '$app/forms';
  import { toast } from '$lib/stores/toast';

  let { form } = $props();
  let loading = $state(false);

  // 用 enhance 提交表单，自动适配 +page.server.ts 的 form action
  const handleSubmit = async ({ cancel }: SubmitEvent) => {
    loading = true;
    // 不阻止默认提交，让 enhance 接管（发送 form-data，与 action 的 formData() 匹配）
    return async ({ result, update }) => {
      loading = false;
      if (result.type === 'redirect') {
        // 登录成功，SvelteKit 会自动跳转
        toast.ok('登录成功');
      } else if (result.type === 'failure') {
        // 后端返回 fail()，result.data 里有 message
        const msg = (result.data as { message?: string })?.message ?? '登录失败';
        toast.error(msg);
      }
      await update({ reset: false });
    };
  };
</script>

<svelte:head>
  <title>登录 · 柒色墨笺后台</title>
</svelte:head>

<div class="login-page">
  <div class="login-card">
    <div class="login-card__brand">
      <div class="login-card__seal">墨</div>
      <h1 class="login-card__title">柒色墨笺</h1>
      <p class="login-card__sub">管理后台 · ADMIN</p>
    </div>

    <form class="login-form" method="POST" use:enhance={handleSubmit}>
      <div class="field">
        <label class="field__label" for="password">管理密码</label>
        <input
          id="password"
          name="password"
          type="password"
          value={form?.password ?? ''}
          placeholder="请输入管理密码"
          autocomplete="current-password"
          autofocus
          disabled={loading}
        />
      </div>

      {#if form?.message}
        <div class="login-error">{form.message}</div>
      {/if}

      <button class="btn btn--primary btn--block" type="submit" disabled={loading}>
        {#if loading}
          <span class="spinner"></span>
          登录中...
        {:else}
          登录
        {/if}
      </button>
    </form>

    <div class="login-card__footer">
      <a href="https://vii.ink" target="_blank" rel="noopener" class="login-card__link">
        ← 返回主站
      </a>
    </div>
  </div>
</div>

<style>
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: linear-gradient(
      135deg,
      var(--bg) 0%,
      var(--panel-2) 100%
    );
  }

  .login-card {
    width: 100%;
    max-width: 360px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-soft);
    padding: 36px 32px;
  }

  .login-card__brand {
    text-align: center;
    margin-bottom: 28px;
  }

  .login-card__seal {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: var(--radius-lg);
    background: var(--accent);
    color: #fff;
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 600;
    margin-bottom: 14px;
  }

  .login-card__title {
    font-family: var(--font-serif);
    font-size: 22px;
    font-weight: 600;
  }

  .login-card__sub {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--faint);
    margin-top: 4px;
    letter-spacing: 1px;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .login-error {
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    background: var(--danger-bg);
    color: var(--danger);
    font-family: var(--font-kai);
    font-size: 13px;
    border-left: 3px solid var(--danger);
  }

  .login-card__footer {
    text-align: center;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }

  .login-card__link {
    font-family: var(--font-kai);
    font-size: 13px;
    color: var(--muted);
  }

  .login-card__link:hover {
    color: var(--accent);
  }
</style>
