<!--
  分页控件
-->
<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';

  interface Props {
    current: number;
    total: number;
    pageSize: number;
    hrefPrefix: string; // 如 "/content/essay"
  }

  let { current, total, pageSize, hrefPrefix }: Props = $props();

  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  // 生成页码窗口：当前页前后各 2 页，首尾各 1 页
  const pages = $derived.by(() => {
    const t = totalPages;
    const c = current;
    const result: (number | '...')[] = [];
    if (t <= 7) {
      for (let i = 1; i <= t; i++) result.push(i);
      return result;
    }
    result.push(1);
    if (c > 3) result.push('...');
    const start = Math.max(2, c - 1);
    const end = Math.min(t - 1, c + 1);
    for (let i = start; i <= end; i++) result.push(i);
    if (c < t - 2) result.push('...');
    result.push(t);
    return result;
  });

  function href(pageNum: number): string {
    const search = new URLSearchParams(page.url.searchParams);
    search.set('page', String(pageNum));
    return `${base}${hrefPrefix}?${search.toString()}`;
  }
</script>

{#if totalPages > 1}
  <nav class="pagination" aria-label="分页">
    <a
      class="pagination__btn"
      href={href(current - 1)}
      aria-label="上一页"
      aria-disabled={current <= 1}
      class:hidden={current <= 1}
    >
      ‹
    </a>
    {#each pages as p (p)}
      {#if p === '...'}
        <span class="pagination__ellipsis">…</span>
      {:else}
        <a
          class="pagination__btn"
          href={href(p)}
          aria-current={p === current ? 'page' : undefined}
        >
          {p}
        </a>
      {/if}
    {/each}
    <a
      class="pagination__btn"
      href={href(current + 1)}
      aria-label="下一页"
      aria-disabled={current >= totalPages}
      class:hidden={current >= totalPages}
    >
      ›
    </a>
  </nav>
{/if}

<style>
  .pagination__ellipsis {
    display: inline-flex;
    align-items: center;
    padding: 0 4px;
    color: var(--faint);
  }
</style>
