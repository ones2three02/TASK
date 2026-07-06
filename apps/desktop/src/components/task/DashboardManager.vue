<script setup lang="ts">
import { computed, ref } from "vue";
import { useTaskStore } from "@/stores/taskStore";
import { calculateProjectOverview } from "@/lib/taskPlanning";
import { Activity, AlertTriangle, Archive, ArrowRight, CheckCircle2, Handshake, ListTodo, Target, TrendingUp } from "@lucide/vue";
import ProjectIllustration from "./ProjectIllustration.vue";
import IllustrationModal from "./IllustrationModal.vue";

const showIllustrationModal = ref(false);

const emit = defineEmits<{
  selectModule: [module: "target" | "action" | "serve" | "keep"];
  "run-ai-diagnostic": [];
}>();

const taskStore = useTaskStore();

const activeProject = computed(() => taskStore.projects.find((project) => project.id === taskStore.activeProjectId));
const projectTargets = computed(() => taskStore.targets.filter((target) => target.projectId === taskStore.activeProjectId));
const projectActions = computed(() => taskStore.actions.filter((action) => action.projectId === taskStore.activeProjectId));
const projectServes = computed(() => taskStore.serves.filter((serve) => serve.projectId === taskStore.activeProjectId));
const projectKeeps = computed(() => taskStore.keeps.filter((keep) => keep.projectId === taskStore.activeProjectId));

const overview = computed(() => {
  if (!activeProject.value) return null;
  return calculateProjectOverview(activeProject.value, projectTargets.value, projectActions.value, projectServes.value, projectKeeps.value);
});

const stageCards = computed(() => {
  if (!overview.value) return [];
  return [
    {
      id: "target" as const,
      title: "Target 目标",
      icon: Target,
      percent: overview.value.targetProgress.percent,
      primary: `${overview.value.targetProgress.completedMilestones}/${overview.value.targetProgress.totalMilestones}`,
      secondary: `${overview.value.targetProgress.total} 个目标`,
      color: "text-emerald-500",
      bar: "bg-emerald-500",
    },
    {
      id: "action" as const,
      title: "Action 行动",
      icon: ListTodo,
      percent: overview.value.actionStats.percent,
      primary: `${overview.value.actionStats.done}/${overview.value.actionStats.total}`,
      secondary: `${overview.value.actionStats.overdue} 项逾期`,
      color: "text-indigo-500",
      bar: "bg-indigo-500",
    },
    {
      id: "serve" as const,
      title: "Serve 交付",
      icon: Handshake,
      percent: overview.value.serveStats.percent,
      primary: `${overview.value.serveStats.delivered}/${overview.value.serveStats.total}`,
      secondary: `${overview.value.serveStats.accepted} 项已验收`,
      color: "text-amber-500",
      bar: "bg-amber-500",
    },
    {
      id: "keep" as const,
      title: "Keep 存档",
      icon: Archive,
      percent: overview.value.keepStats.percent,
      primary: `${overview.value.keepStats.total}`,
      secondary: "项资产沉淀",
      color: "text-purple-500",
      bar: "bg-purple-500",
    },
  ];
});

const qualityGateCards = computed(() => {
  if (!overview.value) return [];
  const severityOrder = { danger: 0, warning: 1, info: 2 };
  return [...overview.value.qualityGates].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
});

function getQualityGateClass(severity: "info" | "warning" | "danger") {
  switch (severity) {
    case "danger":
      return "border-red-500/30 bg-red-500/5 text-red-500";
    case "warning":
      return "border-amber-500/30 bg-amber-500/5 text-amber-500";
    case "info":
      return "border-blue-500/30 bg-blue-500/5 text-blue-500";
  }
}

function getQualityGateTarget(stage: "target" | "action" | "serve" | "keep") {
  return stage;
}
</script>

