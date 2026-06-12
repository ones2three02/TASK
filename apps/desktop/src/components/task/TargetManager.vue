<script setup lang="ts">
import { ref, computed } from "vue";
import { useTaskStore, type Target } from "@/stores/taskStore";
import { Plus, Target as TargetIcon, Calendar, Trash2, Edit, CheckCircle2, Circle, AlertCircle, X, Sparkles } from "@lucide/vue";
import AiParserModal from "@/components/task/AiParserModal.vue";

const showAiModal = ref(false);

const taskStore = useTaskStore();

// Filter targets for active project
const projectTargets = computed(() => {
  return taskStore.targets.filter((t) => t.projectId === taskStore.activeProjectId);
});

// Calculate overall progress of the current project
const overallProgress = computed(() => {
  const targets = projectTargets.value;
  if (targets.length === 0) return 0;
  let totalMilestones = 0;
  let completedMilestones = 0;

  targets.forEach((t) => {
    if (t.milestones.length === 0) {
      if (t.status === "completed") {
        totalMilestones += 1;
        completedMilestones += 1;
      } else {
        totalMilestones += 1;
      }
    } else {
      totalMilestones += t.milestones.length;
      completedMilestones += t.milestones.filter((m) => m.completed).length;
    }
  });

  return totalMilestones === 0 ? 0 : Math.round((completedMilestones / totalMilestones) * 100);
});

// Form and dialog state
const showDialog = ref(false);
const isEdit = ref(false);
const editId = ref("");
const formTitle = ref("");
const formDescription = ref("");
const formMilestones = ref<{ title: string; completed: boolean }[]>([]);
const newMilestoneText = ref("");

function openAddDialog() {
  isEdit.value = false;
  editId.value = "";
  formTitle.value = "";
  formDescription.value = "";
  formMilestones.value = [];
  showDialog.value = true;
}

function openEditDialog(target: Target) {
  isEdit.value = true;
  editId.value = target.id;
  formTitle.value = target.title;
  formDescription.value = target.description;
  formMilestones.value = target.milestones.map((m) => ({ ...m }));
  showDialog.value = true;
}

function addMilestone() {
  if (newMilestoneText.value.trim()) {
    formMilestones.value.push({ title: newMilestoneText.value.trim(), completed: false });
    newMilestoneText.value = "";
  }
}

function removeMilestone(index: number) {
  formMilestones.value.splice(index, 1);
}

function submitForm() {
  if (!formTitle.value.trim()) return;

  if (isEdit.value) {
    const existing = taskStore.targets.find((t) => t.id === editId.value);
    if (existing) {
      existing.title = formTitle.value.trim();
      existing.description = formDescription.value.trim();
      existing.milestones = formMilestones.value.map((m) => {
        const anyM = m as any;
        return {
          id: anyM.id || Math.random().toString(36).substring(2, 9),
          title: m.title,
          completed: m.completed,
        };
      });
      // Auto compute status
      const allDone = existing.milestones.length > 0 && existing.milestones.every((m) => m.completed);
      existing.status = allDone ? "completed" : "pending";
      taskStore.updateTarget(existing);
    }
  } else {
    taskStore.addTarget(formTitle.value.trim(), formDescription.value.trim(), formMilestones.value);
  }

  showDialog.value = false;
}

function deleteTarget(id: string) {
  if (confirm("确定要删除这个目标吗？这将会删除属于它的所有里程碑。")) {
    taskStore.deleteTarget(id);
  }
}

function toggleMilestone(target: Target, milestoneId: string) {
  const targetCopy = { ...target };
  const milestone = targetCopy.milestones.find((m) => m.id === milestoneId);
  if (milestone) {
    milestone.completed = !milestone.completed;

    // Auto set completed if all milestones are checked
    const allDone = targetCopy.milestones.every((m) => m.completed);
    targetCopy.status = allDone ? "completed" : "pending";

    taskStore.updateTarget(targetCopy);
  }
}

