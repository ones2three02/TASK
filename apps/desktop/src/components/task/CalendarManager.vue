<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { useTaskStore, type Action, type Serve } from "@/stores/taskStore";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, CheckCircle2, Clock, AlertTriangle, AlertCircle, Trash2, Edit3, Save, X, Calendar as CalendarIcon, CheckSquare, Square } from "@lucide/vue";
import { useToast } from "@/composables/useToast";
import { uuid } from "@/lib/utils";

const taskStore = useTaskStore();
const { toast } = useToast();

const year = ref(new Date().getFullYear());
const month = ref(new Date().getMonth()); // 0-11
const selectedDate = ref<Date>(new Date());

const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

// Active project checks
const activeProject = computed(() => taskStore.projects.find((p) => p.id === taskStore.activeProjectId));

const projectActions = computed(() => {
  return taskStore.actions.filter((a) => a.projectId === taskStore.activeProjectId);
});

const projectServes = computed(() => {
  return taskStore.serves.filter((s) => s.projectId === taskStore.activeProjectId);
});

// Format date to YYYY-MM-DD
function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

// Generate calendar cells (42 days)
const calendarDays = computed(() => {
  const firstDay = new Date(year.value, month.value, 1);
  const startDayOfWeek = firstDay.getDay(); // 0: Sun, 1: Mon...

  const daysInMonth = new Date(year.value, month.value + 1, 0).getDate();
  const daysInPrevMonth = new Date(year.value, month.value, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean; isToday: boolean; dateKey: string }[] = [];

  // Prev month padding
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year.value, month.value - 1, daysInPrevMonth - i);
    cells.push({
      date: d,
      isCurrentMonth: false,
      isToday: isSameDay(d, new Date()),
      dateKey: formatDateKey(d),
    });
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year.value, month.value, i);
    cells.push({
      date: d,
      isCurrentMonth: true,
      isToday: isSameDay(d, new Date()),
      dateKey: formatDateKey(d),
    });
  }

  // Next month padding
  const total = cells.length;
  const remaining = 42 - total;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year.value, month.value + 1, i);
    cells.push({
      date: d,
      isCurrentMonth: false,
      isToday: isSameDay(d, new Date()),
      dateKey: formatDateKey(d),
    });
  }

  return cells;
});

// Group actions & serves by date keys
const actionsByDate = computed(() => {
  const groups: Record<string, Action[]> = {};
  for (const action of projectActions.value) {
    if (!action.dueDate) continue;
    const key = action.dueDate.split("T")[0];
    if (!groups[key]) groups[key] = [];
    groups[key].push(action);
  }
  return groups;
});

const servesByDate = computed(() => {
  const groups: Record<string, Serve[]> = {};
  for (const serve of projectServes.value) {
    if (!serve.plannedAt) continue;
    const key = serve.plannedAt.split("T")[0];
    if (!groups[key]) groups[key] = [];
    groups[key].push(serve);
  }
  return groups;
});

// Switch months
function prevMonth() {
  if (month.value === 0) {
    month.value = 11;
    year.value -= 1;
  } else {
    month.value -= 1;
  }
}

function nextMonth() {
  if (month.value === 11) {
    month.value = 0;
    year.value += 1;
  } else {
    month.value += 1;
  }
}

function selectToday() {
  year.value = new Date().getFullYear();
  month.value = new Date().getMonth();
  selectedDate.value = new Date();
}

// Select a day
function selectDay(date: Date) {
  selectedDate.value = date;
}

// Stats for active month
const activeMonthStats = computed(() => {
  const actionsThisMonth = projectActions.value.filter((a) => {
    if (!a.dueDate) return false;
    const d = new Date(a.dueDate);
    return d.getFullYear() === year.value && d.getMonth() === month.value;
  });

  const total = actionsThisMonth.length;
  const completed = actionsThisMonth.filter((a) => a.status === "done").length;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, rate };
});