<template>
  <div class="flex-1 min-w-0 overflow-y-auto bg-background/50 p-6 flex flex-col gap-6">
    <div v-if="overview && activeProject" class="flex flex-col gap-6">
      <section class="rounded-xl border border-border/40 bg-muted/10 p-5">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Activity class="h-4 w-4 text-primary" />
              项目总览
            </div>
            <h2 class="mt-2 text-2xl font-semibold text-foreground break-words">{{ activeProject.name }}</h2>
            <p class="mt-2.5 max-w-3xl text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {{ activeProject.description || "当前项目还没有填写背景说明。" }}
            </p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4 shrink-0 w-full lg:w-auto">
            <!-- Project Illustration Preview Card -->
            <div class="w-full sm:w-[240px]">
              <ProjectIllustration :projectId="activeProject.id" @manage="showIllustrationModal = true" />
            </div>

            <!-- Overall Progress Card -->
            <div class="w-full sm:w-[220px] rounded-lg border border-border/40 bg-background/60 p-4 flex flex-col justify-between hover:shadow-md transition-all duration-200">
              <div>
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>闭环完成度</span>
                  <TrendingUp class="h-4 w-4 text-primary" />
                </div>
                <div class="mt-2 flex items-end gap-2">
                  <span class="text-3xl font-semibold tabular-nums">{{ overview.overallPercent }}%</span>
                  <span class="pb-1 text-xs text-muted-foreground">T/A/S/K 加权</span>
                </div>
              </div>
              <div class="mt-4">
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${overview.overallPercent}%` }" />
                </div>
              </div>
            </div>

            <div class="w-full sm:w-[220px] rounded-lg border border-border/40 bg-background/60 p-4 flex flex-col justify-between hover:shadow-md transition-all duration-200">
              <div>
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>治理成熟度</span>
                  <AlertTriangle class="h-4 w-4 text-amber-500" />
                </div>
                <div class="mt-2 flex items-end gap-2">
                  <span class="text-3xl font-semibold tabular-nums">{{ overview.qualityGateSummary.score }}</span>
                  <span class="pb-1 text-xs text-muted-foreground">{{ overview.qualityGateSummary.label }}</span>
                </div>
              </div>
              <div class="mt-3 grid grid-cols-3 gap-1.5 text-[10px]">
                <span class="rounded bg-red-500/10 px-1.5 py-1 text-center font-semibold text-red-500">D {{ overview.qualityGateSummary.bySeverity.danger }}</span>
                <span class="rounded bg-amber-500/10 px-1.5 py-1 text-center font-semibold text-amber-500">W {{ overview.qualityGateSummary.bySeverity.warning }}</span>
                <span class="rounded bg-blue-500/10 px-1.5 py-1 text-center font-semibold text-blue-500">I {{ overview.qualityGateSummary.bySeverity.info }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <button v-for="stage in stageCards" :key="stage.id" class="rounded-xl border border-border/40 bg-background/50 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-muted/20 active:scale-[0.97] cursor-pointer" @click="emit('selectModule', stage.id)">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <component :is="stage.icon" class="h-4 w-4" :class="stage.color" />
              <span class="text-sm font-semibold">{{ stage.title }}</span>
            </div>
            <ArrowRight class="h-4 w-4 text-muted-foreground" />
          </div>
          <div class="mt-4 flex items-end justify-between gap-3">
            <div>
              <div class="text-xl font-semibold tabular-nums">{{ stage.primary }}</div>
              <div class="mt-1 text-xs text-muted-foreground">{{ stage.secondary }}</div>
            </div>
            <div class="text-sm font-semibold tabular-nums" :class="stage.color">{{ stage.percent }}%</div>
          </div>
          <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div class="h-full rounded-full transition-all" :class="stage.bar" :style="{ width: `${stage.percent}%` }" />
          </div>
        </button>
      </section>

      <section v-if="qualityGateCards.length" class="rounded-xl border border-border/40 bg-background/50 p-5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle class="h-4 w-4 text-amber-500" />
              生命周期质量门提醒
            </h3>
            <p class="mt-1 text-xs text-muted-foreground">这些提醒不会阻断流程，但建议逐项补齐，以达到个人企业级交付标准。</p>
          </div>
          <span class="rounded-full border border-border/40 px-2.5 py-1 text-xs text-muted-foreground">{{ qualityGateCards.length }} 项</span>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <button
            v-for="gate in qualityGateCards"
            :key="gate.id"
            class="rounded-lg border border-border/40 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-muted/20 active:scale-[0.97] cursor-pointer"
            :class="getQualityGateClass(gate.severity)"
            @click="emit('selectModule', getQualityGateTarget(gate.stage))"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-foreground">{{ gate.title }}</div>
                <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{{ gate.message }}</p>
              </div>
              <span class="rounded-full bg-background/70 px-2 py-0.5 text-xs font-semibold tabular-nums">{{ gate.count }}</span>
            </div>
          </button>
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div class="rounded-xl border border-border/40 bg-background/50 p-5">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">行动状态</h3>
            <button class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer active:scale-95 transition-all" @click="emit('selectModule', 'action')">
              进入看板
              <ArrowRight class="h-3.5 w-3.5" />
            </button>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div class="rounded-lg border border-border/40 bg-muted/10 p-3">
              <div class="text-xs text-muted-foreground">待办</div>
              <div class="mt-1 text-xl font-semibold">{{ overview.actionStats.todo }}</div>
            </div>
            <div class="rounded-lg border border-border/40 bg-muted/10 p-3">
              <div class="text-xs text-muted-foreground">进行中</div>
              <div class="mt-1 text-xl font-semibold">{{ overview.actionStats.inProgress }}</div>
            </div>
            <div class="rounded-lg border border-border/40 bg-muted/10 p-3">
              <div class="text-xs text-muted-foreground">已完成</div>
              <div class="mt-1 text-xl font-semibold">{{ overview.actionStats.done }}</div>
            </div>
            <div class="rounded-lg border border-border/40 bg-muted/10 p-3">
              <div class="text-xs text-muted-foreground">高优先级</div>
              <div class="mt-1 text-xl font-semibold">{{ overview.actionStats.highPriority }}</div>
            </div>
            <div class="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-red-500 font-medium">
              <div class="text-xs">已逾期</div>
              <div class="mt-1 text-xl font-semibold flex items-center gap-1.5">
                {{ overview.actionStats.overdue }}
                <span v-if="overview.actionStats.overdue > 0" class="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-border/40 bg-background/50 p-5">
          <div class="flex items-center gap-2">
            <AlertTriangle v-if="overview.actionStats.overdue > 0" class="h-4 w-4 text-red-500 animate-pulse" />
            <CheckCircle2 v-else class="h-4 w-4 text-emerald-500" />
            <h3 class="text-sm font-semibold">下一步建议</h3>
          </div>
          <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
            {{ overview.recommendation.message }}
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all active:scale-[0.97] cursor-pointer"
              @click="emit('selectModule', overview.recommendation.stage === 'dashboard' ? 'target' : overview.recommendation.stage)"
            >
              去处理
            </button>
            <button
              class="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-md shadow-indigo-500/20 px-4 text-sm font-semibold transition-all active:scale-[0.97] cursor-pointer"
              @click="emit('run-ai-diagnostic')"
            >
              🧠 深度 AI 智能诊断
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- Illustration Customizer Modal -->
    <IllustrationModal v-if="activeProject" :open="showIllustrationModal" :projectId="activeProject.id" @close="showIllustrationModal = false" />
  </div>
</template>
