<script setup lang="ts">
import { computed } from "vue";
import { useTaskStore } from "@/stores/taskStore";
import { Target as TargetIcon, ListTodo as ActionIcon, HeartHandshake as ServeIcon, Archive as KeepIcon, Check, ChevronRight } from "@lucide/vue";

const props = defineProps<{
  activeModule: "target" | "action" | "serve" | "keep" | "calendar" | "dashboard";
}>();

const emit = defineEmits<{
  selectModule: [value: "target" | "action" | "serve" | "keep" | "calendar" | "dashboard"];
}>();

const store = useTaskStore();

// 1. Dynamic states calculation for T (Target)
const projectTargets = computed(() => store.targets.filter((t) => t.projectId === store.activeProjectId));
const targetStatus = computed(() => {
  if (projectTargets.value.length === 0) {
    return { state: "pending", label: "未设定", percent: 0, details: "暂无项目目标与里程碑" };
  }
  const totalMilestones = projectTargets.value.reduce((acc, t) => acc + t.milestones.length, 0);
  if (totalMilestones === 0) {
    return { state: "in_progress", label: "目标已立", percent: 50, details: `已设定 ${projectTargets.value.length} 个目标，无里程碑` };
  }
  const completedMilestones = projectTargets.value.reduce((acc, t) => acc + t.milestones.filter((m) => m.completed).length, 0);
  const percent = Math.round((completedMilestones / totalMilestones) * 100);

  if (completedMilestones === totalMilestones) {
    return { state: "completed", label: "目标达成", percent: 100, details: `所有 ${totalMilestones} 个里程碑全数完成` };
  }
  return { state: "in_progress", label: "推进中", percent, details: `里程碑已完成 ${completedMilestones}/${totalMilestones}` };
});

// 2. Dynamic states calculation for A (Action)
const projectActions = computed(() => store.actions.filter((a) => a.projectId === store.activeProjectId));
const actionStatus = computed(() => {
  if (projectActions.value.length === 0) {
    return { state: "pending", label: "待设定", percent: 0, details: "未分配具体的行动卡片" };
  }
  const totalActions = projectActions.value.length;
  const doneActions = projectActions.value.filter((a) => a.status === "done").length;
  const inProgressActions = projectActions.value.filter((a) => a.status === "in_progress").length;
  const percent = Math.round((doneActions / totalActions) * 100);

  if (doneActions === totalActions) {
    return { state: "completed", label: "行动告捷", percent: 100, details: `全部 ${totalActions} 项任务均已结项` };
  }
  return { state: "in_progress", label: "执行中", percent, details: `已完成 ${doneActions}/${totalActions} (进行中: ${inProgressActions})` };
});

// 3. Dynamic states calculation for S (Serve)
const projectServes = computed(() => store.serves.filter((s) => s.projectId === store.activeProjectId));
const serveStatus = computed(() => {
  if (projectServes.value.length === 0) {
    return { state: "pending", label: "待交付", percent: 0, details: "暂无交付计划与验收记录" };
  }

  const totalServes = projectServes.value.length;
  const acceptedServes = projectServes.value.filter((serve) => serve.status === "accepted" || serve.acceptanceStatus === "accepted").length;
  const changesRequestedServes = projectServes.value.filter((serve) => serve.status === "changes_requested" || serve.acceptanceStatus === "changes_requested").length;
  const deliveredServes = projectServes.value.filter((serve) => serve.status === "delivered").length;
  const activeServes = projectServes.value.filter((serve) => serve.status === "active").length;
  const checklistTotal = projectServes.value.reduce((acc, serve) => acc + (serve.acceptanceChecklist?.length ?? 0), 0);
  const checklistDone = projectServes.value.reduce((acc, serve) => acc + (serve.acceptanceChecklist?.filter((item) => item.completed).length ?? 0), 0);
  const isCompleted = acceptedServes === totalServes;
  const percent = isCompleted ? 100 : Math.max(25, Math.round((acceptedServes / totalServes) * 100));
  const checklistDetails = checklistTotal > 0 ? `，验收清单 ${checklistDone}/${checklistTotal}` : "";

  if (isCompleted) {
    return { state: "completed", label: "验收通过", percent, details: `全部 ${totalServes} 项交付已验收通过${checklistDetails}` };
  }

  if (changesRequestedServes > 0) {
    return { state: "in_progress", label: "需返工", percent, details: `${changesRequestedServes} 项交付需返工，已验收 ${acceptedServes}/${totalServes}${checklistDetails}` };
  }

  if (deliveredServes > 0) {
    return { state: "in_progress", label: "待验收", percent, details: `${deliveredServes} 项已交付待验收，已验收 ${acceptedServes}/${totalServes}${checklistDetails}` };
  }

  return {
    state: "in_progress",
    label: activeServes > 0 ? "交付中" : "规划中",
    percent,
    details: activeServes > 0 ? `${activeServes} 项交付推进中，已验收 ${acceptedServes}/${totalServes}${checklistDetails}` : `${totalServes} 项交付计划已建立${checklistDetails}`,
  };
});

