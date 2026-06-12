<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useSettingsStore, AI_PROVIDER_PRESETS } from "@/stores/settingsStore";
import { useTaskStore } from "@/stores/taskStore";
import { parseRequirementWithAi, type ParsedRequirementResult } from "@/lib/aiParser";
import { useToast } from "@/composables/useToast";
import { X, Sparkles, Loader2, CheckCircle, Circle, Target, ListTodo, AlertTriangle, ChevronRight, Settings } from "@lucide/vue";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  imported: [];
}>();

const settingsStore = useSettingsStore();
const taskStore = useTaskStore();
const { toast } = useToast();

const step = ref<"input" | "preview">("input");
const requirementText = ref("");
const loading = ref(false);
const errorMsg = ref("");

// Input-stage quick API Key setup (so users don't have to navigate to settings first)
const quickApiKey = ref("");
const isAiConfigured = computed(() => {
  const cfg = settingsStore.aiConfig;
  const preset = AI_PROVIDER_PRESETS[cfg.provider];
  return !!cfg.endpoint && !!cfg.model && (!preset.requiresApiKey || !!cfg.apiKey || !!quickApiKey.value);
});

// Parsed preview structures
const parsedResult = ref<ParsedRequirementResult | null>(null);
const selectedTargets = ref<Record<number, boolean>>({});
const selectedActions = ref<Record<number, boolean>>({});

onMounted(() => {
  settingsStore.initAiConfig().then(() => {
    quickApiKey.value = settingsStore.aiConfig.apiKey;
  });
});

async function startAiParse() {
  if (!requirementText.value.trim()) return;

  loading.value = true;
  errorMsg.value = "";

  try {
    // If user filled quick key, update store
    if (quickApiKey.value && quickApiKey.value !== settingsStore.aiConfig.apiKey) {
      settingsStore.updateAiConfig({ apiKey: quickApiKey.value });
    }

    const result = await parseRequirementWithAi(settingsStore.aiConfig, requirementText.value);
    parsedResult.value = result;

    // Default all items to checked
    selectedTargets.value = {};
    result.targets.forEach((_, idx) => {
      selectedTargets.value[idx] = true;
    });

    selectedActions.value = {};
    result.actions.forEach((_, idx) => {
      selectedActions.value[idx] = true;
    });

    step.value = "preview";
  } catch (err: any) {
    console.error(err);
    errorMsg.value = err?.message || String(err) || "解析失败，请检查网络或 AI 秘钥配置。";
  } finally {
    loading.value = false;
  }
}

