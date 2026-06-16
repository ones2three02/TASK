<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useTaskStore, type Action } from "@/stores/taskStore";
import { useSettingsStore, AI_PROVIDER_PRESETS } from "@/stores/settingsStore";
import { useToast } from "@/composables/useToast";
import { suggestServeKeepWithAi } from "@/lib/aiParser";
import { Plus, ListTodo, Calendar, Trash2, Edit, ArrowRight, ArrowLeft, MoreHorizontal, X, Trophy, Handshake, Archive, Loader2, Sparkles, CheckCircle2, Circle } from "@lucide/vue";

const taskStore = useTaskStore();
const today = new Date().toISOString().slice(0, 10);
const statusFilter = ref<"all" | "todo" | "in_progress" | "done">("all");
const priorityFilter = ref<"all" | "low" | "medium" | "high">("all");
const dateFilter = ref<"all" | "overdue" | "next7" | "none">("all");

// Filter actions for active project
const projectActions = computed(() => {
  return taskStore.actions.filter((a) => a.projectId === taskStore.activeProjectId);
});

const filteredProjectActions = computed(() => {
  return projectActions.value.filter((action) => {
    if (statusFilter.value !== "all" && action.status !== statusFilter.value) return false;
    if (priorityFilter.value !== "all" && action.priority !== priorityFilter.value) return false;
    if (dateFilter.value === "none") return !action.dueDate;
    if (dateFilter.value === "overdue") return isActionOverdue(action);
    if (dateFilter.value === "next7") {
      if (!action.dueDate) return false;
      const due = new Date(`${action.dueDate}T00:00:00`).getTime();
      const start = new Date(`${today}T00:00:00`).getTime();
      const end = start + 7 * 24 * 60 * 60 * 1000;
      return due >= start && due <= end;
    }
    return true;
  });
});

// Columns definition
const todoActions = computed(() => filteredProjectActions.value.filter((a) => a.status === "todo"));
const inProgressActions = computed(() => filteredProjectActions.value.filter((a) => a.status === "in_progress"));
const doneActions = computed(() => filteredProjectActions.value.filter((a) => a.status === "done"));

const settingsStore = useSettingsStore();
const { toast } = useToast();

// Celebrate & AI S/K Suggestion state
const showCelebrateDialog = ref(false);
const celebrateLoading = ref(false);
const celebratedProjectId = ref("");
const suggestedServe = ref<{ title: string; client: string; deliverable: string; description: string } | null>(null);
const suggestedKeeps = ref<{ name: string; type: "document" | "link"; content: string; selected: boolean }[]>([]);

// Watch if all actions in current project are finished
watch(
  () => [projectActions.value.length, doneActions.value.length, taskStore.activeProjectId],
  async (newVal) => {
    const [total, done, activeProjId] = newVal as [number, number, string];
    if (total > 0 && done === total && celebratedProjectId.value !== activeProjId) {
      celebratedProjectId.value = activeProjId;
      showCelebrateDialog.value = true;

      const preset = AI_PROVIDER_PRESETS[settingsStore.aiConfig.provider];
      const isAiConfigured = !!settingsStore.aiConfig.endpoint && !!settingsStore.aiConfig.model && (!preset.requiresApiKey || !!settingsStore.aiConfig.apiKey);

      if (isAiConfigured) {
        celebrateLoading.value = true;
        suggestedServe.value = null;
        suggestedKeeps.value = [];
        try {
          const activeProj = taskStore.projects.find((p) => p.id === activeProjId);
          const res = await suggestServeKeepWithAi(
            settingsStore.aiConfig,
            { name: activeProj?.name || "我的项目", description: activeProj?.description || "" },
            projectActions.value.map((a) => ({ title: a.title, description: a.description || "" })),
          );
          suggestedServe.value = res.serve;
          suggestedKeeps.value = res.keep.map((k) => ({ ...k, selected: true }));
        } catch (e) {
          console.error("AI S/K auto suggest error:", e);
        } finally {
          celebrateLoading.value = false;
        }
      }
    }
  },
);

function acceptCelebrateSuggestions() {
  if (suggestedServe.value) {
    taskStore.addServe(suggestedServe.value.title, suggestedServe.value.description, suggestedServe.value.deliverable, suggestedServe.value.client, "delivered");
  }
  suggestedKeeps.value.forEach((k) => {
    if (k.selected) {
      taskStore.addKeep(k.name, k.type as any, k.content);
    }
  });
  toast("已为您自动生成服务交付总结 (S) 和归档资产记录 (K)！", 3000);
  showCelebrateDialog.value = false;
}

