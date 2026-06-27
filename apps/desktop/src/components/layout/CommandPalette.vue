<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { useTaskStore } from "@/stores/taskStore";
import { Search, Activity, Target, ListTodo, Handshake, Archive, Calendar, Sparkles, Plus, Moon, Settings, Bell, CheckCheck, Brain, Trash2, Keyboard } from "@lucide/vue";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "selectModule", module: "dashboard" | "target" | "action" | "serve" | "keep" | "calendar"): void;
  (e: "openAiParser"): void;
  (e: "openAiDiagnostic"): void;
  (e: "openSettings"): void;
  (e: "toggleTheme"): void;
  (e: "openCreateAction"): void;
  (e: "toggleInbox"): void;
  (e: "openShortcutsHelp"): void;
}>();

const taskStore = useTaskStore();
const query = ref("");
const activeIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

const defaultCommands = [
  { category: "导航", label: "进入项目总览", value: "navigate:dashboard", icon: "Activity" },
  { category: "导航", label: "进入项目目标 (T)", value: "navigate:target", icon: "Target" },
  { category: "导航", label: "进入行动看板 (A)", value: "navigate:action", icon: "ListTodo" },
  { category: "导航", label: "进入服务交付 (S)", value: "navigate:serve", icon: "Handshake" },
  { category: "导航", label: "进入留存归档 (K)", value: "navigate:keep", icon: "Archive" },
  { category: "导航", label: "进入日历视图", value: "navigate:calendar", icon: "Calendar" },
  { category: "操作", label: "打开 AI 需求解析", value: "action:ai-parser", icon: "Sparkles" },
  { category: "操作", label: "🧠 运行 AI 项目诊断 (Run AI Diagnostic)", value: "action:ai-diagnostic", icon: "Brain" },
  { category: "操作", label: "新建行动卡片", value: "action:create-action", icon: "Plus" },
  { category: "操作", label: "切换深色/浅色模式", value: "action:toggle-theme", icon: "Moon" },
  { category: "操作", label: "打开系统设置", value: "action:open-settings", icon: "Settings" },
  { category: "操作", label: "显示收件箱", value: "action:toggle-inbox", icon: "Bell" },
  { category: "操作", label: "全部标记已读", value: "action:mark-all-read", icon: "CheckCheck" },
  { category: "操作", label: "清空收件箱", value: "action:clear-inbox", icon: "Trash2" },
  { category: "操作", label: "⌨️ 键盘快捷键指南 (Keyboard Shortcuts Guide)", value: "action:shortcuts-help", icon: "Keyboard" },
];

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase();

  // 1. 过滤默认命令
  const commands = defaultCommands.filter((cmd) => cmd.label.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q));

  if (!q) {
    return commands;
  }

  // 2. 检索当前项目的数据
  const activeProjId = taskStore.activeProjectId;
  const searchResults: any[] = [];

  // 检索 targets
  const matchedTargets = taskStore.targets
    .filter((t) => t.projectId === activeProjId && (t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)))
    .map((t) => ({
      category: "目标 (Target)",
      label: t.title,
      desc: t.description,
      value: `navigate:target:${t.id}`,
      icon: "Target",
    }));
  searchResults.push(...matchedTargets);

  // 检索 actions
  const matchedActions = taskStore.actions
    .filter((a) => a.projectId === activeProjId && (a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)))
    .map((a) => ({
      category: "行动 (Action)",
      label: a.title,
      desc: a.description,
      value: `navigate:action:${a.id}`,
      icon: "ListTodo",
    }));
  searchResults.push(...matchedActions);

  // 检索 serves
  const matchedServes = taskStore.serves
    .filter((s) => s.projectId === activeProjId && (s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)))
    .map((s) => ({
      category: "服务交付 (Serve)",
      label: s.title,
      desc: s.description,
      value: `navigate:serve:${s.id}`,
      icon: "Handshake",
    }));
  searchResults.push(...matchedServes);

  // 检索 keeps
  const matchedKeeps = taskStore.keeps
    .filter((k) => k.projectId === activeProjId && (k.name.toLowerCase().includes(q) || k.content.toLowerCase().includes(q)))
    .map((k) => ({
      category: "留存知识 (Keep)",
      label: k.name,
      desc: k.content,
      value: `navigate:keep:${k.id}`,
      icon: "Archive",
    }));
  searchResults.push(...matchedKeeps);

  return [...commands, ...searchResults];
});