function handleImport() {
  if (!parsedResult.value) return;

  let targetsImported = 0;
  let actionsImported = 0;

  // 1. Import selected targets
  parsedResult.value.targets.forEach((t, idx) => {
    if (selectedTargets.value[idx]) {
      taskStore.addTarget(
        t.title,
        t.description,
        t.milestones.map((m) => ({ title: m, completed: false })),
      );
      targetsImported++;
    }
  });

  // 2. Import selected actions
  parsedResult.value.actions.forEach((a, idx) => {
    if (selectedActions.value[idx]) {
      taskStore.addAction(a.title, a.description, a.priority);
      actionsImported++;
    }
  });

  toast(`AI 拆解成功：导入了 ${targetsImported} 个目标和 ${actionsImported} 项行动任务！`, 3000);
  emit("imported");
  emit("close");

  // Reset
  step.value = "input";
  requirementText.value = "";
  parsedResult.value = null;
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-amber-500";
    case "low":
      return "bg-emerald-500";
    default:
      return "bg-slate-500";
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
    <div class="w-full max-w-[850px] rounded-xl border bg-background shadow-2xl flex flex-col max-h-[85vh] relative animate-in fade-in zoom-in-95 duration-200">
      <!-- Close button -->
      <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground" @click="emit('close')">
        <X class="h-4 w-4" />
      </button>

      <!-- Modal Title -->
      <div class="p-6 border-b border-border/40 flex items-center gap-2 shrink-0">
        <div class="h-7 w-7 rounded bg-indigo-500 text-white flex items-center justify-center shadow-md animate-pulse">
          <Sparkles class="h-4 w-4" />
        </div>
        <div>
          <h3 class="text-base font-semibold">AI 需求文档智能拆解</h3>
          <p class="text-xs text-muted-foreground mt-0.5">粘贴您的产品需求书或一句话灵感，让 AI 帮您快速部署项目初始目标和待办看板。</p>
        </div>
      </div>

      <!-- Step 1: Input Area -->
      <div v-if="step === 'input'" class="flex-1 overflow-y-auto p-6 flex flex-col gap-5 min-h-[300px]">
        <!-- Requirement input -->
        <div class="flex-1 flex flex-col gap-1.5 min-h-[180px]">
          <label class="text-xs font-semibold text-muted-foreground">需求书文本 / 灵感想法</label>
          <textarea
            v-model="requirementText"
            placeholder="请在此粘贴您的需求内容，或者简述您想完成什么项目...&#10;例如：&#10;“我想做一个个人记账小程序。系统核心包含记账（可选择收入/支出、选择分类和输入备注），包含分类管理，包含按月份统计支出的可视化柱状图。系统需要极简暗黑风格，部署在手机网页端...”"
            class="flex-1 w-full rounded-lg border border-input bg-background/50 px-4 py-3 text-sm leading-relaxed shadow-inner placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none font-sans"
            :disabled="loading"
          />
        </div>

        <!-- Key check Warning and Quick config -->
        <div v-if="!isAiConfigured" class="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-500 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div class="flex gap-2">
            <AlertTriangle class="h-4 w-4 mt-0.5 shrink-0" />
            <div class="text-xs">
              <div class="font-semibold">AI 模块未配置 API Key</div>
              <p class="text-[11px] opacity-90 mt-0.5">需要配置服务密码（OpenAI, Claude, Qwen, DeepSeek 或本地 Ollama）才能发起分析。</p>
            </div>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <input v-model="quickApiKey" type="password" placeholder="快速填入 API Key" class="h-8 rounded border border-amber-500/20 bg-background px-2 text-xs w-full sm:w-44 focus:outline-none" />
          </div>
        </div>

        <!-- Configuration status hint -->
        <div v-else class="text-xs text-muted-foreground flex items-center justify-between bg-muted/20 px-3 py-2 rounded-lg border">
          <span class="flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            当前 AI 引擎：<strong class="text-foreground capitalize">{{ settingsStore.aiConfig.provider }}</strong> (模型: <code class="bg-muted px-1.5 py-0.5 rounded text-[10px]">{{ settingsStore.aiConfig.model }}</code
            >)
          </span>
          <span class="text-[10px]">支持前往「系统设置」修改</span>
        </div>

        <!-- Error display -->
        <div v-if="errorMsg" class="p-3.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-500 text-xs leading-relaxed">
          {{ errorMsg }}
        </div>

        <!-- Trigger buttons -->
        <div class="flex justify-end gap-2 border-t pt-4 border-border/40 shrink-0">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors" @click="emit('close')" :disabled="loading">取消</button>
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-indigo-500 hover:bg-indigo-500/90 text-white px-5 text-sm font-medium transition-all shadow-md gap-1.5" :disabled="!requirementText.trim() || loading || (!isAiConfigured && !quickApiKey)" @click="startAiParse">
            <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
            <Sparkles v-else class="h-4 w-4" />
            {{ loading ? "AI 正在全力拆解中..." : "开始 AI 拆解项目" }}
          </button>
        </div>
      </div>

      <!-- Step 2: Preview & Import -->
      <div v-else-if="step === 'preview'" class="flex-1 overflow-hidden flex flex-col p-6 gap-4 min-h-[350px]">
        <div class="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 pr-1">
          <!-- Left: Targets preview -->
          <div class="flex flex-col gap-3">
            <h4 class="text-sm font-semibold flex items-center gap-2 border-b pb-2 border-border/40 text-emerald-500">
              <Target class="h-4 w-4" />
              拆解出的项目目标 (T - Targets)
            </h4>

            <div class="space-y-4">
              <div v-for="(t, idx) in parsedResult?.targets" :key="idx" class="p-4 rounded-lg border bg-muted/10 border-border/60 flex flex-col gap-2 relative">
                <div class="flex items-start gap-2.5">
                  <button class="mt-0.5 text-muted-foreground hover:text-emerald-500 shrink-0" @click="selectedTargets[idx] = !selectedTargets[idx]">
                    <CheckCircle v-if="selectedTargets[idx]" class="h-4.5 w-4.5 text-emerald-500" />
                    <Circle v-else class="h-4.5 w-4.5" />
                  </button>

                  <div class="min-w-0">
                    <h5 class="font-medium text-sm text-foreground" :class="{ 'opacity-60': !selectedTargets[idx] }">{{ t.title }}</h5>
                    <p class="text-xs text-muted-foreground mt-1 leading-relaxed" :class="{ 'opacity-55': !selectedTargets[idx] }">{{ t.description }}</p>
                  </div>
                </div>

                <!-- Milestones inside target -->
                <div class="mt-2.5 pl-7 border-t border-border/30 pt-2 space-y-1.5" :class="{ 'opacity-50': !selectedTargets[idx] }">
                  <div class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">包含的里程碑:</div>
                  <div v-for="(m, mIdx) in t.milestones" :key="mIdx" class="text-xs text-muted-foreground flex items-center gap-1.5">
                    <ChevronRight class="h-3 w-3 shrink-0 text-emerald-500" />
                    <span class="truncate">{{ m }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Actions preview -->
          <div class="flex flex-col gap-3">
            <h4 class="text-sm font-semibold flex items-center gap-2 border-b pb-2 border-border/40 text-indigo-500">
              <Spacer />
              <ListTodo class="h-4 w-4" />
              拆解出的任务卡片 (A - Actions)
            </h4>

            <div class="space-y-3">
              <div v-for="(a, idx) in parsedResult?.actions" :key="idx" class="p-4 rounded-lg border bg-muted/10 border-border/60 flex items-start gap-2.5 relative">
                <button class="mt-0.5 text-muted-foreground hover:text-indigo-500 shrink-0" @click="selectedActions[idx] = !selectedActions[idx]">
                  <CheckCircle v-if="selectedActions[idx]" class="h-4.5 w-4.5 text-indigo-500" />
                  <Circle v-else class="h-4.5 w-4.5" />
                </button>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <h5 class="font-medium text-sm text-foreground" :class="{ 'opacity-60': !selectedActions[idx] }">{{ a.title }}</h5>
                    <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border shrink-0 text-white/90" :class="getPriorityColor(a.priority)">
                      {{ a.priority === "high" ? "高" : a.priority === "medium" ? "中" : "低" }}
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-1 leading-relaxed" :class="{ 'opacity-55': !selectedActions[idx] }">{{ a.description }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Trigger buttons -->
        <div class="flex justify-between items-center border-t pt-4 border-border/40 shrink-0 mt-auto">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors" @click="step = 'input'">返回修改</button>

          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-500/90 text-white px-5 text-sm font-medium transition-all shadow-md gap-1.5" @click="handleImport">导入到项目 (T & A)</button>
        </div>
      </div>
    </div>
  </div>
</template>
