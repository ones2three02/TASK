<script setup lang="ts">
import { X, HelpCircle } from "@lucide/vue";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", val: boolean): void;
}>();

function close() {
  emit("update:open", false);
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200" @click.self="close">
    <div class="w-full max-w-[480px] rounded-3xl border border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 shadow-2xl flex flex-col gap-4 relative animate-in zoom-in-95 duration-200">
      <!-- Close button -->
      <button class="absolute top-5 right-5 h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer transition-colors active:scale-95" @click="close">
        <X class="h-4.5 w-4.5" />
      </button>

      <!-- Header -->
      <div class="flex items-center gap-3 select-none">
        <div class="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800/85 flex items-center justify-center">
          <HelpCircle class="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
        </div>
        <div>
          <h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100">键盘快捷键指南</h3>
          <p class="text-[11px] text-muted-foreground mt-0.5">Keyboard Shortcuts Guide</p>
        </div>
      </div>

      <div class="border-b border-zinc-150 dark:border-zinc-800/60 my-1"></div>

      <!-- Shortcuts list -->
      <div class="flex flex-col gap-3.5 py-2 text-zinc-800 dark:text-zinc-200 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-medium">唤起全局极速命令面板</span>
          <div class="flex gap-1 items-center">
            <kbd class="px-2 py-1 rounded bg-muted border font-mono text-[10px] shadow-sm">Cmd</kbd>
            <span class="text-muted-foreground">+</span>
            <kbd class="px-2 py-1 rounded bg-muted border font-mono text-[10px] shadow-sm">K</kbd>
            <span class="text-muted-foreground/60 text-[10px] mx-1">或</span>
            <kbd class="px-2 py-1 rounded bg-muted border font-mono text-[10px] shadow-sm">Ctrl</kbd>
            <span class="text-muted-foreground">+</span>
            <kbd class="px-2 py-1 rounded bg-muted border font-mono text-[10px] shadow-sm">K</kbd>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <span class="font-medium">查看本快捷键指南</span>
          <kbd class="px-2 py-1 rounded bg-muted border font-mono text-[10px] shadow-sm">?</kbd>
        </div>

        <div class="flex items-center justify-between">
          <span class="font-medium">快速切换系统 Tab</span>
          <div class="flex gap-1 items-center">
            <kbd class="px-2 py-1 rounded bg-muted border font-mono text-[10px] shadow-sm">Cmd</kbd>
            <span class="text-muted-foreground">+</span>
            <kbd class="px-2 py-1 rounded bg-muted border font-mono text-[10px] shadow-sm">1 ~ 6</kbd>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <span class="font-medium">关闭当前抽屉、面板或弹窗</span>
          <kbd class="px-2 py-1 rounded bg-muted border font-mono text-[10px] shadow-sm">Esc</kbd>
        </div>

        <div class="flex items-center justify-between">
          <span class="font-medium">一键标记任务完成 (今日聚焦模式下)</span>
          <span class="text-muted-foreground text-[10px] bg-muted/30 px-2.5 py-1 rounded border border-border/40">点击卡片左侧圆圈</span>
        </div>
      </div>

      <div class="border-t border-zinc-150 dark:border-zinc-800/60 my-1"></div>

      <!-- Footer action button -->
      <div class="flex justify-end pt-1">
        <button class="h-9 inline-flex items-center justify-center rounded-xl bg-zinc-950 dark:bg-zinc-50 hover:bg-zinc-900 dark:hover:bg-zinc-200 px-5 text-xs font-bold text-white dark:text-zinc-950 transition-all active:scale-[0.97] cursor-pointer" @click="close">我知道了</button>
      </div>
    </div>
  </div>
</template>