// Tasks for the selected day
const selectedDayKey = computed(() => formatDateKey(selectedDate.value));
const selectedDayActions = computed(() => actionsByDate.value[selectedDayKey.value] || []);
const selectedDayServes = computed(() => servesByDate.value[selectedDayKey.value] || []);

// Quick action checkbox toggle
function toggleActionStatus(action: Action) {
  const copy = { ...action };
  copy.status = action.status === "done" ? "in_progress" : "done";
  taskStore.updateAction(copy);
  toast(`✅ 任务已标记为 ${copy.status === "done" ? "已完成" : "进行中"}`);
}

// Add Action Dialog
const showAddActionDialog = ref(false);
const newActionTitle = ref("");
const newActionDesc = ref("");
const newActionPriority = ref<"P0" | "P1" | "P2" | "P3">("P1");
const newActionTargetId = ref("");

const projectTargets = computed(() => {
  return taskStore.targets.filter((t) => t.projectId === taskStore.activeProjectId);
});

function openAddAction() {
  newActionTitle.value = "";
  newActionDesc.value = "";
  newActionPriority.value = "P1";
  newActionTargetId.value = projectTargets.value[0]?.id || "";
  showAddActionDialog.value = true;
}

function submitNewAction() {
  if (!newActionTitle.value.trim()) return;
  const dueDateStr = selectedDayKey.value; // pre-fills selected date

  taskStore.addAction(newActionTitle.value.trim(), newActionDesc.value.trim(), newActionPriority.value, dueDateStr, undefined, newActionTargetId.value || undefined);

  showAddActionDialog.value = false;
  toast("✨ 已在选定日期成功快捷新建行动任务！");
}

function getPriorityBadgeClass(prio: string) {
  switch (prio) {
    case "P0":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "P1":
      return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "P2":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    default:
      return "bg-muted text-muted-foreground border-border/40 border-dashed";
  }
}

function getActionStatusClass(status: string) {
  switch (status) {
    case "done":
      return "text-emerald-500 line-through opacity-60";
    case "in_progress":
      return "text-primary font-medium";
    case "discarded":
      return "text-muted-foreground line-through opacity-40";
    default:
      return "text-foreground";
  }
}
</script>