// Dialog state
const showDialog = ref(false);
const isEdit = ref(false);
const editId = ref("");
const formTitle = ref("");
const formDescription = ref("");
const formPriority = ref<"low" | "medium" | "high">("medium");
const formDueDate = ref("");
const formStatus = ref<"todo" | "in_progress" | "done">("todo");

function openAddDialog(status: "todo" | "in_progress" | "done" = "todo") {
  isEdit.value = false;
  editId.value = "";
  formTitle.value = "";
  formDescription.value = "";
  formPriority.value = "medium";
  formDueDate.value = "";
  formStatus.value = status;
  showDialog.value = true;
}

function openEditDialog(action: Action) {
  isEdit.value = true;
  editId.value = action.id;
  formTitle.value = action.title;
  formDescription.value = action.description;
  formPriority.value = action.priority;
  formDueDate.value = action.dueDate || "";
  formStatus.value = action.status;
  showDialog.value = true;
}

function submitForm() {
  if (!formTitle.value.trim()) return;

  if (isEdit.value) {
    const existing = taskStore.actions.find((a) => a.id === editId.value);
    if (existing) {
      existing.title = formTitle.value.trim();
      existing.description = formDescription.value.trim();
      existing.priority = formPriority.value;
      existing.dueDate = formDueDate.value || undefined;
      existing.status = formStatus.value;
      taskStore.updateAction(existing);
    }
  } else {
    taskStore.addAction(formTitle.value.trim(), formDescription.value.trim(), formPriority.value, formDueDate.value || undefined, formStatus.value);
  }
  showDialog.value = false;
}

function deleteAction(id: string) {
  if (confirm("确定要删除这个行动吗？")) {
    taskStore.deleteAction(id);
  }
}

function moveAction(action: Action, direction: "next" | "prev") {
  const actionCopy = { ...action };
  if (direction === "next") {
    if (actionCopy.status === "todo") actionCopy.status = "in_progress";
    else if (actionCopy.status === "in_progress") actionCopy.status = "done";
  } else {
    if (actionCopy.status === "done") actionCopy.status = "in_progress";
    else if (actionCopy.status === "in_progress") actionCopy.status = "todo";
  }
  taskStore.updateAction(actionCopy);
}

// Visuals for Priority
function getPriorityBadge(priority: "low" | "medium" | "high") {
  switch (priority) {
    case "high":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "medium":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "low":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  }
}

function getPriorityLabel(priority: "low" | "medium" | "high") {
  switch (priority) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
  }
}

function isActionOverdue(action: Action) {
  return action.status !== "done" && !!action.dueDate && action.dueDate < today;
}
</script>

