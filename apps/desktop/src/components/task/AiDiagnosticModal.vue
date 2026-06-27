<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useSettingsStore, AI_PROVIDER_PRESETS } from "@/stores/settingsStore";
import { useTaskStore } from "@/stores/taskStore";
import { aiComplete } from "@/lib/api";
import { useToast } from "@/composables/useToast";
import { X, Sparkles, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from "@lucide/vue";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const settingsStore = useSettingsStore();
const taskStore = useTaskStore();
const { toast } = useToast();

const step = ref<"init" | "loading" | "success" | "unconfigured" | "error">("init");
const errorMsg = ref("");

interface DiagnosticResult {
  score: number;
  summary: string;
  details: Array<{
    type: "warning" | "suggestion" | "success";
    title: string;
    message: string;
  }>;
}

const diagnosticResult = ref<DiagnosticResult | null>(null);

const activeProjectId = computed(() => taskStore.activeProjectId);
const currentProject = computed(() => taskStore.projects.find((p) => p.id === activeProjectId.value));
const cacheKey = computed(() => `task-ai-diagnostic-${activeProjectId.value}`);

// Validate AI configuration
const isAiConfigured = computed(() => {
  const cfg = settingsStore.aiConfig;
  const preset = AI_PROVIDER_PRESETS[cfg.provider];
  return !!cfg.endpoint && !!cfg.model && (!preset?.requiresApiKey || !!cfg.apiKey);
});

// Load result from localStorage cache
function loadCache(): boolean {
  if (!activeProjectId.value) return false;
  const cached = localStorage.getItem(cacheKey.value);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (typeof parsed.score === "number" && typeof parsed.summary === "string" && Array.isArray(parsed.details)) {
        diagnosticResult.value = parsed;
        step.value = "success";
        return true;
      }
    } catch (e) {
      localStorage.removeItem(cacheKey.value);
    }
  }
  return false;
}

// System Prompt for PMP diagnostic mentor
const systemPrompt = `你是一个专业的 PMP 项目管理导师。你的任务是对用户输入的项目（包括 Targets 目标、Actions 行动、Serves 交付、Keeps 存档组成的树状 JSON 数据）进行全面审视，给出项目组织完备度、状态合理性的深度健康诊断。

请以严格的 JSON 格式输出你的诊断结果，不需要任何 markdown 包装标记（如 \`\`\`json 等），只需返回 JSON 本身。
JSON 的数据结构必须完全符合以下格式：
{
  "score": number, // 0 - 100 的健康得分
  "summary": "string", // 限 150 字内的专家总评与整体质量诊断
  "details": [
    {
      "type": "warning" | "suggestion" | "success", // warning: 警告（如孤立任务、缺乏里程碑等）; suggestion: 建议（如里程碑拆解优化）; success: 卓越实践项
      "title": "string", // 条目标题
      "message": "string" // 详细阐述
    }
  ]
}`;

// Format project data to minimize tokens
function getLightweightProjectData() {
  const pId = activeProjectId.value;
  const projectTargets = taskStore.targets
    .filter((t) => t.projectId === pId)
    .map((t) => ({
      title: t.title,
      description: t.description,
      status: t.status,
      milestones: t.milestones.map((m) => ({ title: m.title, completed: m.completed })),
      scope: t.scope,
      outOfScope: t.outOfScope,
      successCriteria: t.successCriteria?.map((s) => ({ title: s.title, completed: s.completed })),
      risks: t.risks?.map((r) => ({ title: r.title, completed: r.completed })),
    }));

  const projectActions = taskStore.actions
    .filter((a) => a.projectId === pId)
    .map((a) => ({
      title: a.title,
      description: a.description,
      status: a.status,
      priority: a.priority,
      dueDate: a.dueDate,
      serveId: a.serveId,
      blocked: a.blocked,
      blockerReason: a.blockerReason,
      targetId: a.targetId,
      milestoneId: a.milestoneId,
    }));

  const projectServes = taskStore.serves
    .filter((s) => s.projectId === pId)
    .map((s) => ({
      title: s.title,
      description: s.description,
      deliverable: s.deliverable,
      client: s.client,
      status: s.status,
      acceptanceStatus: s.acceptanceStatus,
      acceptanceChecklist: s.acceptanceChecklist?.map((c) => ({ title: c.title, completed: c.completed })),
    }));

  const projectKeeps = taskStore.keeps
    .filter((k) => k.projectId === pId)
    .map((k) => ({
      name: k.name,
      type: k.type,
      content: k.content ? (k.content.length > 500 ? k.content.slice(0, 500) + "..." : k.content) : "",
      relatedServeId: k.relatedServeId,
      relatedActionId: k.relatedActionId,
    }));

  return {
    projectName: currentProject.value?.name || "",
    projectDescription: currentProject.value?.description || "",
    targets: projectTargets,
    actions: projectActions,
    serves: projectServes,
    keeps: projectKeeps,
  };
}

