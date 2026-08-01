<!--
  定时任务管理
-->
<script lang="ts">
  import { toast } from '$lib/stores/toast';
  import { api } from '$lib/utils/api';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { formatDateTime, relativeTime, toDatetimeLocal } from '$lib/utils/date';

  let { data } = $props();

  let showCreate = $state(false);
  let cancelTarget = $state<string | null>(null);
  let showCancelModal = $state(false);

  // 新建表单
  let newCollection = $state('essay');
  let newSlug = $state('');
  let newScheduledAt = $state(toDatetimeLocal(new Date(Date.now() + 3600_000))); // 默认 1 小时后

  const collectionOptions = [
    { label: '随笔', value: 'essay' },
    { label: '絮语', value: 'bits' },
    { label: '小记', value: 'memo' }
  ];

  const statusBadge: Record<string, { label: string; cls: string }> = {
    pending: { label: '待发布', cls: 'badge--warn' },
    running: { label: '进行中', cls: 'badge--info' },
    done: { label: '已完成', cls: 'badge--ok' },
    failed: { label: '失败', cls: 'badge--danger' },
    cancelled: { label: '已取消', cls: '' }
  };

  async function handleCreate() {
    if (!newSlug.trim()) {
      toast.error('请填写文章 slug');
      return;
    }
    if (!newScheduledAt) {
      toast.error('请选择发布时间');
      return;
    }
    const result = await api('SCHEDULE_CREATE', {
      collection: newCollection,
      slug: newSlug.trim(),
      scheduledAt: new Date(newScheduledAt).toISOString()
    });
    if (result.ok) {
      toast.ok('定时任务已创建');
      showCreate = false;
      newSlug = '';
      setTimeout(() => location.reload(), 500);
    } else {
      toast.error(result.error ?? '创建失败');
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    const result = await api('SCHEDULE_CANCEL', { id: cancelTarget });
    if (result.ok) {
      toast.ok('任务已取消');
      setTimeout(() => location.reload(), 500);
    } else {
      toast.error(result.error ?? '取消失败');
    }
    cancelTarget = null;
    showCancelModal = false;
  }
</script>

<svelte:head>
  <title>定时任务 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="page-header__title">定时任务</h1>
      <p class="page-header__sub">{data.items.length} 个任务 · 每 15 分钟检查一次</p>
    </div>
    <button class="btn btn--primary" onclick={() => (showCreate = true)}>
      <Icon name="plus" size={16} /> 新建任务
    </button>
  </div>
</div>

{#if data.error}
  <div class="panel">
    <div class="empty-state">
      <div class="empty-state__title">加载失败</div>
      <p class="text-sm">{data.error}</p>
    </div>
  </div>
{:else if data.items.length === 0}
  <div class="panel">
    <div class="empty-state">
      <Icon name="schedules" size={32} />
      <div class="empty-state__title mt-4">还没有定时任务</div>
      <p class="text-sm mt-2">创建任务后，到期的文章会自动触发主站部署</p>
    </div>
  </div>
{:else}
  <div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th>文章</th>
          <th>计划时间</th>
          <th>状态</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {#each data.items as schedule (schedule.id)}
          {@const badge = statusBadge[schedule.status] ?? { label: schedule.status, cls: '' }}
          <tr>
            <td>
              <span class="font-mono text-sm">{schedule.collection}/{schedule.slug}</span>
            </td>
            <td>
              <div>{formatDateTime(schedule.scheduled_at)}</div>
              {#if schedule.status === 'pending'}
                <div class="text-xs text-faint">{relativeTime(schedule.scheduled_at)}发布</div>
              {/if}
            </td>
            <td>
              <span class="badge {badge.cls}">{badge.label}</span>
              {#if schedule.error}
                <div class="text-xs text-accent mt-1">{schedule.error}</div>
              {/if}
            </td>
            <td class="text-xs text-faint font-mono">{formatDateTime(schedule.created_at)}</td>
            <td>
              {#if schedule.status === 'pending'}
                <button class="btn btn--sm btn--danger" onclick={() => {
                  cancelTarget = schedule.id;
                  showCancelModal = true;
                }}>
                  取消
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<!-- 新建任务模态框 -->
<Modal bind:open={showCreate} title="新建定时任务" confirmText="创建" onConfirm={handleCreate}>
  <div class="flex flex-col gap-3">
    <div class="field">
      <label class="field__label">内容类型</label>
      <select bind:value={newCollection}>
        <option value="essay">随笔</option>
        <option value="bits">絮语</option>
        <option value="memo">小记</option>
      </select>
    </div>
    <div class="field">
      <label class="field__label">文章 Slug</label>
      <input type="text" bind:value={newSlug} placeholder="如 hello-world" />
      <div class="field__hint">对应 R2 中的 content/{newCollection}/&lt;slug&gt;.md</div>
    </div>
    <div class="field">
      <label class="field__label">发布时间</label>
      <input type="datetime-local" bind:value={newScheduledAt} />
      <div class="field__hint">cron 每 15 分钟检查一次，实际触发可能有最多 15 分钟偏差</div>
    </div>
  </div>
</Modal>

<!-- 取消确认 -->
<Modal bind:open={showCancelModal} title="确认取消" confirmText="取消任务" danger onConfirm={confirmCancel}>
  <p class="text-sm">确定要取消这个定时任务吗？</p>
</Modal>
