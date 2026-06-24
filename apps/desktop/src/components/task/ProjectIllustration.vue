<script setup lang="ts">
import { computed } from "vue";
import { useTaskStore } from "@/stores/taskStore";
import { Image as ImageIcon, Sparkles, Pencil } from "@lucide/vue";

const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  manage: [];
}>();

const taskStore = useTaskStore();
const project = computed(() => taskStore.projects.find((p) => p.id === props.projectId));

const illustrationUrl = computed(() => project.value?.illustrationUrl || "");
</script>

<template>
  <div class="w-full aspect-video rounded-xl border bg-background/40 relative overflow-hidden group shadow-sm transition-all hover:shadow-md hover:border-border/80 flex flex-col items-center justify-center cursor-pointer" @click="emit('manage')">
    <!-- Background grid decoration -->
    <div class="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none" />

    <!-- If illustration exists -->
    <template v-if="illustrationUrl">
      <img :src="illustrationUrl" alt="Project Illustration" class="w-full h-full object-contain bg-white transition-transform duration-500 group-hover:scale-102" />
      <!-- Hover overlay -->
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
        <div class="h-9 px-4 rounded-lg bg-white text-zinc-950 flex items-center gap-1.5 text-xs font-semibold shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
          <Pencil class="h-3.5 w-3.5" />
          更换项目插图
        </div>
      </div>
    </template>

    <!-- Empty state -->
    <template v-else>
      <div class="text-center p-6 flex flex-col items-center gap-3 select-none">
        <div class="h-12 w-12 rounded-full border border-dashed border-muted-foreground/35 flex items-center justify-center bg-muted/10 group-hover:bg-muted/30 transition-all duration-300">
          <ImageIcon class="h-5 w-5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </div>
        <div class="space-y-1">
          <h4 class="text-xs font-semibold text-foreground flex items-center justify-center gap-1">
            <Sparkles class="h-3 w-3 text-zinc-950 dark:text-zinc-50" />
            专属小黑手绘插画
          </h4>
          <p class="text-[10px] text-muted-foreground max-w-[200px]">点击为该项目生成一个极简怪诞的物理隐喻手绘风插图</p>
        </div>
      </div>
    </template>
  </div>
</template>