function cleanAndParseDiagnosticResult(rawText: string): DiagnosticResult {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```[a-zA-Z]*\n/, "")
      .replace(/\n```$/, "")
      .trim();
  }
  return JSON.parse(cleaned);
}

async function runDiagnosis() {
  if (!activeProjectId.value) {
    toast("诊断失败：当前没有选中任何活动项目。", 5000);
    return;
  }

  step.value = "loading";
  errorMsg.value = "";

  try {
    const data = getLightweightProjectData();
    const payload = JSON.stringify(data, null, 2);

    const responseText = await aiComplete({
      config: settingsStore.aiConfig,
      systemPrompt: systemPrompt,
      messages: [{ role: "user", content: payload }],
      temperature: 0.2,
    });

    const parsed = cleanAndParseDiagnosticResult(responseText);

    if (typeof parsed.score !== "number" || typeof parsed.summary !== "string" || !Array.isArray(parsed.details)) {
      throw new Error("AI 返回的数据格式不符合预期规范");
    }

    diagnosticResult.value = parsed;
    localStorage.setItem(cacheKey.value, JSON.stringify(parsed));
    step.value = "success";
  } catch (err: any) {
    console.error("[TASK] AI diagnostic request failed", err);
    errorMsg.value = err?.message || String(err) || "大模型诊断失败，请检查配置或重试。";
    step.value = "error";
  }
}

async function forceReDiagnose() {
  localStorage.removeItem(cacheKey.value);
  diagnosticResult.value = null;
  if (!isAiConfigured.value) {
    step.value = "unconfigured";
  } else {
    await runDiagnosis();
  }
}

watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      // Prioritize cache
      if (loadCache()) {
        return;
      }
      // Check AI config
      if (!isAiConfigured.value) {
        step.value = "unconfigured";
      } else {
        runDiagnosis();
      }
    }
  },
);

onMounted(() => {
  settingsStore.initAiConfig().catch(() => {});
});