// 4. Dynamic states calculation for K (Keep)
const projectKeeps = computed(() => store.keeps.filter((k) => k.projectId === store.activeProjectId));
const keepStatus = computed(() => {
  if (projectKeeps.value.length === 0) {
    return { state: "pending", label: "待沉淀", percent: 0, details: "核心文件及代码待留存归档" };
  }
  const totalKeeps = projectKeeps.value.length;

  // 只有当 T、A、S 阶段全部完成时，K 才能标记为 completed
  const upstreamCompleted = targetStatus.value.state === "completed" && actionStatus.value.state === "completed" && serveStatus.value.state === "completed";

  if (upstreamCompleted) {
    return {
      state: "completed",
      label: "已留存",
      percent: 100,
      details: `已完成 ${totalKeeps} 项核心资产归档`,
    };
  }

  // 否则即使已有沉淀资产，也属于“沉淀中”状态（百分比限制在 90% 以内）
  const percent = Math.min(90, Math.round((totalKeeps / Math.max(1, projectServes.value.length)) * 100)) || 50;
  return {
    state: "in_progress",
    label: "沉淀中",
    percent,
    details: `已归档 ${totalKeeps} 项核心资产，项目其他阶段仍在推进中`,
  };
});

// Current active project details
const activeProjectName = computed(() => {
  const proj = store.projects.find((p) => p.id === store.activeProjectId);
  return proj ? proj.name : "项目管理器";
});

// Step Node Configurations
const steps = computed(() => [
  {
    id: "target" as const,
    letter: "T",
    title: "TARGET 目标",
    icon: TargetIcon,
    status: targetStatus.value,
    color: "from-emerald-500 to-teal-600",
    glowColor: "rgba(16,185,129,0.45)",
    activeRing: "ring-emerald-500/30 border-emerald-500 text-emerald-400",
  },
  {
    id: "action" as const,
    letter: "A",
    title: "ACTION 行动",
    icon: ActionIcon,
    status: actionStatus.value,
    color: "from-indigo-500 to-blue-600",
    glowColor: "rgba(99,102,241,0.45)",
    activeRing: "ring-indigo-500/30 border-indigo-500 text-indigo-400",
  },
  {
    id: "serve" as const,
    letter: "S",
    title: "SERVE 交付",
    icon: ServeIcon,
    status: serveStatus.value,
    color: "from-rose-500 to-pink-600",
    glowColor: "rgba(244,63,94,0.45)",
    activeRing: "ring-rose-500/30 border-rose-500 text-rose-400",
  },
  {
    id: "keep" as const,
    letter: "K",
    title: "KEEP 留存",
    icon: KeepIcon,
    status: keepStatus.value,
    color: "from-amber-500 to-orange-600",
    glowColor: "rgba(245,158,11,0.45)",
    activeRing: "ring-amber-500/30 border-amber-500 text-amber-400",
  },
]);