function toggleTargetStatus(target: Target) {
  const targetCopy = { ...target };
  targetCopy.status = targetCopy.status === "completed" ? "pending" : "completed";
  // Sync milestones completion status
  if (targetCopy.status === "completed") {
    targetCopy.milestones.forEach((m) => (m.completed = true));
  } else {
    targetCopy.milestones.forEach((m) => (m.completed = false));
  }
  taskStore.updateTarget(targetCopy);
}

function getTargetProgress(target: Target) {
  if (target.milestones.length === 0) {
    return target.status === "completed" ? 100 : 0;
  }
  const completed = target.milestones.filter((m) => m.completed).length;
  return Math.round((completed / target.milestones.length) * 100);
}
</script>

<template>
  <div class="flex-1 min-w-0 overflow-y-auto bg-background/50 p-6 flex flex-col gap-6">
    <!-- Header Summary -->
    <div class="flex flex-col gap-4 p-5 rounded-xl border bg-muted/10 backdrop-blur-md">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold flex items-center gap-2">
            <TargetIcon class="h-5 w-5 text-emerald-500" />
            T - TARGET 目标规划
          </h2>
          <p class="text-xs text-muted-foreground mt-1">清晰定义项目的核心目标和里程碑，统筹项目成功路线图。</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="inline-flex h-9 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 px-4 text-sm font-medium transition-all shadow-sm gap-1.5" @click="showAiModal = true">
            <Sparkles class="h-4 w-4" />
            AI 智能拆解
          </button>
          <button class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1" @click="openAddDialog">
            <Plus class="h-4 w-4" />
            设定目标
          </button>
        </div>
      </div>

      <!-- Overall progress -->
      <div class="space-y-2 mt-2" v-if="projectTargets.length > 0">
        <div class="flex justify-between text-xs font-medium">
          <span class="text-muted-foreground">项目总进度</span>
          <span class="text-emerald-500">{{ overallProgress }}%</span>
        </div>
        <div class="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out" :style="{ width: overallProgress + '%' }" />
        </div>
      </div>
    </div>

    <!-- Targets List -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2" v-if="projectTargets.length > 0">
      <div v-for="target in projectTargets" :key="target.id" class="group relative flex flex-col gap-4 p-5 rounded-xl border bg-background/40 hover:bg-muted/10 transition-all duration-300 shadow-sm hover:shadow-md border-border/80">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <h3 class="font-medium text-base truncate flex items-center gap-2">
              <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" :class="target.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'" />
              <span :class="{ 'line-through text-muted-foreground': target.status === 'completed' }">
                {{ target.title }}
              </span>
            </h3>
            <p class="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap leading-relaxed line-clamp-3">
              {{ target.description || "无详细描述" }}
            </p>
          </div>

          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button class="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground" @click="openEditDialog(target)">
              <Edit class="h-3.5 w-3.5" />
            </button>
            <button class="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click="deleteTarget(target.id)">
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <!-- Milestones list -->
        <div class="space-y-2.5 border-t pt-3 mt-auto border-border/40">
          <div class="flex justify-between items-center text-xs text-muted-foreground mb-1">
            <span>里程碑任务</span>
            <span>已完成 {{ target.milestones.filter((m) => m.completed).length }}/{{ target.milestones.length }}</span>
          </div>

          <div class="grid gap-2 max-h-40 overflow-y-auto pr-1">
            <button v-for="m in target.milestones" :key="m.id" class="flex items-center gap-2 text-xs py-1.5 px-2.5 rounded bg-muted/30 hover:bg-muted/60 text-left transition-colors" @click="toggleMilestone(target, m.id)">
              <CheckCircle2 v-if="m.completed" class="h-4 w-4 text-emerald-500 shrink-0" />
              <Circle v-else class="h-4 w-4 text-muted-foreground shrink-0" />
              <span :class="{ 'line-through text-muted-foreground/60': m.completed }" class="truncate">
                {{ m.title }}
              </span>
            </button>
            <div v-if="target.milestones.length === 0" class="text-xs text-muted-foreground/50 italic py-2 text-center">暂无里程碑，点击编辑目标来增加。</div>
          </div>

          <!-- Progress slider for target -->
          <div class="flex items-center gap-3 mt-2">
            <div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 transition-all duration-300" :style="{ width: getTargetProgress(target) + '%' }" />
            </div>
            <span class="text-[10px] font-medium text-emerald-500 shrink-0">{{ getTargetProgress(target) }}%</span>
            <button
              class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border border-border shrink-0 hover:bg-muted"
              :class="target.status === 'completed' ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' : 'text-muted-foreground hover:text-foreground'"
              @click="toggleTargetStatus(target)"
            >
              {{ target.status === "completed" ? "已达成" : "标记达成" }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="flex-1 flex flex-col items-center justify-center gap-3 p-12 text-center rounded-xl border border-dashed border-border/80 bg-background/20">
      <div class="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground">
        <TargetIcon class="h-6 w-6" />
      </div>
      <div>
        <h3 class="font-medium text-sm">暂未设定项目目标</h3>
        <p class="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">T - TARGET 是达成项目的北极星。点击“设定目标”添加第一项核心目标和执行里程碑。</p>
      </div>
      <button class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1 mt-2" @click="openAddDialog">
        <Plus class="h-4 w-4" />
        设定第一个目标
      </button>
    </div>

    <!-- Dialog Modal -->
    <div v-if="showDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div class="w-full max-w-[500px] rounded-xl border bg-background p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground" @click="showDialog = false">
          <X class="h-4 w-4" />
        </button>

        <h3 class="text-base font-semibold">{{ isEdit ? "编辑目标" : "设定新目标" }}</h3>

        <div class="flex flex-col gap-4 overflow-y-auto max-h-[60vh] pr-1">
          <!-- Title -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">目标名称</label>
            <input
              v-model="formTitle"
              type="text"
              placeholder="例如：完成系统核心架构研发"
              class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <!-- Description -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">描述</label>
            <textarea
              v-model="formDescription"
              placeholder="描述此目标的具体达成效果、验收标准等..."
              rows="3"
              class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <!-- Milestones Builder -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">拆解里程碑（Milestones）</label>
            <div class="flex gap-2">
              <input
                v-model="newMilestoneText"
                type="text"
                placeholder="添加具体的子任务/指标..."
                class="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                @keydown.enter.prevent="addMilestone"
              />
              <button class="h-9 inline-flex items-center justify-center rounded-lg bg-muted px-3 text-xs font-medium hover:bg-muted/80 shrink-0" @click="addMilestone">添加</button>
            </div>

            <!-- Milestones List inside Dialog -->
            <div class="space-y-1.5 mt-2 bg-muted/20 p-2.5 rounded-lg border border-border/40">
              <div v-for="(m, idx) in formMilestones" :key="idx" class="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/30 text-xs">
                <div class="flex items-center gap-2 truncate">
                  <button type="button" @click="m.completed = !m.completed" class="text-muted-foreground hover:text-emerald-500">
                    <CheckCircle2 v-if="m.completed" class="h-4 w-4 text-emerald-500" />
                    <Circle v-else class="h-4 w-4" />
                  </button>
                  <span :class="{ 'line-through text-muted-foreground': m.completed }" class="truncate">
                    {{ m.title }}
                  </span>
                </div>
                <button type="button" class="text-muted-foreground hover:text-red-500" @click="removeMilestone(idx)">
                  <X class="h-3 w-3" />
                </button>
              </div>
              <div v-if="formMilestones.length === 0" class="text-center text-xs text-muted-foreground/60 py-2 italic">没有设置子里程碑，达成目标更易失焦，建议添加。</div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3 border-border/40">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors" @click="showDialog = false">取消</button>
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md" :disabled="!formTitle.trim()" @click="submitForm">保存目标</button>
        </div>
      </div>
    </div>
    <AiParserModal :open="showAiModal" @close="showAiModal = false" />
  </div>
</template>