// Dynamic score coloring theme
const scoreTheme = computed(() => {
  const score = diagnosticResult.value?.score ?? 0;
  if (score >= 80) {
    return {
      start: "#10b981", // emerald-500
      end: "#059669", // emerald-600
      text: "text-emerald-500 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    };
  } else if (score >= 60) {
    return {
      start: "#f59e0b", // amber-500
      end: "#d97706", // amber-600
      text: "text-amber-500 dark:text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    };
  } else {
    return {
      start: "#ef4444", // red-500
      end: "#dc2626", // red-600
      text: "text-red-500 dark:text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    };
  }
});
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" @click.self="emit('close')">
    <div class="w-full max-w-2xl rounded-xl border border-border/40 bg-background/80 backdrop-blur-md shadow-2xl flex flex-col max-h-[85vh] relative animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
      <!-- Glow ambient decorations -->
      <div class="absolute -top-12 -left-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div class="absolute -bottom-12 -right-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <!-- Close Button -->
      <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground z-10 transition-all cursor-pointer active:scale-95" @click="emit('close')">
        <X class="h-4 w-4" />
      </button>

      <!-- Modal Header -->
      <div class="p-6 border-b border-border/40 flex items-center gap-2.5 shrink-0 relative z-10">
        <div class="h-7 w-7 rounded bg-indigo-600 text-white flex items-center justify-center shadow-md">
          <Sparkles class="h-4 w-4" />
        </div>
        <div>
          <h3 class="text-base font-semibold">AI 项目深度智能诊断</h3>
          <p class="text-xs text-muted-foreground mt-0.5">由 PMP 导师模型为您的项目健康度与完备性提供全方位敏捷评估。</p>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="step === 'loading'" class="flex-1 flex flex-col items-center justify-center p-12 min-h-[350px] relative z-10">
        <div class="relative flex items-center justify-center">
          <div class="h-16 w-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-600 animate-spin" />
          <Sparkles class="absolute h-6 w-6 text-indigo-600 animate-pulse" />
        </div>
        <p class="mt-6 text-sm font-medium text-foreground">🧠 智能大脑正在诊断项目结构与完备性...</p>
        <p class="mt-1.5 text-xs text-muted-foreground/80">正在整理 Targets/Actions/Serves/Keeps 交付流...</p>
      </div>

      <!-- Unconfigured State -->
      <div v-else-if="step === 'unconfigured'" class="flex-1 flex flex-col items-center justify-center p-12 text-center min-h-[350px] relative z-10">
        <div class="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4">
          <AlertTriangle class="h-6 w-6" />
        </div>
        <h4 class="text-sm font-semibold text-foreground">AI 模块未配置 API Key</h4>
        <p class="mt-2 text-xs text-muted-foreground max-w-sm leading-relaxed">
          请先点击右上角设置按钮配置 AI 密钥。<br />
          诊断功能需要配置有效的端点（Endpoint）、模型（Model）及 API Key 才能调用大模型接口。
        </p>
        <button class="mt-6 h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-semibold shadow-sm transition-all active:scale-[0.97] cursor-pointer" @click="emit('close')">知道了</button>
      </div>

      <!-- Error State -->
      <div v-else-if="step === 'error'" class="flex-1 flex flex-col items-center justify-center p-12 text-center min-h-[350px] relative z-10">
        <div class="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-4">
          <AlertTriangle class="h-6 w-6" />
        </div>
        <h4 class="text-sm font-semibold text-foreground">项目健康度诊断出错</h4>
        <p class="mt-2 text-xs text-red-500/90 max-w-md bg-red-500/5 border border-red-500/15 p-3 rounded-lg leading-relaxed whitespace-pre-wrap">
          {{ errorMsg }}
        </p>
        <div class="mt-6 flex gap-2">
          <button class="h-9 px-4 rounded-lg border text-xs font-medium hover:bg-muted transition-all active:scale-95 cursor-pointer" @click="emit('close')">关闭</button>
          <button class="h-9 px-4 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 text-xs font-semibold shadow-sm transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer" @click="runDiagnosis">
            <RefreshCw class="h-3.5 w-3.5" />
            重试诊断
          </button>
        </div>
      </div>

      <!-- Success State -->
      <div v-else-if="step === 'success' && diagnosticResult" class="flex-1 overflow-y-auto p-6 flex flex-col gap-6 min-h-[350px] relative z-10">
        <!-- Score & Summary Card -->
        <div class="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center p-5 rounded-xl border border-border/40 bg-muted/5 relative">
          <!-- Circular Health Ring -->
          <div class="relative w-32 h-32 flex items-center justify-center mx-auto">
            <svg class="w-full h-full transform -rotate-90">
              <!-- Background Ring -->
              <circle cx="64" cy="64" r="52" stroke="currentColor" stroke-width="8" class="text-muted/15 dark:text-muted/20" fill="transparent" />
              <!-- Score Ring -->
              <circle cx="64" cy="64" r="52" stroke="url(#diagnosticScoreGradient)" stroke-width="8" stroke-linecap="round" stroke-dasharray="326.72" :stroke-dashoffset="326.72 - (326.72 * diagnosticResult.score) / 100" fill="transparent" class="transition-all duration-1000 ease-out" />
              <defs>
                <linearGradient id="diagnosticScoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" :stop-color="scoreTheme.start" />
                  <stop offset="100%" :stop-color="scoreTheme.end" />
                </linearGradient>
              </defs>
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-3xl font-extrabold tracking-tight" :class="scoreTheme.text">
                {{ diagnosticResult.score }}
              </span>
              <span class="text-[10px] text-muted-foreground/80 font-medium mt-0.5">项目健康度</span>
            </div>
          </div>

          <!-- Advisor Summary -->
          <div class="space-y-2 text-left">
            <div class="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <span>🧠 专家总评卡片</span>
            </div>
            <p class="text-sm text-foreground bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-cyan-500/5 border border-border/20 p-4 rounded-lg leading-relaxed shadow-sm">
              {{ diagnosticResult.summary }}
            </p>
          </div>
        </div>

        <!-- Diagnostic items list -->
        <div class="space-y-3">
          <div class="text-xs font-semibold text-muted-foreground">诊断明细列表</div>
          <div class="flex flex-col gap-2.5">
            <div v-for="(item, idx) in diagnosticResult.details" :key="idx" class="group rounded-xl border border-border/40 p-4 bg-background/50 hover:bg-muted/10 hover:scale-[1.01] hover:shadow-sm transition-all duration-200 cursor-default flex items-start gap-3.5">
              <!-- Icon based on type -->
              <div class="mt-0.5 shrink-0">
                <AlertTriangle v-if="item.type === 'warning'" class="h-4.5 w-4.5 text-amber-500" />
                <Sparkles v-else-if="item.type === 'suggestion'" class="h-4.5 w-4.5 text-indigo-500 dark:text-indigo-400" />
                <CheckCircle2 v-else class="h-4.5 w-4.5 text-emerald-500" />
              </div>

              <!-- Content -->
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-foreground">{{ item.title }}</span>
                  <span
                    class="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                    :class="{
                      'bg-amber-500/10 text-amber-600 dark:text-amber-400': item.type === 'warning',
                      'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400': item.type === 'suggestion',
                      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400': item.type === 'success',
                    }"
                  >
                    {{ item.type === "warning" ? "警告" : item.type === "suggestion" ? "建议" : "优秀实践" }}
                  </span>
                </div>
                <p class="text-xs text-muted-foreground leading-relaxed">{{ item.message }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Dialog Footer Actions -->
        <div class="flex justify-end gap-2.5 border-t pt-4 border-border/40 shrink-0">
          <button class="h-9 px-4 rounded-lg border text-xs font-semibold hover:bg-muted active:scale-95 transition-all cursor-pointer" @click="emit('close')">关闭</button>
          <button class="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.97] flex items-center gap-1.5 cursor-pointer" @click="forceReDiagnose">
            <RefreshCw class="h-3.5 w-3.5" />
            重新诊断
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
