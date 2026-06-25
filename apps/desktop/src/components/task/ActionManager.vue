<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useTaskStore, type Action } from "@/stores/taskStore";
import { useSettingsStore, AI_PROVIDER_PRESETS } from "@/stores/settingsStore";
import { useToast } from "@/composables/useToast";
import { uuid } from "@/lib/utils";
import { suggestServeKeepWithAi, splitActionWithAi } from "@/lib/aiParser";
import { Plus, ListTodo, Calendar, Trash2, Edit, ArrowRight, ArrowLeft, MoreHorizontal, X, Trophy, Handshake, Archive, Loader2, Sparkles, CheckCircle2, Circle, Target as TargetIcon, ChevronDown, ChevronRight, HelpCircle } from "@lucide/vue";

const taskStore = useTaskStore();
const today = new Date().toISOString().slice(0, 10);
const statusFilter = ref<"all" | "todo" | "in_progress" | "done">("all");
const priorityFilter = ref<"all" | "P0" | "P1" | "P2" | "P3">("all");
const dateFilter = ref<"all" | "overdue" | "next7" | "none">("all");
const lifecycleFilter = ref<"all" | "unlinked" | "blocked" | "withEvidence">("all");

// Filter actions for active project
const projectActions = computed(() => {
  return taskStore.actions.filter((a) => a.projectId === taskStore.activeProjectId);
});

const projectServes = computed(() => {
  return taskStore.serves.filter((serve) => serve.projectId === taskStore.activeProjectId);
});