<template>
  <div class="flex-1 min-w-0 overflow-y-auto bg-background/50 p-6 flex flex-col gap-6">
    <!-- Header Controls -->
    <div class="flex flex-col gap-4 p-5 rounded-xl border bg-muted/10 backdrop-blur-md shrink-0">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CalendarDays class="h-5 w-5" />
          </div>
          <div>
            <h2 class="text-lg font-semibold flex items-center gap-2">日历日程看板</h2>
            <p class="text-xs text-muted-foreground mt-0.5">直观规划行动与交付，时间线掌控项目脉络。</p>
            <div class="flex flex-wrap items-center gap-3.5 mt-2 text-[10px] text-muted-foreground/90 select-none">
              <span class="font-bold flex items-center gap-0.5"> 优先级说明: </span>
              <span class="group relative flex items-center gap-1 cursor-help">
                <span class="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                P0 阻塞特急
                <span class="absolute top-full left-0 mt-1.5 w-48 p-2 bg-popover border text-[9px] text-popover-foreground rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 leading-relaxed font-normal">
                  🔴 核心流程被阻塞，属于影响面极大的崩溃级缺陷或紧急技术痛点，需即刻解决。
                </span>
              </span>
              <span class="group relative flex items-center gap-1 cursor-help">
                <span class="h-1.5 w-1.5 rounded-full bg-orange-500"></span>
                P1 关键高优
                <span class="absolute top-full left-0 mt-1.5 w-48 p-2 bg-popover border text-[9px] text-popover-foreground rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 leading-relaxed font-normal">
                  🟠 本迭代或当前交付里程碑必须在期限内交付的重难点/核心业务逻辑行动。
                </span>
              </span>
              <span class="group relative flex items-center gap-1 cursor-help">
                <span class="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                P2 重要中优
                <span class="absolute top-full left-0 mt-1.5 w-48 p-2 bg-popover border text-[9px] text-popover-foreground rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 leading-relaxed font-normal">
                  🔵 常规业务需求或辅助开发行动，按原计划版本迭代步骤平稳开发。
                </span>
              </span>
              <span class="group relative flex items-center gap-1 cursor-help">
                <span class="h-1.5 w-1.5 rounded-full bg-slate-500"></span>
                P3 低优建议
                <span class="absolute top-full left-0 mt-1.5 w-48 p-2 bg-popover border text-[9px] text-popover-foreground rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 leading-relaxed font-normal">
                  ⚪ 零星用户体验细节优化、非紧急重构，或适合闲暇时进行的技术储备与灵感。
                </span>
              </span>
            </div>
          </div>
        </div>

        <!-- Month Navigation -->
        <div class="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border/60">
          <button class="h-8 w-8 rounded-md flex items-center justify-center hover:bg-background active:scale-90 transition-all cursor-pointer" @click="prevMonth">
            <ChevronLeft class="h-4 w-4" />
          </button>
          <button class="h-8 px-3 rounded-md text-xs font-semibold hover:bg-background active:scale-95 transition-all cursor-pointer" @click="selectToday">今日</button>
          <span class="text-xs font-semibold px-3 min-w-[90px] text-center font-mono"> {{ year }} 年 {{ monthNames[month] }} </span>
          <button class="h-8 w-8 rounded-md flex items-center justify-center hover:bg-background active:scale-90 transition-all cursor-pointer" @click="nextMonth">
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>

        <!-- Stats Bar -->
        <div class="flex items-center gap-4 text-xs">
          <div class="flex flex-col items-end gap-1">
            <span class="text-muted-foreground">本月任务进度</span>
            <span class="font-bold text-foreground">{{ activeMonthStats.completed }} / {{ activeMonthStats.total }} 已完成 ({{ activeMonthStats.rate }}%)</span>
          </div>
          <div class="w-20 bg-muted/50 h-2 rounded-full overflow-hidden border border-border/40 shrink-0">
            <div class="bg-emerald-500 h-full rounded-full transition-all duration-300" :style="{ width: activeMonthStats.rate + '%' }" />
          </div>
        </div>
      </div>
    </div>

    <!-- Calendar & Details Split -->
    <div class="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
      <!-- Left: Calendar Board -->
      <div class="flex-1 rounded-xl border border-border/60 bg-muted/5 p-4 flex flex-col gap-4">
        <!-- Weekday Headers -->
        <div class="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground border-b border-border/40 pb-2 shrink-0">
          <div>周日</div>
          <div>周一</div>
          <div>周二</div>
          <div>周三</div>
          <div>周四</div>
          <div>周五</div>
          <div>周六</div>
        </div>

        <!-- Days Grid -->
        <div class="flex-1 grid grid-cols-7 grid-rows-6 border-l border-t border-border/40 min-h-[480px]">
          <div
            v-for="cell in calendarDays"
            :key="cell.dateKey"
            class="border-r border-b border-border/40 p-2 flex flex-col gap-1 min-h-0 transition-all hover:bg-muted/10 active:scale-[0.985] cursor-pointer"
            :class="[cell.isCurrentMonth ? 'bg-background/25' : 'bg-muted/5 opacity-40', isSameDay(cell.date, selectedDate) ? 'ring-1 ring-primary/45 bg-zinc-100/50 dark:bg-zinc-800/40 z-10 shadow-inner' : '']"
            @click="selectDay(cell.date)"
          >
            <!-- Day number & indicators -->
            <div class="flex items-center justify-between text-xs shrink-0">
              <span class="h-5 w-5 rounded-full flex items-center justify-center font-semibold" :class="cell.isToday ? 'bg-zinc-950 dark:bg-zinc-50 text-white dark:text-zinc-950 font-bold shadow' : 'text-foreground/80'">
                {{ cell.date.getDate() }}
              </span>
              <!-- Dots / Count badge -->
              <span v-if="(actionsByDate[cell.dateKey]?.length || 0) + (servesByDate[cell.dateKey]?.length || 0) > 0" class="text-[9px] bg-zinc-100 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-200/60 dark:border-zinc-800/60 font-bold">
                {{ (actionsByDate[cell.dateKey]?.length || 0) + (servesByDate[cell.dateKey]?.length || 0) }}
              </span>
            </div>

            <!-- Task Blocks -->
            <div class="flex-1 overflow-y-auto flex flex-col gap-1 pr-0.5 mt-1">
              <!-- Serves (S Layer milestones) -->
              <div v-for="serve in servesByDate[cell.dateKey]" :key="serve.id" class="text-[10px] truncate px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-500 border-purple-500/20 font-medium flex items-center gap-1" title="S-交付: ">
                <span class="h-1 w-1 bg-purple-500 rounded-full shrink-0" />
                {{ serve.title }}
              </div>

              <!-- Actions (A Layer tasks) -->
              <div
                v-for="action in actionsByDate[cell.dateKey]"
                :key="action.id"
                class="text-[10px] truncate px-1.5 py-0.5 rounded border flex items-center justify-between gap-1 transition-all"
                :class="[action.status === 'done' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 opacity-60' : 'bg-background/80 border-border/80 text-foreground', action.status === 'discarded' ? 'opacity-30' : '']"
              >
                <div class="min-w-0 flex-1 flex items-center gap-1">
                  <!-- Priority dot -->
                  <span class="h-1 w-1 rounded-full shrink-0" :class="[action.priority === 'P0' ? 'bg-red-500' : '', action.priority === 'P1' ? 'bg-orange-500' : '', action.priority === 'P2' ? 'bg-blue-500' : '', action.priority === 'P3' ? 'bg-muted-foreground' : '']" />
                  <span class="truncate" :class="action.status === 'done' ? 'line-through' : ''">{{ action.title }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Day Focus Panel -->
      <div class="w-full lg:w-[320px] rounded-xl border border-border/60 bg-muted/5 p-4 flex flex-col gap-4 shrink-0">
        <div class="border-b border-border/40 pb-3 flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-sm">当日任务详情</h3>
            <p class="text-[10px] text-muted-foreground mt-0.5">{{ selectedDate.getFullYear() }}年{{ selectedDate.getMonth() + 1 }}月{{ selectedDate.getDate() }}日</p>
          </div>
          <button class="h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-primary hover:text-primary-foreground border border-primary/20 hover:bg-primary transition-all cursor-pointer active:scale-95" title="在此日期新建行动任务" @click="openAddAction">
            <Plus class="h-4 w-4" />
          </button>
        </div>

        <!-- Task List Area -->
        <div class="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
          <!-- 1. Serves Block -->
          <div v-if="selectedDayServes.length > 0" class="space-y-2">
            <h4 class="text-[10px] font-bold uppercase tracking-wider text-purple-500 flex items-center gap-1.5">
              <CheckCircle2 class="h-3.5 w-3.5" />
              S - 交付里程碑 ({{ selectedDayServes.length }})
            </h4>
            <div class="flex flex-col gap-2">
              <div v-for="serve in selectedDayServes" :key="serve.id" class="p-3 rounded-lg border bg-purple-500/5 border-purple-500/20 flex flex-col gap-1.5 active:scale-[0.98] transition-all">
                <div class="text-xs font-semibold text-purple-400">{{ serve.title }}</div>
                <div class="text-[10px] text-muted-foreground leading-relaxed">{{ serve.description }}</div>
                <div class="flex items-center justify-between text-[9px] mt-1">
                  <span class="px-2 py-0.5 rounded-full border border-purple-500/30 text-purple-400 bg-purple-500/10">{{ serve.deliverable }}</span>
                  <span class="text-muted-foreground/60">{{ serve.client }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Actions Block -->
          <div class="space-y-2">
            <h4 class="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Clock class="h-3.5 w-3.5" />
              A - 行动任务 ({{ selectedDayActions.length }})
            </h4>

            <div v-if="selectedDayActions.length === 0" class="text-center py-8 rounded-lg border border-dashed border-border/40 bg-muted/5">
              <CalendarIcon class="h-7 w-7 text-muted-foreground/30 mx-auto" />
              <p class="text-[10px] text-muted-foreground mt-2">当日暂无到期行动项</p>
            </div>

            <div v-else class="flex flex-col gap-2">
              <div v-for="action in selectedDayActions" :key="action.id" class="p-3 rounded-lg border bg-background/50 border-border/80 flex items-start gap-2.5 transition-all hover:bg-muted/10 active:scale-[0.98]">
                <!-- Toggle complete checkbox -->
                <button type="button" class="mt-0.5 text-muted-foreground hover:text-primary transition-colors cursor-pointer shrink-0 active:scale-90" @click="toggleActionStatus(action)">
                  <CheckSquare v-if="action.status === 'done'" class="h-4 w-4 text-emerald-500" />
                  <Square v-else class="h-4 w-4" />
                </button>

                <div class="flex-1 min-w-0">
                  <div class="text-xs" :class="getActionStatusClass(action.status)">
                    {{ action.title }}
                  </div>
                  <div v-if="action.description" class="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {{ action.description }}
                  </div>
                  <div class="flex items-center gap-2 mt-2">
                    <!-- Priority badge -->
                    <span class="text-[9px] px-1.5 py-0.5 rounded border font-semibold" :class="getPriorityBadgeClass(action.priority)">
                      {{ action.priority }}
                    </span>
                    <!-- Status dot -->
                    <span class="text-[9px] text-muted-foreground/60 flex items-center gap-1">
                      <span class="h-1.5 w-1.5 rounded-full" :class="action.status === 'done' ? 'bg-emerald-500' : 'bg-orange-500'" />
                      {{ action.status === "done" ? "已完成" : "待处理" }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Add Action Dialog Modal -->
    <div v-if="showAddActionDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div class="w-full max-w-[420px] rounded-xl border bg-background/80 backdrop-blur-md p-6 shadow-2xl flex flex-col gap-4 relative animate-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer" @click="showAddActionDialog = false">
          <X class="h-4 w-4" />
        </button>

        <h3 class="text-base font-semibold flex items-center gap-1.5">
          <Plus class="h-4 w-4 text-primary" />
          快捷新增行动项
        </h3>
        <p class="text-[10px] text-muted-foreground -mt-2">新任务将自动安排至 {{ selectedDayKey }}</p>

        <div class="flex flex-col gap-4 mt-2">
          <!-- Title -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-foreground">行动内容</label>
            <input
              v-model="newActionTitle"
              type="text"
              placeholder="请输入行动任务，例如：完成接口联调、自测部署逻辑"
              class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <!-- Description -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-foreground">描述/补充 (选填)</label>
            <textarea v-model="newActionDesc" placeholder="行动补充描述..." rows="3" class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
          </div>

          <!-- Priority -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-foreground">优先级</label>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="prio in ['P0', 'P1', 'P2', 'P3'] as const"
                :key="prio"
                type="button"
                class="h-8 rounded-md border text-xs font-semibold transition-all cursor-pointer"
                :class="[newActionPriority === prio ? 'bg-primary text-primary-foreground border-primary' : 'border-border/60 bg-muted/10 hover:bg-muted/30']"
                @click="newActionPriority = prio"
              >
                {{ prio }}
              </button>
            </div>
          </div>

          <!-- Target Selection -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-foreground">关联的目标 (Target)</label>
            <select v-model="newActionTargetId" class="w-full h-9 rounded-md border border-input bg-background px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option v-for="t in projectTargets" :key="t.id" :value="t.id">
                {{ t.title }}
              </option>
              <option value="">不关联目标</option>
            </select>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3 border-border/40 mt-2">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors cursor-pointer" @click="showAddActionDialog = false">取消</button>
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1 cursor-pointer" :disabled="!newActionTitle.trim()" @click="submitNewAction">
            <Save class="h-4 w-4" />
            创建任务
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