<template>
  <div class="flex-1 min-w-0 overflow-y-auto bg-background/50 p-6 flex flex-col gap-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 p-5 rounded-xl border bg-muted/10 backdrop-blur-md">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold flex items-center gap-2">
            <ListTodo class="h-5 w-5 text-indigo-500" />
            A - ACTION 行动看板
          </h2>
          <p class="text-xs text-muted-foreground mt-1">做项目需要行动。使用看板追踪行动执行状态，敏捷推进任务交付。</p>
        </div>
        <button class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1" @click="openAddDialog('todo')">
          <Plus class="h-4 w-4" />
          发起行动
        </button>
      </div>

      <div class="grid grid-cols-1 gap-3 border-t border-border/40 pt-4 md:grid-cols-3">
        <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
          状态筛选
          <select v-model="statusFilter" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <option value="all">全部状态</option>
            <option value="todo">准备发起</option>
            <option value="in_progress">行动进行中</option>
            <option value="done">行动已完成</option>
          </select>
        </label>

        <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
          优先级筛选
          <select v-model="priorityFilter" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <option value="all">全部优先级</option>
            <option value="high">高优先级</option>
            <option value="medium">中优先级</option>
            <option value="low">低优先级</option>
          </select>
        </label>

        <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
          时间筛选
          <select v-model="dateFilter" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <option value="all">全部时间</option>
            <option value="overdue">已逾期</option>
            <option value="next7">7 天内</option>
            <option value="none">无截止日期</option>
          </select>
        </label>
      </div>
    </div>

    <!-- Kanban Grid -->
    <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 items-start min-h-[400px]">
      <!-- Column 1: Todo -->
      <div class="rounded-xl border border-border/60 bg-muted/5 flex flex-col min-h-[450px] p-4 gap-4">
        <div class="flex items-center justify-between border-b pb-2 border-border/40">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full bg-slate-400" />
            <h3 class="font-medium text-sm text-foreground">准备发起</h3>
            <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
              {{ todoActions.length }}
            </span>
          </div>
          <button class="text-muted-foreground hover:text-foreground" @click="openAddDialog('todo')">
            <Plus class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[60vh] pr-0.5">
          <div v-for="action in todoActions" :key="action.id" class="group p-4 rounded-lg border bg-background/50 hover:bg-muted/10 transition-all border-border/80 relative shadow-sm">
            <div class="flex flex-col gap-2">
              <div class="flex items-start justify-between gap-2">
                <span class="text-xs font-semibold px-2 py-0.5 rounded border shrink-0" :class="getPriorityBadge(action.priority)">
                  {{ getPriorityLabel(action.priority) }}
                </span>
                <span v-if="action.dueDate" class="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Calendar class="h-3 w-3" />
                  {{ action.dueDate }}
                </span>
              </div>
              <span v-if="isActionOverdue(action)" class="inline-flex w-fit items-center rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500">已逾期</span>
              <h4 class="font-medium text-sm leading-snug">{{ action.title }}</h4>
              <p class="text-xs text-muted-foreground line-clamp-2 leading-relaxed" v-if="action.description">
                {{ action.description }}
              </p>

              <!-- Card actions -->
              <div class="flex items-center justify-between border-t pt-2.5 mt-1 border-border/30">
                <div class="flex items-center gap-1">
                  <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground" @click="openEditDialog(action)">
                    <Edit class="h-3 w-3" />
                  </button>
                  <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click="deleteAction(action.id)">
                    <Trash2 class="h-3 w-3" />
                  </button>
                </div>

                <button class="h-6 px-2 text-[10px] font-medium inline-flex items-center justify-center rounded bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white transition-colors gap-0.5" @click="moveAction(action, 'next')">
                  开始
                  <ArrowRight class="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
          <div v-if="todoActions.length === 0" class="flex-1 flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/30 rounded-lg bg-background/5 text-muted-foreground/40 text-xs italic">暂无待办任务</div>
        </div>
      </div>

      <!-- Column 2: In Progress -->
      <div class="rounded-xl border border-border/60 bg-muted/5 flex flex-col min-h-[450px] p-4 gap-4">
        <div class="flex items-center justify-between border-b pb-2 border-border/40">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <h3 class="font-medium text-sm text-foreground">行动进行中</h3>
            <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
              {{ inProgressActions.length }}
            </span>
          </div>
          <button class="text-muted-foreground hover:text-foreground" @click="openAddDialog('in_progress')">
            <Plus class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[60vh] pr-0.5">
          <div v-for="action in inProgressActions" :key="action.id" class="group p-4 rounded-lg border bg-background/50 hover:bg-muted/10 transition-all border-border/80 relative shadow-sm">
            <div class="flex flex-col gap-2">
              <div class="flex items-start justify-between gap-2">
                <span class="text-xs font-semibold px-2 py-0.5 rounded border shrink-0" :class="getPriorityBadge(action.priority)">
                  {{ getPriorityLabel(action.priority) }}
                </span>
                <span v-if="action.dueDate" class="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Calendar class="h-3 w-3" />
                  {{ action.dueDate }}
                </span>
              </div>
              <span v-if="isActionOverdue(action)" class="inline-flex w-fit items-center rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500">已逾期</span>
              <h4 class="font-medium text-sm leading-snug">{{ action.title }}</h4>
              <p class="text-xs text-muted-foreground line-clamp-2 leading-relaxed" v-if="action.description">
                {{ action.description }}
              </p>

              <!-- Card actions -->
              <div class="flex items-center justify-between border-t pt-2.5 mt-1 border-border/30">
                <button class="h-6 px-2 text-[10px] font-medium inline-flex items-center justify-center rounded bg-slate-500/10 hover:bg-slate-500 text-muted-foreground hover:text-white transition-colors gap-0.5" @click="moveAction(action, 'prev')">
                  <ArrowLeft class="h-3 w-3" />
                  撤回
                </button>

                <div class="flex items-center gap-1">
                  <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground" @click="openEditDialog(action)">
                    <Edit class="h-3 w-3" />
                  </button>
                  <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click="deleteAction(action.id)">
                    <Trash2 class="h-3 w-3" />
                  </button>
                </div>

                <button class="h-6 px-2 text-[10px] font-medium inline-flex items-center justify-center rounded bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white transition-colors gap-0.5" @click="moveAction(action, 'next')">
                  完成
                  <ArrowRight class="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
          <div v-if="inProgressActions.length === 0" class="flex-1 flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/30 rounded-lg bg-background/5 text-muted-foreground/40 text-xs italic">暂无进行中任务</div>
        </div>
      </div>

      <!-- Column 3: Done -->
      <div class="rounded-xl border border-border/60 bg-muted/5 flex flex-col min-h-[450px] p-4 gap-4">
        <div class="flex items-center justify-between border-b pb-2 border-border/40">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full bg-emerald-500" />
            <h3 class="font-medium text-sm text-foreground">行动已完成</h3>
            <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
              {{ doneActions.length }}
            </span>
          </div>
          <button class="text-muted-foreground hover:text-foreground" @click="openAddDialog('done')">
            <Plus class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[60vh] pr-0.5">
          <div v-for="action in doneActions" :key="action.id" class="group p-4 rounded-lg border bg-background/30 hover:bg-muted/10 transition-all border-border/50 relative shadow-sm opacity-80">
            <div class="flex flex-col gap-2">
              <div class="flex items-start justify-between gap-2">
                <span class="text-xs font-semibold px-2 py-0.5 rounded border shrink-0 bg-emerald-500/5 text-emerald-500/80 border-emerald-500/10"> 已完成 </span>
                <span v-if="action.dueDate" class="text-[10px] text-muted-foreground/60 flex items-center gap-1 line-through">
                  <Calendar class="h-3 w-3" />
                  {{ action.dueDate }}
                </span>
              </div>
              <h4 class="font-medium text-sm leading-snug line-through text-muted-foreground">{{ action.title }}</h4>
              <p class="text-xs text-muted-foreground/60 line-clamp-2 leading-relaxed" v-if="action.description">
                {{ action.description }}
              </p>

              <!-- Card actions -->
              <div class="flex items-center justify-between border-t pt-2.5 mt-1 border-border/20">
                <button class="h-6 px-2 text-[10px] font-medium inline-flex items-center justify-center rounded bg-slate-500/10 hover:bg-slate-500 text-muted-foreground hover:text-white transition-colors gap-0.5" @click="moveAction(action, 'prev')">
                  <ArrowLeft class="h-3 w-3" />
                  未完
                </button>

                <div class="flex items-center gap-1">
                  <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground" @click="openEditDialog(action)">
                    <Edit class="h-3 w-3" />
                  </button>
                  <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click="deleteAction(action.id)">
                    <Trash2 class="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-if="doneActions.length === 0" class="flex-1 flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/30 rounded-lg bg-background/5 text-muted-foreground/40 text-xs italic">暂无已完成任务</div>
        </div>
      </div>
    </div>

    <!-- Dialog Modal -->
    <div v-if="showDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div class="w-full max-w-[480px] rounded-xl border bg-background p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground" @click="showDialog = false">
          <X class="h-4 w-4" />
        </button>

        <h3 class="text-base font-semibold">{{ isEdit ? "修改行动详情" : "发起新行动" }}</h3>

        <div class="flex flex-col gap-4">
          <!-- Title -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">行动名称</label>
            <input
              v-model="formTitle"
              type="text"
              placeholder="例如：对接第三方API接口"
              class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <!-- Description -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">具体任务描述</label>
            <textarea
              v-model="formDescription"
              placeholder="行动具体的执行内容、边界和负责人等..."
              rows="3"
              class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <!-- Priority -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">优先级</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="p in ['low', 'medium', 'high'] as const"
                :key="p"
                type="button"
                class="h-9 rounded-md border text-xs font-medium flex items-center justify-center transition-colors"
                :class="formPriority === p ? getPriorityBadge(p) + ' border-current' : 'border-border hover:bg-muted text-muted-foreground'"
                @click="formPriority = p"
              >
                {{ getPriorityLabel(p) }}
              </button>
            </div>
          </div>

          <!-- Due Date -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">截止日期（可选）</label>
            <input v-model="formDueDate" type="date" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">行动状态</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="s in ['todo', 'in_progress', 'done'] as const"
                :key="s"
                type="button"
                class="h-9 rounded-md border text-xs font-medium flex items-center justify-center transition-colors"
                :class="formStatus === s ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground'"
                @click="formStatus = s"
              >
                {{ s === "todo" ? "准备发起" : s === "in_progress" ? "进行中" : "已完成" }}
              </button>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3 border-border/40">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors" @click="showDialog = false">取消</button>
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md" :disabled="!formTitle.trim()" @click="submitForm">确定发起</button>
        </div>
      </div>
    </div>

    <!-- Celebration and AI S/K Auto-suggestion Dialog -->
    <div v-if="showCelebrateDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div class="w-full max-w-[550px] rounded-xl border bg-background p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground" @click="showCelebrateDialog = false">
          <X class="h-4 w-4" />
        </button>

        <div class="flex flex-col items-center text-center gap-2">
          <div class="h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-lg">
            <Trophy class="h-6 w-6 animate-bounce" />
          </div>
          <h3 class="text-base font-bold text-foreground">恭喜！项目所有行动已全部达成</h3>
          <p class="text-xs text-muted-foreground max-w-sm">您已完成了当前项目看板中的所有计划行动。这标志着项目已经顺利进入交付与沉淀阶段！</p>
        </div>

        <!-- AI Loading -->
        <div v-if="celebrateLoading" class="py-8 flex flex-col items-center justify-center gap-2 border border-dashed rounded-lg bg-muted/10">
          <Loader2 class="h-5 w-5 text-indigo-500 animate-spin" />
          <span class="text-xs text-muted-foreground">AI 正在根据您完成的任务，智能提炼 S & K 归档建议...</span>
        </div>

        <!-- AI Result Presentation -->
        <div v-else-if="suggestedServe" class="space-y-4 overflow-y-auto max-h-[50vh] pr-1">
          <div class="space-y-2.5 bg-muted/20 p-4 rounded-lg border border-border/40">
            <h4 class="text-xs font-semibold flex items-center gap-1.5 text-amber-500">
              <Handshake class="h-4 w-4" />
              S (Serve) 自动提炼交付服务
            </h4>

            <div class="space-y-2 text-xs">
              <div class="grid grid-cols-[80px_1fr] gap-1">
                <span class="text-muted-foreground font-medium">交付总结:</span>
                <span class="font-semibold text-foreground">{{ suggestedServe.title }}</span>
              </div>
              <div class="grid grid-cols-[80px_1fr] gap-1">
                <span class="text-muted-foreground font-medium">服务对象:</span>
                <span class="font-medium text-foreground">{{ suggestedServe.client }}</span>
              </div>
              <div class="grid grid-cols-[80px_1fr] gap-1">
                <span class="text-muted-foreground font-medium">交付产出:</span>
                <span class="font-medium text-foreground">{{ suggestedServe.deliverable }}</span>
              </div>
              <div class="grid grid-cols-[80px_1fr] gap-1">
                <span class="text-muted-foreground font-medium">服务价值:</span>
                <p class="text-muted-foreground italic leading-relaxed">{{ suggestedServe.description }}</p>
              </div>
            </div>
          </div>

          <div class="space-y-2 bg-muted/20 p-4 rounded-lg border border-border/40">
            <h4 class="text-xs font-semibold flex items-center gap-1.5 text-purple-500">
              <Archive class="h-4 w-4" />
              K (Keep) 推荐沉淀项目资产
            </h4>

            <div class="space-y-2">
              <div v-for="(k, idx) in suggestedKeeps" :key="idx" class="flex items-start gap-2.5 py-1 px-1.5 rounded hover:bg-muted/30 text-xs">
                <button type="button" class="mt-0.5 text-muted-foreground hover:text-purple-500 shrink-0" @click="k.selected = !k.selected">
                  <CheckCircle2 v-if="k.selected" class="h-4 w-4 text-purple-500" />
                  <Circle v-else class="h-4 w-4" />
                </button>
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-foreground flex items-center gap-1.5">
                    {{ k.name }}
                    <span class="text-[9px] uppercase px-1 py-0.2 rounded bg-purple-500/10 text-purple-500 border border-purple-500/10">
                      {{ k.type === "link" ? "快捷链接" : "知识文档" }}
                    </span>
                  </div>
                  <div class="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{{ k.content }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- No AI configured -->
        <div v-else class="p-4 rounded-lg border border-border/60 bg-muted/10 text-center text-xs text-muted-foreground leading-relaxed">
          <p>🎉 所有行动均已完成！</p>
          <p class="text-[11px] opacity-80 mt-1.5">若配置了 AI 秘钥，系统在您完成任务时会自动提炼并映射生成 S（服务）与 K（留存）资产建议。您可以现在手动前往对应模块进行总结归档。</p>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3 border-border/40 shrink-0">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors" @click="showCelebrateDialog = false">直接关闭</button>

          <button v-if="suggestedServe" class="h-9 inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-500/90 text-white px-5 text-sm font-medium transition-all shadow-md gap-1.5" @click="acceptCelebrateSuggestions">
            <Sparkles class="h-4 w-4" />
            一键采纳并同步到 S & K
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
