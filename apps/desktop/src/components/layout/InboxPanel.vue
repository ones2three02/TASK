<script setup lang="ts">
import { computed } from "vue";
import { useTaskStore, type SystemNotification } from "@/stores/taskStore";
import { Bell, CheckCheck, Trash2, X, Unlock, AlertTriangle, Info, CheckCircle2 } from "@lucide/vue";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "navigate-to-kanban"): void;
}>();

const taskStore = useTaskStore();

const unreadCount = computed(() => taskStore.notifications.filter((n) => !n.read).length);

function formatTime(isoString: string) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function handleNotificationClick(item: SystemNotification) {
  if (!item.read) {
    item.read = true;
    taskStore.saveNotifications();
  }
  if (item.type === "unlock") {
    emit("navigate-to-kanban");
    emit("close");
  }
}

function clearAll() {
  if (confirm("确定要清空收件箱中的所有通知吗？")) {
    taskStore.clearAllNotifications();
  }
}
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-50 flex justify-end">
      <!-- 遮罩层 -->
      <div class="fixed inset-0 bg-background/40 backdrop-blur-sm" @click="emit('close')"></div>

      <!-- 抽屉面板 -->
      <Transition name="slide">
        <div v-if="show" class="relative z-50 w-80 h-full border-l bg-card/90 backdrop-blur-md text-card-foreground shadow-2xl flex flex-col">
          <!-- 头部 -->
          <div class="p-4 border-b flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-sm">收件箱 (Inbox)</span>
              <span v-if="unreadCount > 0" class="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                {{ unreadCount }}
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <button @click="taskStore.markAllAsRead()" class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer" title="全部标记已读">
                <CheckCheck class="h-4 w-4" />
              </button>
              <button @click="clearAll" class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors cursor-pointer" title="清空全部">
                <Trash2 class="h-4 w-4" />
              </button>
              <button @click="emit('close')" class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer" title="关闭">
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- 主体内容 -->
          <div class="flex-1 overflow-y-auto p-4 space-y-3">
            <div v-if="taskStore.notifications.length === 0" class="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 py-12">
              <Bell class="h-8 w-8 opacity-40 animate-bounce" />
              <span class="text-xs">暂无系统通知</span>
            </div>
            <div
              v-else
              v-for="item in taskStore.notifications"
              :key="item.id"
              @click="handleNotificationClick(item)"
              :class="['p-3 rounded-lg border transition-all duration-200 cursor-pointer text-left relative overflow-hidden', item.read ? 'bg-muted/30 border-border/40 hover:bg-muted/50' : 'bg-card border-primary/20 shadow-sm hover:border-primary/40 hover:bg-accent/5']"
            >
              <div v-if="!item.read" class="absolute top-0 left-0 w-1 h-full bg-primary"></div>

              <div class="flex items-start gap-2.5">
                <div class="mt-0.5 shrink-0">
                  <Unlock v-if="item.type === 'unlock'" class="h-4 w-4 text-emerald-500" />
                  <AlertTriangle v-else-if="item.type === 'warning'" class="h-4 w-4 text-amber-500" />
                  <CheckCircle2 v-else-if="item.type === 'success'" class="h-4 w-4 text-emerald-500" />
                  <Info v-else class="h-4 w-4 text-blue-500" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-1.5">
                    <h4 :class="['text-xs font-semibold truncate', item.read ? 'text-muted-foreground' : 'text-foreground']">
                      {{ item.title }}
                    </h4>
                    <span class="text-[9px] text-muted-foreground/60 shrink-0 font-normal">
                      {{ formatTime(item.createdAt) }}
                    </span>
                  </div>
                  <p class="text-[11px] text-muted-foreground leading-relaxed mt-1 break-words">
                    {{ item.description }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
/* Fade Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Slide Transition */
.slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-leave-active {
  transition: transform 0.2s cubic-bezier(0.7, 0, 0.84, 0);
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
