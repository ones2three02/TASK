<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ClipboardCheck, Moon, Sun, SunMoon, Bot, Settings, FolderPlus, HelpCircle } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import LightDropdown from "@/components/ui/LightDropdown.vue";
import WindowControls from "@/components/layout/WindowControls.vue";
import { shouldReserveMacTrafficLightInset, useWindowControls } from "@/composables/useWindowControls";
import type { AppThemeMode } from "@/lib/appTheme";

const props = defineProps<{
  isDark: boolean;
  themeMode: AppThemeMode;
  showAiPanel: boolean;
}>();

const emit = defineEmits<{
  "new-project": [];
  "set-theme-mode": [mode: AppThemeMode];
  "toggle-ai": [];
  "open-settings": [];
  "open-about": [];
}>();

const { t } = useI18n();
const { isMac, isDesktop, minimize, toggleMaximize, close } = useWindowControls();

const themeItems = computed(() => [
  { value: "light", label: t("toolbar.themeLight") || "明亮", icon: Sun },
  { value: "dark", label: t("toolbar.themeDark") || "暗黑", icon: Moon },
  { value: "system", label: t("toolbar.themeSystem") || "跟随系统", icon: SunMoon },
]);

const themeTriggerIcon = computed(() => {
  if (props.themeMode === "system") return SunMoon;
  return props.isDark ? Moon : Sun;
});

function onToolbarDblClick() {
  if (isDesktop) return;
  toggleMaximize();
}
</script>

<template>
  <div class="h-10 flex items-center justify-between px-3 border-b bg-muted/30 shrink-0 overflow-hidden" :class="{ 'pl-17.5': shouldReserveMacTrafficLightInset(isMac, false, isDesktop) }" data-tauri-drag-region @dblclick="onToolbarDblClick">
    <!-- Brand / Title -->
    <div class="flex items-center gap-2 select-none" data-tauri-drag-region>
      <div class="h-6 w-6 rounded bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
        <ClipboardCheck class="h-4 w-4" />
      </div>
      <span class="text-sm font-bold tracking-wider text-foreground">TASK</span>
      <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/40 select-none">v1.0.0</span>
    </div>

    <!-- Central spacer -->
    <div class="flex-1 h-full" data-tauri-drag-region />

    <!-- Action Toolbar Controls -->
    <div class="flex items-center gap-1.5">
      <!-- AI Assistant Button -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="h-8 w-8 rounded-md" :class="{ 'bg-primary/10 text-primary hover:bg-primary/20': showAiPanel }" @click="emit('toggle-ai')">
            <Bot class="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>AI 助手已就绪</TooltipContent>
      </Tooltip>

      <!-- Theme Switcher -->
      <Tooltip>
        <TooltipTrigger as-child>
          <span class="inline-flex">
            <LightDropdown
              :model-value="themeMode"
              :items="themeItems"
              trigger-class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-0"
              trigger-icon-class="h-4 w-4"
              :trigger-icon="themeTriggerIcon"
              content-class="w-32"
              :show-trigger-label="false"
              :show-chevron="false"
              :highlight-selected="true"
              check-position="right"
              align="end"
              @update:model-value="(mode) => emit('set-theme-mode', mode as AppThemeMode)"
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>切换主题模式</TooltipContent>
      </Tooltip>

      <!-- Settings -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="h-8 w-8 rounded-md" @click="emit('open-settings')">
            <Settings class="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>设置</TooltipContent>
      </Tooltip>

      <!-- Desktop Window Controls -->
      <WindowControls v-if="isDesktop && !isMac" :is-maximized="false" @minimize="minimize" @maximize="toggleMaximize" @close="close" />
    </div>
  </div>
</template>
