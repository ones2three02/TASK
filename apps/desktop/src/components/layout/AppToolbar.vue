<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ClipboardCheck, Moon, Sun, SunMoon, Bot, Settings, CloudDownload, LoaderCircle } from "@lucide/vue";
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
  appVersion?: string;
  checkingUpdates?: boolean;
  hasUpdateAvailable?: boolean;
}>();

const emit = defineEmits<{
  "new-project": [];
  "set-theme-mode": [mode: AppThemeMode];
  "toggle-ai": [];
  "check-updates": [];
  "open-settings": [];
  "open-about": [];
}>();

const { t } = useI18n();
const { isMac, isDesktop, isFullscreen, minimize, toggleMaximize, close } = useWindowControls();

const themeItems = computed(() => [
  { value: "light", label: t("toolbar.themeLight") || "明亮", icon: Sun },
  { value: "dark", label: t("toolbar.themeDark") || "暗黑", icon: Moon },
  { value: "system", label: t("toolbar.themeSystem") || "跟随系统", icon: SunMoon },
]);

const themeTriggerIcon = computed(() => {
  if (props.themeMode === "system") return SunMoon;
  return props.isDark ? Moon : Sun;
});

const displayVersion = computed(() => `v${props.appVersion || "1.0.0"}`);
const updateTooltip = computed(() => {
  if (props.checkingUpdates) return t("updates.checking") || "正在检查更新...";
  if (props.hasUpdateAvailable) return t("updates.availableTitle") || "发现新版本";
  return t("updates.check") || "检查更新";
});

function onToolbarDblClick() {
  if (isDesktop) return;
  toggleMaximize();
}
</script>

<template>
  <div class="h-10 flex items-center justify-between px-3 border-b bg-muted/30 shrink-0 overflow-hidden" :class="{ 'pl-[208px]': shouldReserveMacTrafficLightInset(isMac, isFullscreen, isDesktop) }" data-tauri-drag-region @dblclick="onToolbarDblClick">
    <!-- Brand / Title -->
    <div class="flex items-center gap-2 select-none" data-tauri-drag-region>
      <div class="h-6 w-6 rounded bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
        <ClipboardCheck class="h-4 w-4" />
      </div>
      <span class="text-sm font-bold tracking-wider text-foreground">TASK</span>
      <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/40 select-none">{{ displayVersion }}</span>
    </div>

    <!-- Central spacer -->
    <div class="flex-1 h-full" data-tauri-drag-region />

    <!-- Action Toolbar Controls -->
    <div class="flex items-center gap-1.5">
      <!-- Update Checker -->
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="relative h-8 w-8 rounded-md" :class="{ 'bg-primary/10 text-primary hover:bg-primary/20': hasUpdateAvailable }" :disabled="checkingUpdates" :aria-label="updateTooltip" @click="emit('check-updates')">
            <LoaderCircle v-if="checkingUpdates" class="h-4 w-4 animate-spin" />
            <CloudDownload v-else class="h-4 w-4" />
            <span v-if="hasUpdateAvailable" class="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ updateTooltip }}</TooltipContent>
      </Tooltip>

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