const filteredProjectActions = computed(() => {
  return projectActions.value.filter((action) => {
    if (statusFilter.value !== "all" && action.status !== statusFilter.value) return false;
    if (priorityFilter.value !== "all" && action.priority !== priorityFilter.value) return false;
    if (lifecycleFilter.value === "unlinked" && action.serveId) return false;
    if (lifecycleFilter.value === "blocked" && !action.blocked) return false;
    if (lifecycleFilter.value === "withEvidence" && !hasActionEvidence(action)) return false;
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

// Celebrate state
const showCelebrateDialog = ref(false);
const celebratedProjectId = ref("");

// Delete confirm state
const showDeleteConfirm = ref(false);
const actionToDelete = ref<Action | null>(null);

function requestDeleteAction(action: Action) {
  actionToDelete.value = action;
  showDeleteConfirm.value = true;
}

function confirmDeleteAction() {
  if (actionToDelete.value) {
    taskStore.deleteAction(actionToDelete.value.id);
    toast(`🗑️ 已成功删除行动：“${actionToDelete.value.title}”`);
    actionToDelete.value = null;
  }
  showDeleteConfirm.value = false;
}

// Watch if all actions in current project are finished
watch(
  () => [projectActions.value.length, doneActions.value.length, taskStore.activeProjectId],
  (newVal) => {
    const [total, done, activeProjId] = newVal as [number, number, string];
    if (total > 0 && done === total && celebratedProjectId.value !== activeProjId) {
      celebratedProjectId.value = activeProjId;
      showCelebrateDialog.value = true;
    }
  },
);

const aiSplitting = ref(false);

async function handleAiSplitAction() {
  if (!formTitle.value.trim()) return;
  aiSplitting.value = true;
  try {
    const result = await splitActionWithAi(settingsStore.aiConfig, formTitle.value.trim(), formDescription.value.trim());

    if (result.devItems && result.devItems.length > 0) {
      formDevItems.value = result.devItems.map((title) => ({ id: uuid(), title, completed: false }));
    }
    if (result.testItems && result.testItems.length > 0) {
      formTestItems.value = result.testItems.map((title) => ({ id: uuid(), title, completed: false }));
    }
    if (result.outputItems && result.outputItems.length > 0) {
      formOutputItems.value = result.outputItems.map((title) => ({ id: uuid(), title, completed: false }));
    }
    toast("✨ AI 任务拆解成功！");
  } catch (e: any) {
    console.error("AI split action failed", e);
    toast(`AI 拆解失败: ${e?.message || e}`);
  } finally {
    aiSplitting.value = false;
  }
}

// Dialog state
const showDialog = ref(false);
const isEdit = ref(false);
const editId = ref("");
const formTitle = ref("");
const formDescription = ref("");
const formPriority = ref<"P0" | "P1" | "P2" | "P3">("P2");
const formDueDate = ref("");
const formStatus = ref<"todo" | "in_progress" | "done" | "discarded">("todo");
const formServeId = ref("");
const formBlocked = ref(false);
const formBlockerReason = ref("");
const formEvidence = ref("");
const formDiscardedReason = ref("");
const formSupersededById = ref("");
const showDiscardedList = ref(false);

const activeLifecycleTab = ref<"dev" | "test" | "output">("dev");

function adjustTextareaHeight(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function initAllTextareaHeights() {
  nextTick(() => {
    const textareas = document.querySelectorAll(".lifecycle-textarea");
    textareas.forEach((ta) => {
      const el = ta as HTMLTextAreaElement;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
  });
}

watch(activeLifecycleTab, () => {
  initAllTextareaHeights();
});

const formDevItems = ref<{ id: string; title: string; completed: boolean }[]>([]);
const formTestItems = ref<{ id: string; title: string; completed: boolean }[]>([]);
const formOutputItems = ref<{ id: string; title: string; completed: boolean }[]>([]);
const formTargetId = ref("");
const formMilestoneId = ref("");

const activeProjectTargets = computed(() => {
  return taskStore.targets.filter((t) => t.projectId === taskStore.activeProjectId);
});

const selectedTargetMilestones = computed(() => {
  if (!formTargetId.value) return [];
  const target = taskStore.targets.find((t) => t.id === formTargetId.value);
  return target ? target.milestones : [];
});

function addFormDevItem() {
  formDevItems.value.push({ id: uuid(), title: "", completed: false });
}
function removeFormDevItem(id: string) {
  formDevItems.value = formDevItems.value.filter((item) => item.id !== id);
}

function addFormTestItem() {
  formTestItems.value.push({ id: uuid(), title: "", completed: false });
}
function removeFormTestItem(id: string) {
  formTestItems.value = formTestItems.value.filter((item) => item.id !== id);
}

function addFormOutputItem() {
  formOutputItems.value.push({ id: uuid(), title: "", completed: false });
}
function removeFormOutputItem(id: string) {
  formOutputItems.value = formOutputItems.value.filter((item) => item.id !== id);
}

function sanitizeChecklist(items: { id: string; title: string; completed: boolean }[]) {
  return items.map((i) => ({ ...i, title: i.title.trim() })).filter((i) => i.title.length > 0);
}

const discardedActions = computed(() => {
  return projectActions.value.filter((a) => a.status === "discarded");
});

const activeProjectActionsExceptSelf = computed(() => {
  return taskStore.actions.filter((a) => a.projectId === taskStore.activeProjectId && a.id !== editId.value && a.status !== "discarded");
});

function getSupersededTitle(id?: string) {
  if (!id) return "";
  return taskStore.actions.find((a) => a.id === id)?.title || "未知行动";
}

const showKeepPromptDialog = ref(false);
const keepPromptName = ref("");

function requestConvertActionToKeep() {
  if (!editId.value) return;
  const action = taskStore.actions.find((a) => a.id === editId.value);
  if (!action) return;

  keepPromptName.value = `避坑笔记 - ${action.title.replace(/^\[.*?\]\s*/, "")}`;
  showKeepPromptDialog.value = true;
}

function confirmConvertActionToKeep() {
  if (!editId.value) return;
  const action = taskStore.actions.find((a) => a.id === editId.value);
  if (!action) return;

  if (!keepPromptName.value.trim()) {
    toast("知识名称不能为空");
    return;
  }

  const keepName = keepPromptName.value.trim();
  let keepContent = `## 1. 知识沉淀背景\n- **来源行动**: ${action.title}\n- **行动描述**: ${action.description || "无"}\n\n` + `## 2. 问题分析与解决方案\n- **攻克的技术难点/解决方案**:\n*(请在此记录如何解决该问题的细节及核心代码/配置)*\n\n`;

  if (action.devItems && action.devItems.length > 0) {
    keepContent += `## 3. 开发实现明细\n`;
    action.devItems.forEach((i) => {
      keepContent += `- [${i.completed ? "x" : " "}] ${i.title}\n`;
    });
    keepContent += `\n`;
  }

  if (action.evidence) {
    keepContent += `## 4. 运行/自测证据结论\n- ${action.evidence}\n`;
  }

  taskStore.addKeep(keepName, "document", keepContent, action.serveId, action.id);
  const activeProj = taskStore.projects.find((p) => p.id === taskStore.activeProjectId);
  if (activeProj?.localPath) {
    toast(`🎉 成功沉淀为知识！已同步至本地 4_KEEP/knowledge/${keepName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")}.md`);
  } else {
    toast(`🎉 成功添加 Keep 知识资产：“${keepName}”`);
  }
  showKeepPromptDialog.value = false;
  showDialog.value = false;
}

function openAddDialog(status: "todo" | "in_progress" | "done" | "discarded" = "todo") {
  isEdit.value = false;
  editId.value = "";
  formTitle.value = "";
  formDescription.value = "";
  formPriority.value = "P2";
  formDueDate.value = "";
  formStatus.value = status;
  formServeId.value = "";
  formBlocked.value = false;
  formBlockerReason.value = "";
  formEvidence.value = "";
  formDiscardedReason.value = "";
  formSupersededById.value = "";
  formDevItems.value = [];
  formTestItems.value = [];
  formOutputItems.value = [];
  formTargetId.value = "";
  formMilestoneId.value = "";
  activeLifecycleTab.value = "dev";
  showDialog.value = true;
  initAllTextareaHeights();
}

function openEditDialog(action: Action) {
  isEdit.value = true;
  editId.value = action.id;
  formTitle.value = action.title;
  formDescription.value = action.description;
  formPriority.value = action.priority;
  formDueDate.value = action.dueDate || "";
  formStatus.value = action.status;
  formServeId.value = action.serveId || "";
  formBlocked.value = action.blocked || false;
  formBlockerReason.value = action.blockerReason || "";
  formEvidence.value = action.evidence || "";
  formDiscardedReason.value = action.discardedReason || "";
  formSupersededById.value = action.supersededById || "";
  formDevItems.value = (action.devItems ?? []).map((i) => ({ ...i }));
  formTestItems.value = (action.testItems ?? []).map((i) => ({ ...i }));
  formOutputItems.value = (action.outputItems ?? []).map((i) => ({ ...i }));
  formTargetId.value = action.targetId || "";
  formMilestoneId.value = action.milestoneId || "";
  activeLifecycleTab.value = "dev";
  showDialog.value = true;
  initAllTextareaHeights();
}

function submitForm() {
  if (!formTitle.value.trim()) return;

  const serveId = formServeId.value || undefined;
  const blockerReason = formBlocked.value ? formBlockerReason.value.trim() : "";
  const evidence = formEvidence.value.trim();
  const devItems = sanitizeChecklist(formDevItems.value);
  const testItems = sanitizeChecklist(formTestItems.value);
  const outputItems = sanitizeChecklist(formOutputItems.value);
  const supersededById = formStatus.value === "discarded" ? formSupersededById.value || undefined : undefined;
  const discardedReason = formStatus.value === "discarded" ? formDiscardedReason.value.trim() : "";

  if (isEdit.value) {
    const existing = taskStore.actions.find((a) => a.id === editId.value);
    if (existing) {
      existing.title = formTitle.value.trim();
      existing.description = formDescription.value.trim();
      existing.priority = formPriority.value;
      existing.dueDate = formDueDate.value || undefined;
      existing.status = formStatus.value;
      existing.serveId = serveId;
      existing.blocked = formBlocked.value;
      existing.blockerReason = blockerReason;
      existing.evidence = evidence;
      existing.discardedReason = discardedReason;
      existing.supersededById = supersededById;
      existing.devItems = devItems;
      existing.testItems = testItems;
      existing.outputItems = outputItems;
      existing.targetId = formTargetId.value || undefined;
      existing.milestoneId = formMilestoneId.value || undefined;
      taskStore.updateAction(existing);
    }
  } else {
    taskStore.addAction(
      formTitle.value.trim(),
      formDescription.value.trim(),
      formPriority.value,
      formDueDate.value || undefined,
      formStatus.value,
      serveId,
      formBlocked.value,
      blockerReason,
      evidence,
      supersededById,
      discardedReason,
      devItems,
      testItems,
      outputItems,
      formTargetId.value || undefined,
      formMilestoneId.value || undefined,
    );
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
function getPriorityBadge(priority: "P0" | "P1" | "P2" | "P3") {
  switch (priority) {
    case "P0":
      return "bg-red-500/15 text-red-500 border-red-500/30";
    case "P1":
      return "bg-orange-500/15 text-orange-500 border-orange-500/30";
    case "P2":
      return "bg-blue-500/15 text-blue-500 border-blue-500/30";
    case "P3":
      return "bg-slate-500/15 text-slate-500 border-slate-500/30";
  }
}

function getPriorityLabel(priority: "P0" | "P1" | "P2" | "P3") {
  return priority;
}

function isActionOverdue(action: Action) {
  return action.status !== "done" && !!action.dueDate && action.dueDate < today;
}

function getActionServeTitle(action: Action) {
  if (!action.serveId) return "";
  return taskStore.serves.find((serve) => serve.id === action.serveId)?.title || "关联交付项已删除";
}

function getActionTargetTitle(targetId?: string) {
  if (!targetId) return "";
  return taskStore.targets.find((target) => target.id === targetId)?.title || "关联目标已删除";
}

function hasActionEvidence(action: Action) {
  return !!action.evidence?.trim();
}

function getSummary(text?: string) {
  const trimmed = text?.trim() || "";
  return trimmed.length > 44 ? `${trimmed.slice(0, 44)}...` : trimmed;
}

function getActionChecklistStats(action: Action) {
  const devTotal = action.devItems?.length ?? 0;
  const devDone = action.devItems?.filter((i) => i.completed).length ?? 0;

  const testTotal = action.testItems?.length ?? 0;
  const testDone = action.testItems?.filter((i) => i.completed).length ?? 0;

  const outTotal = action.outputItems?.length ?? 0;
  const outDone = action.outputItems?.filter((i) => i.completed).length ?? 0;

  return {
    devTotal,
    devDone,
    testTotal,
    testDone,
    outTotal,
    outDone,
    hasStats: devTotal > 0 || testTotal > 0 || outTotal > 0,
  };
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
            A - ACTION 执行控制
            <span class="group relative inline-flex items-center">
              <HelpCircle class="h-4 w-4 text-muted-foreground/60 hover:text-foreground cursor-help transition-colors" />
              <span
                class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-popover border border-border text-xs text-popover-foreground rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] leading-relaxed font-normal normal-case"
              >
                行动围绕 S 交付项推进，可按需关联交付项、管理阻塞与记录完成证据。
              </span>
            </span>
          </h2>
          <!-- 优先级说明改为了悬浮气泡查看 -->
          <div class="group relative inline-flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground/80 cursor-help select-none">
            <HelpCircle class="h-3.5 w-3.5 text-muted-foreground/60" />
            <span>查看优先级说明</span>
            <div class="absolute left-0 bottom-full mb-1.5 w-72 p-3 bg-popover border text-[10px] text-popover-foreground rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 leading-relaxed font-normal flex flex-col gap-2">
              <div class="font-bold border-b border-border pb-1 mb-1">优先级说明</div>
              <div class="flex items-start gap-1.5">
                <span class="h-1.5 w-1.5 rounded-full bg-red-500 mt-1 shrink-0"></span>
                <div><strong>P0 阻塞特急:</strong> 核心流程被阻塞，属于影响面极大的崩溃级缺陷或紧急技术痛点，需即刻解决。</div>
              </div>
              <div class="flex items-start gap-1.5">
                <span class="h-1.5 w-1.5 rounded-full bg-orange-500 mt-1 shrink-0"></span>
                <div><strong>P1 关键高优:</strong> 本迭代或当前交付里程碑必须在期限内交付的重难点/核心业务逻辑行动。</div>
              </div>
              <div class="flex items-start gap-1.5">
                <span class="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1 shrink-0"></span>
                <div><strong>P2 重要中优:</strong> 常规业务需求或辅助开发行动，按原计划版本迭代步骤平稳开发。</div>
              </div>
              <div class="flex items-start gap-1.5">
                <span class="h-1.5 w-1.5 rounded-full bg-slate-500 mt-1 shrink-0"></span>
                <div><strong>P3 低优建议:</strong> 零星用户体验细节优化、非紧急重构，或适合闲暇时进行的技术储备与灵感。</div>
              </div>
            </div>
          </div>
        </div>
        <button class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1" @click="openAddDialog('todo')">
          <Plus class="h-4 w-4" />
          发起行动
        </button>
      </div>

      <div class="grid grid-cols-1 gap-3 border-t border-border/40 pt-4 md:grid-cols-4">
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
            <option value="P0">P0 - Blocker</option>
            <option value="P1">P1 - High</option>
            <option value="P2">P2 - Medium</option>
            <option value="P3">P3 - Low</option>
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

        <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
          执行筛选
          <select v-model="lifecycleFilter" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <option value="all">全部执行状态</option>
            <option value="unlinked">未关联交付项</option>
            <option value="blocked">阻塞中</option>
            <option value="withEvidence">有完成证据</option>
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

        <div class="flex-1 overflow-y-auto max-h-[60vh] pr-0.5">
          <TransitionGroup name="action-list" tag="div" class="flex flex-col gap-3">
            <div v-for="action in todoActions" :key="action.id" class="group p-4 rounded-lg border bg-background/50 hover:bg-muted/10 border-border/80 relative shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]">
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
                <!-- Checklist stats indicators -->
                <div v-if="getActionChecklistStats(action).hasStats" class="flex flex-wrap items-center gap-1.5 mt-1">
                  <span v-if="getActionChecklistStats(action).devTotal > 0" class="inline-flex items-center gap-1 text-[9px] font-medium text-blue-500 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">
                    💻 Dev {{ getActionChecklistStats(action).devDone }}/{{ getActionChecklistStats(action).devTotal }}
                  </span>
                  <span v-if="getActionChecklistStats(action).testTotal > 0" class="inline-flex items-center gap-1 text-[9px] font-medium text-purple-500 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
                    🧪 Test {{ getActionChecklistStats(action).testDone }}/{{ getActionChecklistStats(action).testTotal }}
                  </span>
                  <span v-if="getActionChecklistStats(action).outTotal > 0" class="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    📦 Out {{ getActionChecklistStats(action).outDone }}/{{ getActionChecklistStats(action).outTotal }}
                  </span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <div v-if="getActionTargetTitle(action.targetId)" class="inline-flex w-fit max-w-full items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                    <TargetIcon class="h-3 w-3 shrink-0 text-emerald-500" />
                    <span class="truncate">目标: {{ getActionTargetTitle(action.targetId) }}</span>
                  </div>
                  <div v-if="getActionServeTitle(action)" class="inline-flex w-fit max-w-full items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                    <Handshake class="h-3 w-3 shrink-0" />
                    <span class="truncate">{{ getActionServeTitle(action) }}</span>
                  </div>
                </div>
                <div v-if="action.blocked" class="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-600">
                  <div class="font-semibold">阻塞中</div>
                  <p v-if="action.blockerReason" class="mt-0.5 line-clamp-2 text-[11px] leading-relaxed">{{ getSummary(action.blockerReason) }}</p>
                </div>
                <div v-if="hasActionEvidence(action)" class="inline-flex w-fit max-w-full items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                  <CheckCircle2 class="h-3 w-3 shrink-0" />
                  <span class="truncate">已记录证据：{{ getSummary(action.evidence) }}</span>
                </div>

                <!-- Card actions -->
                <div class="flex items-center justify-between border-t pt-2.5 mt-1 border-border/30">
                  <div class="flex items-center gap-1">
                    <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground active:scale-90 transition-transform cursor-pointer" @click="openEditDialog(action)">
                      <Edit class="h-3 w-3" />
                    </button>
                    <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 active:scale-90 transition-transform cursor-pointer" @click="requestDeleteAction(action)">
                      <Trash2 class="h-3 w-3" />
                    </button>
                  </div>

                  <button class="h-6 px-2 text-[10px] font-medium inline-flex items-center justify-center rounded bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white transition-all active:scale-95 gap-0.5 cursor-pointer" @click="moveAction(action, 'next')">
                    开始
                    <ArrowRight class="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </TransitionGroup>
          <div v-if="todoActions.length === 0" class="flex-1 flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/30 rounded-lg bg-background/5 text-muted-foreground/40 text-xs italic mt-3">暂无待办任务</div>
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

        <div class="flex-1 overflow-y-auto max-h-[60vh] pr-0.5">
          <TransitionGroup name="action-list" tag="div" class="flex flex-col gap-3">
            <div v-for="action in inProgressActions" :key="action.id" class="group p-4 rounded-lg border bg-background/50 hover:bg-muted/10 border-border/80 relative shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]">
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
                <!-- Checklist stats indicators -->
                <div v-if="getActionChecklistStats(action).hasStats" class="flex flex-wrap items-center gap-1.5 mt-1">
                  <span v-if="getActionChecklistStats(action).devTotal > 0" class="inline-flex items-center gap-1 text-[9px] font-medium text-blue-500 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">
                    💻 Dev {{ getActionChecklistStats(action).devDone }}/{{ getActionChecklistStats(action).devTotal }}
                  </span>
                  <span v-if="getActionChecklistStats(action).testTotal > 0" class="inline-flex items-center gap-1 text-[9px] font-medium text-purple-500 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
                    🧪 Test {{ getActionChecklistStats(action).testDone }}/{{ getActionChecklistStats(action).testTotal }}
                  </span>
                  <span v-if="getActionChecklistStats(action).outTotal > 0" class="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    📦 Out {{ getActionChecklistStats(action).outDone }}/{{ getActionChecklistStats(action).outTotal }}
                  </span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <div v-if="getActionTargetTitle(action.targetId)" class="inline-flex w-fit max-w-full items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                    <TargetIcon class="h-3 w-3 shrink-0 text-emerald-500" />
                    <span class="truncate">目标: {{ getActionTargetTitle(action.targetId) }}</span>
                  </div>
                  <div v-if="getActionServeTitle(action)" class="inline-flex w-fit max-w-full items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                    <Handshake class="h-3 w-3 shrink-0" />
                    <span class="truncate">{{ getActionServeTitle(action) }}</span>
                  </div>
                </div>
                <div v-if="action.blocked" class="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-600">
                  <div class="font-semibold">阻塞中</div>
                  <p v-if="action.blockerReason" class="mt-0.5 line-clamp-2 text-[11px] leading-relaxed">{{ getSummary(action.blockerReason) }}</p>
                </div>
                <div v-if="hasActionEvidence(action)" class="inline-flex w-fit max-w-full items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                  <CheckCircle2 class="h-3 w-3 shrink-0" />
                  <span class="truncate">已记录证据：{{ getSummary(action.evidence) }}</span>
                </div>

                <!-- Card actions -->
                <div class="flex items-center justify-between border-t pt-2.5 mt-1 border-border/30">
                  <button class="h-6 px-2 text-[10px] font-medium inline-flex items-center justify-center rounded bg-slate-500/10 hover:bg-slate-500 text-muted-foreground hover:text-white transition-all active:scale-95 gap-0.5 cursor-pointer" @click="moveAction(action, 'prev')">
                    <ArrowLeft class="h-3 w-3" />
                    撤回
                  </button>

                  <div class="flex items-center gap-1">
                    <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground active:scale-90 transition-transform cursor-pointer" @click="openEditDialog(action)">
                      <Edit class="h-3 w-3" />
                    </button>
                    <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 active:scale-90 transition-transform cursor-pointer" @click="requestDeleteAction(action)">
                      <Trash2 class="h-3 w-3" />
                    </button>
                  </div>

                  <button class="h-6 px-2 text-[10px] font-medium inline-flex items-center justify-center rounded bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white transition-all active:scale-95 gap-0.5 cursor-pointer" @click="moveAction(action, 'next')">
                    完成
                    <ArrowRight class="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </TransitionGroup>
          <div v-if="inProgressActions.length === 0" class="flex-1 flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/30 rounded-lg bg-background/5 text-muted-foreground/40 text-xs italic mt-3">暂无进行中任务</div>
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

        <div class="flex-1 overflow-y-auto max-h-[60vh] pr-0.5">
          <TransitionGroup name="action-list" tag="div" class="flex flex-col gap-3">
            <div v-for="action in doneActions" :key="action.id" class="group p-4 rounded-lg border bg-background/30 hover:bg-muted/10 border-border/50 relative shadow-sm opacity-80 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]">
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
                <!-- Checklist stats indicators -->
                <div v-if="getActionChecklistStats(action).hasStats" class="flex flex-wrap items-center gap-1.5 mt-1 opacity-70">
                  <span v-if="getActionChecklistStats(action).devTotal > 0" class="inline-flex items-center gap-1 text-[9px] font-medium text-blue-500 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">
                    💻 Dev {{ getActionChecklistStats(action).devDone }}/{{ getActionChecklistStats(action).devTotal }}
                  </span>
                  <span v-if="getActionChecklistStats(action).testTotal > 0" class="inline-flex items-center gap-1 text-[9px] font-medium text-purple-500 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
                    🧪 Test {{ getActionChecklistStats(action).testDone }}/{{ getActionChecklistStats(action).testTotal }}
                  </span>
                  <span v-if="getActionChecklistStats(action).outTotal > 0" class="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    📦 Out {{ getActionChecklistStats(action).outDone }}/{{ getActionChecklistStats(action).outTotal }}
                  </span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <div v-if="getActionTargetTitle(action.targetId)" class="inline-flex w-fit max-w-full items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                    <TargetIcon class="h-3 w-3 shrink-0 text-emerald-500" />
                    <span class="truncate">目标: {{ getActionTargetTitle(action.targetId) }}</span>
                  </div>
                  <div v-if="getActionServeTitle(action)" class="inline-flex w-fit max-w-full items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                    <Handshake class="h-3 w-3 shrink-0" />
                    <span class="truncate">{{ getActionServeTitle(action) }}</span>
                  </div>
                </div>
                <div v-if="action.blocked" class="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-600">
                  <div class="font-semibold">阻塞中</div>
                  <p v-if="action.blockerReason" class="mt-0.5 line-clamp-2 text-[11px] leading-relaxed">{{ getSummary(action.blockerReason) }}</p>
                </div>
                <div v-if="hasActionEvidence(action)" class="inline-flex w-fit max-w-full items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                  <CheckCircle2 class="h-3 w-3 shrink-0" />
                  <span class="truncate">已记录证据：{{ getSummary(action.evidence) }}</span>
                </div>

                <!-- Card actions -->
                <div class="flex items-center justify-between border-t pt-2.5 mt-1 border-border/20">
                  <button class="h-6 px-2 text-[10px] font-medium inline-flex items-center justify-center rounded bg-slate-500/10 hover:bg-slate-500 text-muted-foreground hover:text-white transition-all active:scale-95 gap-0.5 cursor-pointer" @click="moveAction(action, 'prev')">
                    <ArrowLeft class="h-3 w-3" />
                    未完
                  </button>

                  <div class="flex items-center gap-1">
                    <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground active:scale-90 transition-transform cursor-pointer" @click="openEditDialog(action)">
                      <Edit class="h-3 w-3" />
                    </button>
                    <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 active:scale-90 transition-transform cursor-pointer" @click="requestDeleteAction(action)">
                      <Trash2 class="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </TransitionGroup>
          <div v-if="doneActions.length === 0" class="flex-1 flex flex-col items-center justify-center py-10 text-center border border-dashed border-border/30 rounded-lg bg-background/5 text-muted-foreground/40 text-xs italic mt-3">暂无已完成任务</div>
        </div>
      </div>
    </div>

    <!-- Discarded Actions Archive (Collapsible) -->
    <div v-if="discardedActions.length > 0" class="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex flex-col gap-3">
      <button class="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-red-500/80 cursor-pointer" @click="showDiscardedList = !showDiscardedList">
        <span class="flex items-center gap-1.5">
          <Archive class="h-4 w-4 animate-pulse" />
          已废弃/被替代的行动历史 ({{ discardedActions.length }})
        </span>
        <span class="text-xs font-bold">{{ showDiscardedList ? "收起 ▲" : "展开 ▼" }}</span>
      </button>

      <div v-show="showDiscardedList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2 animate-in fade-in duration-200">
        <div v-for="action in discardedActions" :key="action.id" class="rounded-xl border border-red-500/10 bg-background/60 p-4 shadow-sm relative flex flex-col gap-2">
          <div class="flex items-start justify-between gap-4">
            <h4 class="font-medium text-sm leading-snug line-through text-muted-foreground">{{ action.title }}</h4>
            <div class="flex gap-1.5 shrink-0">
              <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer active:scale-90 transition-transform" @click="openEditDialog(action)">
                <Edit class="h-3.5 w-3.5" />
              </button>
              <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 cursor-pointer active:scale-90 transition-transform" @click="requestDeleteAction(action)">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p v-if="action.description" class="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">{{ action.description }}</p>

          <div v-if="action.discardedReason" class="text-[11px] text-red-500 bg-red-500/5 border border-red-500/10 rounded-md p-1.5 leading-normal"><strong>废弃原因：</strong>{{ action.discardedReason }}</div>

          <div v-if="getSupersededTitle(action.supersededById)" class="text-[10px] text-indigo-500 font-semibold flex items-center gap-1">
            <ArrowRight class="h-3 w-3 shrink-0" />
            替代行动：{{ getSupersededTitle(action.supersededById) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Dialog Drawer Backdrop -->
    <div v-if="showDialog" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300" @click="showDialog = false"></div>

    <!-- Dialog Drawer Container -->
    <div v-if="showDialog" class="fixed inset-y-0 right-0 z-50 w-full max-w-[500px] border-l border-border bg-background shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-border/60 shrink-0">
        <h3 class="text-base font-semibold text-foreground">{{ isEdit ? "修改行动详情" : "发起新行动" }}</h3>
        <button class="h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer" @click="showDialog = false">
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Scrollable Form Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- Title -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-foreground">行动名称</label>
          <input
            v-model="formTitle"
            type="text"
            placeholder="例如：对接第三方API接口"
            class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-foreground">具体任务描述</label>
          <textarea
            v-model="formDescription"
            placeholder="行动具体的执行内容、边界和负责人等..."
            rows="3"
            class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>

        <!-- Priority with Tooltip -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-foreground flex items-center gap-1">
              优先级
              <span class="group relative cursor-pointer text-muted-foreground hover:text-primary">
                <span class="text-[10px] border border-muted-foreground/30 rounded-full h-4 w-4 inline-flex items-center justify-center font-mono font-bold">i</span>
                <!-- Tooltip content -->
                <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-popover border text-[11px] text-popover-foreground rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 leading-relaxed">
                  <strong class="text-red-500 block mb-1">🔴 P0 - 阻塞特急:</strong> 核心流程阻塞，需即刻解决或给出替代方案。<br />
                  <strong class="text-orange-500 block mb-1">🟠 P1 - 关键高优:</strong> 本迭代/里程碑必须完成的首要任务。<br />
                  <strong class="text-blue-500 block mb-1">🔵 P2 - 重要中优:</strong> 例行需求开发，正常按计划推进。<br />
                  <strong class="text-slate-500 block mb-1">⚪ P3 - 低优建议:</strong> 体验优化、零星重构或无时限想法。
                </span>
              </span>
            </label>
          </div>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="p in ['P0', 'P1', 'P2', 'P3'] as const"
              :key="p"
              type="button"
              class="h-9 rounded-md border text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer"
              :class="formPriority === p ? getPriorityBadge(p) + ' border-current' : 'border-border hover:bg-muted text-muted-foreground'"
              @click="formPriority = p"
            >
              {{ p }}
            </button>
          </div>
        </div>

        <!-- Meta Grid -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <!-- Due Date -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-foreground">截止日期（可选）</label>
            <input v-model="formDueDate" type="date" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          <!-- Action Status -->
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-foreground">行动状态</label>
            <select v-model="formStatus" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="todo">待办</option>
              <option value="in_progress">进行中</option>
              <option value="done">已完成</option>
              <option value="discarded">已废弃/代替</option>
            </select>
          </div>
        </div>

        <!-- Discarded Reason & Lineage (Shows when discarded is selected) -->
        <div v-if="formStatus === 'discarded'" class="space-y-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3 animate-in fade-in duration-150">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-red-500">变更/废弃原因说明</label>
            <textarea
              v-model="formDiscardedReason"
              placeholder="说明废弃本行动的原因或相关背景变更..."
              rows="2"
              class="w-full rounded-md border border-red-500/30 bg-background px-3 py-2 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
          <div class="space-y-1.5" v-if="activeProjectActionsExceptSelf.length > 0">
            <label class="text-xs font-medium text-muted-foreground">替代的新行动 (可选)</label>
            <select v-model="formSupersededById" class="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="">暂无替代行动</option>
              <option v-for="act in activeProjectActionsExceptSelf" :key="act.id" :value="act.id">{{ act.title }}</option>
            </select>
          </div>
        </div>

        <!-- Blocked and Reason -->
        <div class="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
          <label class="flex items-center gap-2 text-xs font-semibold text-foreground">
            <input v-model="formBlocked" type="checkbox" class="h-4 w-4 rounded border-input accent-primary" />
            标记为阻塞中
          </label>
          <textarea
            v-model="formBlockerReason"
            :disabled="!formBlocked"
            placeholder="说明阻塞原因、等待对象或解除条件..."
            rows="2"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <!-- Deliverables and Targets metadata -->
        <div class="space-y-4 rounded-lg border border-border/40 bg-muted/5 p-4">
          <div class="space-y-1.5">
            <label class="text-xs font-semibold text-foreground">关联 S 交付项（可选）</label>
            <select v-model="formServeId" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="">不关联交付项</option>
              <option v-for="serve in projectServes" :key="serve.id" :value="serve.id">{{ serve.title }}</option>
            </select>
            <p v-if="projectServes.length === 0" class="text-[11px] text-muted-foreground">当前项目暂无 S 交付项，可先保持不关联。</p>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-foreground">关联 Target 目标（可选）</label>
              <select v-model="formTargetId" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" @change="formMilestoneId = ''">
                <option value="">不关联目标</option>
                <option v-for="target in activeProjectTargets" :key="target.id" :value="target.id">
                  {{ target.title }}
                </option>
              </select>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold text-foreground">关联里程碑（可选）</label>
              <select v-model="formMilestoneId" :disabled="!formTargetId" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="">不关联里程碑</option>
                <option v-for="m in selectedTargetMilestones" :key="m.id" :value="m.id">
                  {{ m.title }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- Tabs for Dev, Test, Output Sections -->
        <div class="space-y-3 mt-2 border rounded-lg p-3 bg-muted/5 border-border/40">
          <div class="flex items-center justify-between border-b pb-2 border-border/50">
            <h4 class="text-xs font-semibold text-foreground flex items-center gap-1.5 flex-1 min-w-0">
              <ListTodo class="h-3.5 w-3.5 text-primary shrink-0" />
              <span class="truncate">任务生命周期细化</span>
            </h4>
            <div class="flex items-center gap-2 shrink-0">
              <button
                type="button"
                class="inline-flex h-6 items-center justify-center rounded border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 px-2 text-[10px] font-medium transition-all gap-1 cursor-pointer"
                @click="handleAiSplitAction"
                :disabled="aiSplitting || !formTitle.trim()"
              >
                <Sparkles v-if="!aiSplitting" class="h-3 w-3" />
                <Loader2 v-else class="h-3 w-3 animate-spin" />
                {{ aiSplitting ? "AI 拆解中..." : "AI 智能拆解" }}
              </button>
              <div class="flex bg-muted p-0.5 rounded-md text-[11px] border border-border/20">
                <button type="button" class="px-2.5 py-1 rounded-sm font-medium transition-all cursor-pointer" :class="activeLifecycleTab === 'dev' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'" @click="activeLifecycleTab = 'dev'">
                  💻 开发 ({{ formDevItems.length }})
                </button>
                <button type="button" class="px-2.5 py-1 rounded-sm font-medium transition-all cursor-pointer" :class="activeLifecycleTab === 'test' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'" @click="activeLifecycleTab = 'test'">
                  🧪 测试 ({{ formTestItems.length }})
                </button>
                <button type="button" class="px-2.5 py-1 rounded-sm font-medium transition-all cursor-pointer" :class="activeLifecycleTab === 'output' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'" @click="activeLifecycleTab = 'output'">
                  📦 产出 ({{ formOutputItems.length }})
                </button>
              </div>
            </div>
          </div>

          <!-- Dev Tab Content -->
          <div v-show="activeLifecycleTab === 'dev'" class="space-y-2 pt-1 animate-in fade-in duration-150">
            <div class="flex items-center justify-between">
              <span class="text-[10px] text-muted-foreground">定义细化开发步骤，回车可连续新增</span>
              <button type="button" class="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer font-medium" @click="addFormDevItem">+ 添加开发步骤</button>
            </div>
            <div class="space-y-2">
              <div v-for="item in formDevItems" :key="item.id" class="flex items-start gap-2">
                <input v-model="item.completed" type="checkbox" class="h-4 w-4 rounded accent-primary shrink-0 mt-1.5" />
                <textarea
                  v-model="item.title"
                  rows="1"
                  placeholder="开发内容，如：完成数据库表设计"
                  class="lifecycle-textarea flex-1 min-h-[28px] max-h-[150px] resize-none rounded border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring leading-normal align-middle"
                  @input="adjustTextareaHeight"
                  @keydown.enter.prevent="addFormDevItem"
                />
                <button type="button" class="text-muted-foreground hover:text-red-500 shrink-0 mt-1 cursor-pointer" @click="removeFormDevItem(item.id)">
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
              <div v-if="formDevItems.length === 0" class="text-[11px] text-muted-foreground italic text-center py-2 bg-muted/10 rounded-lg">暂无开发步骤，可回车连续新增</div>
            </div>
          </div>

          <!-- Test Tab Content -->
          <div v-show="activeLifecycleTab === 'test'" class="space-y-2 pt-1 animate-in fade-in duration-150">
            <div class="flex items-center justify-between">
              <span class="text-[10px] text-muted-foreground">定义自测与验证用例，回车可连续新增</span>
              <button type="button" class="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer font-medium" @click="addFormTestItem">+ 添加测试用例</button>
            </div>
            <div class="space-y-2">
              <div v-for="item in formTestItems" :key="item.id" class="flex items-start gap-2">
                <input v-model="item.completed" type="checkbox" class="h-4 w-4 rounded accent-primary shrink-0 mt-1.5" />
                <textarea
                  v-model="item.title"
                  rows="1"
                  placeholder="自测试项，如：测试接口异常返回"
                  class="lifecycle-textarea flex-1 min-h-[28px] max-h-[150px] resize-none rounded border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring leading-normal align-middle"
                  @input="adjustTextareaHeight"
                  @keydown.enter.prevent="addFormTestItem"
                />
                <button type="button" class="text-muted-foreground hover:text-red-500 shrink-0 mt-1 cursor-pointer" @click="removeFormTestItem(item.id)">
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
              <div v-if="formTestItems.length === 0" class="text-[11px] text-muted-foreground italic text-center py-2 bg-muted/10 rounded-lg">暂无自测试项，可回车连续新增</div>
            </div>
          </div>

          <!-- Output Tab Content -->
          <div v-show="activeLifecycleTab === 'output'" class="space-y-2 pt-1 animate-in fade-in duration-150">
            <div class="flex items-center justify-between">
              <span class="text-[10px] text-muted-foreground">定义交付的预期物理/技术产出，回车可连续新增</span>
              <button type="button" class="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer font-medium" @click="addFormOutputItem">+ 添加预期产出</button>
            </div>
            <div class="space-y-2">
              <div v-for="item in formOutputItems" :key="item.id" class="flex items-start gap-2">
                <input v-model="item.completed" type="checkbox" class="h-4 w-4 rounded accent-primary shrink-0 mt-1.5" />
                <textarea
                  v-model="item.title"
                  rows="1"
                  placeholder="如：接口说明文档 markdown"
                  class="lifecycle-textarea flex-1 min-h-[28px] max-h-[150px] resize-none rounded border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring leading-normal align-middle"
                  @input="adjustTextareaHeight"
                  @keydown.enter.prevent="addFormOutputItem"
                />
                <button type="button" class="text-muted-foreground hover:text-red-500 shrink-0 mt-1 cursor-pointer" @click="removeFormOutputItem(item.id)">
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
              <div v-if="formOutputItems.length === 0" class="text-[11px] text-muted-foreground italic text-center py-2 bg-muted/10 rounded-lg">暂无预期产出，可回车连续新增</div>
            </div>
          </div>
        </div>

        <!-- Evidence -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-foreground">完成证据（可选）</label>
          <textarea
            v-model="formEvidence"
            placeholder="记录验收链接、截图说明、交付文档或关键结果..."
            rows="2"
            class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>
      </div>

      <!-- Sticky Footer -->
      <div class="flex justify-between items-center p-6 border-t border-border/60 bg-muted/5 shrink-0">
        <div>
          <button
            v-if="isEdit"
            type="button"
            class="h-9 inline-flex items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500 text-purple-500 hover:text-white px-3 text-xs font-semibold transition-all active:scale-95 gap-1 cursor-pointer"
            @click="requestConvertActionToKeep"
          >
            <Archive class="h-3.5 w-3.5" />
            💡 随时沉淀为知识 (Keep)
          </button>
        </div>
        <div class="flex gap-2">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors cursor-pointer" @click="showDialog = false">取消</button>
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md cursor-pointer" :disabled="!formTitle.trim()" @click="submitForm">
            {{ isEdit ? "保存修改" : "确定发起" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Beautiful custom delete confirmation dialog -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div class="w-full max-w-[460px] rounded-3xl border border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
        <button class="absolute top-5 right-5 h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer transition-colors active:scale-95" @click="showDeleteConfirm = false">
          <X class="h-4.5 w-4.5" />
        </button>

        <div class="flex items-start gap-4">
          <div class="h-12 w-12 rounded-full bg-zinc-100 dark:bg-zinc-800/80 shrink-0 flex items-center justify-center">
            <Trash2 class="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-6">确定要删除此行动吗？</h3>
            <p class="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed font-normal">
              您即将删除行动 <span class="font-bold text-zinc-900 dark:text-zinc-200">「{{ actionToDelete?.title }}」</span>。此操作将彻底删除该行动及其绑定的全部开发、测试、产出明细数据。
            </p>
          </div>
        </div>

        <div class="bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/60 rounded-xl p-3.5 mt-1 flex items-center gap-2">
          <span class="h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100 animate-pulse"></span>
          <p class="text-zinc-800 dark:text-zinc-200 font-bold text-[13px] leading-relaxed pl-1 text-left">注意：行动删除后无法恢复！</p>
        </div>

        <div class="border-t border-zinc-100 dark:border-zinc-800/60 my-1"></div>

        <div class="flex justify-end gap-3 pt-1">
          <button
            class="h-10 inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors active:scale-97 cursor-pointer text-zinc-900 dark:text-zinc-100"
            @click="showDeleteConfirm = false"
          >
            取消
          </button>
          <button class="h-10 inline-flex items-center justify-center rounded-xl bg-zinc-950 dark:bg-zinc-50 hover:bg-zinc-900 dark:hover:bg-zinc-200 px-5 text-sm font-bold text-white dark:text-zinc-950 transition-all active:scale-97 cursor-pointer" @click="confirmDeleteAction">确定删除</button>
        </div>
      </div>
    </div>

    <!-- Custom Knowledge Prompt Dialog (Monochrome) -->
    <div v-if="showKeepPromptDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div class="w-full max-w-[460px] rounded-3xl border border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 shadow-2xl flex flex-col gap-4 relative animate-in zoom-in-95 duration-200">
        <button class="absolute top-5 right-5 h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer transition-colors active:scale-95" @click="showKeepPromptDialog = false">
          <X class="h-4.5 w-4.5" />
        </button>

        <div class="flex items-start gap-4">
          <div class="h-12 w-12 rounded-full bg-zinc-100 dark:bg-zinc-800/80 shrink-0 flex items-center justify-center">
            <Archive class="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-6">知识沉淀归档 (Keep)</h3>
            <p class="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed font-normal">将当前已完成行动的步骤、日志及经验归纳并一键写入本地 Markdown 知识资产库。</p>
          </div>
        </div>

        <div class="space-y-1.5 mt-2">
          <label class="text-xs font-semibold text-zinc-700 dark:text-zinc-350">知识文档名称</label>
          <input
            v-model="keepPromptName"
            type="text"
            placeholder="请输入要沉淀的知识文档名称..."
            class="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
            @keydown.enter.prevent="confirmConvertActionToKeep"
          />
        </div>

        <div class="border-t border-zinc-100 dark:border-zinc-800/60 my-1"></div>

        <div class="flex justify-end gap-3 pt-1">
          <button
            class="h-10 inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors active:scale-97 cursor-pointer text-zinc-900 dark:text-zinc-100"
            @click="showKeepPromptDialog = false"
          >
            取消
          </button>
          <button
            class="h-10 inline-flex items-center justify-center rounded-xl bg-zinc-950 dark:bg-zinc-50 hover:bg-zinc-900 dark:hover:bg-zinc-200 px-5 text-sm font-bold text-white dark:text-zinc-950 transition-all active:scale-97 cursor-pointer"
            :disabled="!keepPromptName.trim()"
            @click="confirmConvertActionToKeep"
          >
            生成知识文档
          </button>
        </div>
      </div>
    </div>

    <!-- Celebration Dialog -->
    <div v-if="showCelebrateDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div class="w-full max-w-[450px] rounded-3xl border border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
        <button class="absolute top-5 right-5 h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer transition-colors active:scale-95" @click="showCelebrateDialog = false">
          <X class="h-4 w-4" />
        </button>

        <div class="flex flex-col items-center text-center gap-2">
          <div class="h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-lg">
            <Trophy class="h-6 w-6 animate-bounce" />
          </div>
          <h3 class="text-base font-bold text-foreground">恭喜！项目所有行动已全部达成</h3>
          <p class="text-xs text-muted-foreground leading-relaxed max-w-sm">您已完成了当前看板中的所有计划行动！这标志着项目的开发阶段已经圆满结束。接下来：</p>
          <div class="text-left text-xs bg-muted/20 p-3 rounded-lg border border-border/40 w-full space-y-2 mt-2">
            <div class="flex items-start gap-2">
              <span class="text-primary font-bold">1.</span>
              <span>前往 **S - SERVE 交付** 阶段，一键初始化五大标准核心交付文档，并汇总测试报告。</span>
            </div>
            <div class="flex items-start gap-2">
              <span class="text-primary font-bold">2.</span>
              <span>前往 **K - KEEP 留存** 阶段，进行结项复盘反思，沉淀您的个人成长与技术收获。</span>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3 border-border/40 shrink-0">
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all active:scale-95 shadow-md cursor-pointer" @click="showCelebrateDialog = false">太棒了，去交付与复盘</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.action-list-move,
.action-list-enter-active,
.action-list-leave-active {
  transition: all 0.2s cubic-bezier(0.23, 1, 0.32, 1);
}
.action-list-enter-from,
.action-list-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(4px);
}
.action-list-leave-active {
  position: absolute;
  width: 100%;
}
</style>
