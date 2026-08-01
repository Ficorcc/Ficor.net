<!--
  分段选择控件（浮雕风格，复刻 .admin-segmented）
-->
<script lang="ts">
  interface Option {
    label: string;
    value: string;
  }

  interface Props {
    options: Option[];
    value: string;
    onchange?: (value: string) => void;
  }

  let { options, value = $bindable(), onchange }: Props = $props();

  function select(v: string) {
    value = v;
    onchange?.(v);
  }
</script>

<div class="segmented" role="tablist">
  {#each options as opt (opt.value)}
    <button
      class="segmented__option"
      role="tab"
      aria-pressed={value === opt.value}
      onclick={() => select(opt.value)}
    >
      {opt.label}
    </button>
  {/each}
</div>