// Determine connection line styling based on surrounding step states
function getLineClass(idx: number) {
  const currentStep = steps.value[idx];
  const nextStep = steps.value[idx + 1];

  if (currentStep.status.state === "completed" && nextStep.status.state === "completed") {
    return "bg-gradient-to-r from-primary/80 to-primary/80";
  }
  if (currentStep.status.state === "completed" || currentStep.id === props.activeModule) {
    return "bg-gradient-to-r from-primary/60 to-muted-foreground/30 animate-pulse";
  }
  return "bg-muted border-dashed border-t border-muted-foreground/20";
}
</script>

<template>
  <div class="w-full shrink-0 border-b border-border bg-card/30 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none">
    <!-- Project Heading Info -->
    <div class="flex items-center gap-2.5">
      <div class="h-6 w-1 rounded-full bg-primary" />
      <div>
        <h2 class="text-sm font-semibold tracking-wide text-foreground flex items-center gap-1.5">
          {{ activeProjectName }}
          <span class="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider">T-A-S-K 步骤线路图</span>
        </h2>
      </div>
    </div>

    <!-- Steps Timeline Navigator -->
    <div class="flex items-center flex-wrap gap-2 md:gap-3">
      <div v-for="(step, idx) in steps" :key="step.id" class="flex items-center">
        <!-- Interactive Step Node -->
        <div class="group relative flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300" :class="[activeModule === step.id ? 'bg-muted/60 shadow-inner' : 'hover:bg-muted/30']" @click="emit('selectModule', step.id)">
          <!-- Glowing Node Bubble -->
          <div
            class="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 relative border shrink-0"
            :class="[
              step.status.state === 'completed' ? 'bg-gradient-to-br border-transparent text-white ' + step.color : '',
              step.status.state === 'in_progress' && activeModule !== step.id ? 'border-primary/60 text-primary bg-primary/5' : '',
              step.status.state === 'pending' && activeModule !== step.id ? 'border-muted-foreground/30 text-muted-foreground/60 bg-muted/10' : '',
              activeModule === step.id ? 'ring-4 scale-110 shadow-lg border-primary ' + step.activeRing : '',
            ]"
            :style="activeModule === step.id ? { '--glow-color': step.glowColor, animation: 'breathe 2.5s infinite ease-in-out' } : {}"
          >
            <!-- Check Icon for Completed Steps -->
            <Check v-if="step.status.state === 'completed'" class="h-3.5 w-3.5 stroke-[3]" />
            <span v-else>{{ step.letter }}</span>
          </div>

          <!-- Step Label -->
          <div class="flex flex-col items-start min-w-0 pr-1">
            <span class="text-xs font-semibold tracking-wider transition-colors" :class="[activeModule === step.id ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground']">
              {{ step.title.split(" ")[1] }}
            </span>
            <span class="text-[9px] text-muted-foreground/70 scale-95 origin-left tracking-wide truncate max-w-[70px]">
              {{ step.status.label }}
            </span>
          </div>

          <!-- Hover Details Tooltip Card -->
          <div
            class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-52 p-3 bg-popover text-popover-foreground text-xs rounded-xl shadow-xl border border-border/80 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 z-50 transform translate-y-1 group-hover:translate-y-0"
          >
            <div class="flex items-center justify-between font-bold border-b pb-1.5 border-border/40">
              <span class="text-foreground flex items-center gap-1">
                <component :is="step.icon" class="h-3.5 w-3.5" />
                {{ step.title }}
              </span>
              <span class="text-[10px] text-primary">{{ step.status.percent }}%</span>
            </div>
            <p class="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              {{ step.status.details }}
            </p>
          </div>
        </div>

        <!-- Connection Line (not rendered for the last step) -->
        <div v-if="idx < steps.length - 1" class="h-[2px] w-6 md:w-9 mx-1 shrink-0 rounded-full transition-all duration-300" :class="getLineClass(idx)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes breathe {
  0%,
  100% {
    box-shadow: 0 0 4px var(--glow-color);
  }
  50% {
    box-shadow: 0 0 16px var(--glow-color);
  }
}
</style>