function getIconComponent(name: string) {
  switch (name) {
    case "Activity":
      return Activity;
    case "Target":
      return Target;
    case "ListTodo":
      return ListTodo;
    case "Handshake":
      return Handshake;
    case "Archive":
      return Archive;
    case "Calendar":
      return Calendar;
    case "Sparkles":
      return Sparkles;
    case "Plus":
      return Plus;
    case "Moon":
      return Moon;
    case "Settings":
      return Settings;
    case "Bell":
      return Bell;
    case "CheckCheck":
      return CheckCheck;
    case "Trash2":
      return Trash2;
    case "Brain":
      return Brain;
    case "Keyboard":
      return Keyboard;
    default:
      return Search;
  }
}

function getCleanText(text: string) {
  if (!text) return "";
  let clean = text.replace(/[#*`[\]\-]/g, "").trim();
  if (clean.length > 60) {
    clean = clean.slice(0, 60) + "...";
  }
  return clean;
}

function executeItem(item: any) {
  const parts = item.value.split(":");
  const type = parts[0];
  const payload = parts[1];

  if (type === "navigate") {
    emit("selectModule", payload);
  } else if (type === "action") {
    if (payload === "ai-parser") {
      emit("openAiParser");
    } else if (payload === "ai-diagnostic") {
      emit("openAiDiagnostic");
    } else if (payload === "create-action") {
      emit("openCreateAction");
    } else if (payload === "toggle-theme") {
      emit("toggleTheme");
    } else if (payload === "open-settings") {
      emit("openSettings");
    } else if (payload === "toggle-inbox") {
      emit("toggleInbox");
    } else if (payload === "mark-all-read") {
      taskStore.markAllAsRead();
    } else if (payload === "clear-inbox") {
      taskStore.clearAllNotifications();
    } else if (payload === "shortcuts-help") {
      emit("openShortcutsHelp");
    }
  }
  emit("close");
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % filteredItems.value.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + filteredItems.value.length) % filteredItems.value.length;
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (filteredItems.value[activeIndex.value]) {
      executeItem(filteredItems.value[activeIndex.value]);
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
  }
}

onMounted(() => {
  nextTick(() => {
    inputRef.value?.focus();
  });
});
</script>

<template>
  <div class="fixed inset-0 z-[999] flex items-start justify-center pt-[15vh] px-4 bg-background/40 backdrop-blur-sm" @click.self="emit('close')">
    <div class="w-full max-w-2xl rounded-xl border border-border/40 bg-background/80 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col max-h-[50vh] transition-all">
      <!-- Search Input -->
      <div class="flex items-center gap-3 px-4 border-b border-border/40 h-14 shrink-0">
        <Search class="h-5 w-5 text-muted-foreground" />
        <input ref="inputRef" v-model="query" type="text" placeholder="搜索命令、目标、行动、交付项或避坑知识..." class="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground/60 text-foreground" @keydown="handleKeyDown" />
        <kbd class="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          <span>Esc</span>
        </kbd>
      </div>

      <!-- Results list -->
      <div class="flex-1 overflow-y-auto p-2 min-h-0 flex flex-col gap-1">
        <div v-if="filteredItems.length === 0" class="py-12 text-center text-sm text-muted-foreground italic">没有找到匹配的命令或项目数据</div>

        <template v-else>
          <div
            v-for="(item, idx) in filteredItems"
            :key="idx"
            class="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all gap-3"
            :class="idx === activeIndex ? 'bg-primary/10 text-primary border-l-2 border-primary pl-2' : 'hover:bg-muted/30 text-foreground'"
            @click="executeItem(item)"
            @mouseenter="activeIndex = idx"
          >
            <div class="flex items-center gap-3 min-w-0">
              <component :is="getIconComponent(item.icon)" class="h-4 w-4 shrink-0 opacity-80" />
              <div class="flex flex-col min-w-0">
                <span class="text-sm font-medium truncate">{{ item.label }}</span>
                <span v-if="item.desc" class="text-[11px] text-muted-foreground/80 truncate mt-0.5">{{ getCleanText(item.desc) }}</span>
              </div>
            </div>
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded border border-border bg-muted/30 shrink-0 text-muted-foreground uppercase">
              {{ item.category }}
            </span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
