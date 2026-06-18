<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useSettingsStore, AI_PROVIDER_PRESETS } from "@/stores/settingsStore";
import { useTaskStore } from "@/stores/taskStore";
import { parseRequirementWithAi, type ParsedRequirementResult, type RequirementReferenceDocument } from "@/lib/aiParser";
import { useToast } from "@/composables/useToast";
import { X, Sparkles, Loader2, CheckCircle, Circle, Target, ListTodo, AlertTriangle, ChevronRight, Upload, FileText, Trash2 } from "@lucide/vue";

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
const referenceInputRef = ref<HTMLInputElement | null>(null);
const referenceErrorMsg = ref("");

interface ReferenceDocumentEntry extends RequirementReferenceDocument {
  id: string;
  size: number;
  truncated: boolean;
}

const MAX_REFERENCE_CHARS = 30_000;
const SUPPORTED_REFERENCE_EXTENSIONS = [".txt", ".md", ".markdown", ".json", ".csv"];
const referenceDocuments = ref<ReferenceDocumentEntry[]>([]);
const totalReferenceChars = computed(() => referenceDocuments.value.reduce((total, document) => total + document.content.length, 0));
const hasParseInput = computed(() => !!requirementText.value.trim() || referenceDocuments.value.length > 0);

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
  if (!hasParseInput.value) return;

  loading.value = true;
  errorMsg.value = "";

  try {
    // If user filled quick key, update store
    if (quickApiKey.value && quickApiKey.value !== settingsStore.aiConfig.apiKey) {
      settingsStore.updateAiConfig({ apiKey: quickApiKey.value });
    }

    const result = await parseRequirementWithAi(
      settingsStore.aiConfig,
      requirementText.value,
      referenceDocuments.value.map((document) => ({
        name: document.name,
        content: document.content,
      })),
    );
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
  referenceDocuments.value = [];
  referenceErrorMsg.value = "";
  parsedResult.value = null;
}

async function handleReferenceFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (!files.length) return;

  referenceErrorMsg.value = "";

  for (const file of files) {
    if (!isSupportedReferenceFile(file.name)) {
      referenceErrorMsg.value = `已跳过 ${file.name}：当前仅支持 ${SUPPORTED_REFERENCE_EXTENSIONS.join("、")} 文本类文件。`;
      continue;
    }

    try {
      const text = await file.text();
      const normalizedText = text.trim();
      if (!normalizedText) {
        referenceErrorMsg.value = `已跳过 ${file.name}：文件内容为空。`;
        continue;
      }

      const remainingChars = MAX_REFERENCE_CHARS - totalReferenceChars.value;
      if (remainingChars <= 0) {
        referenceErrorMsg.value = `参考资料已达到 ${MAX_REFERENCE_CHARS.toLocaleString()} 字符上限，请删除部分文档后再上传。`;
        break;
      }

      const content = normalizedText.slice(0, remainingChars);
      referenceDocuments.value.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        content,
        truncated: normalizedText.length > remainingChars,
      });

      if (normalizedText.length > remainingChars) {
        referenceErrorMsg.value = `${file.name} 内容较长，已按剩余字符额度截断。`;
      }
    } catch (error) {
      referenceErrorMsg.value = `读取 ${file.name} 失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  input.value = "";
}

function removeReferenceDocument(id: string) {
  referenceDocuments.value = referenceDocuments.value.filter((document) => document.id !== id);
}

function isSupportedReferenceFile(fileName: string) {
  const lowerName = fileName.toLowerCase();
  return SUPPORTED_REFERENCE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
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
            placeholder="请在此粘贴您的需求内容，或者简述您想完成什么项目...&#10;例如：&#10;“基于上面的手册，我需要把内部系统同步到飞书多维表格，同步人员信息和工资信息。”"
            class="flex-1 w-full rounded-lg border border-input bg-background/50 px-4 py-3 text-sm leading-relaxed shadow-inner placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none font-sans"
            :disabled="loading"
          />
        </div>

        <!-- Reference documents -->
        <div class="rounded-lg border border-border/60 bg-muted/10 p-3.5 space-y-3">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="space-y-1">
              <div class="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileText class="h-3.5 w-3.5 text-indigo-500" />
                指导文档 / 参考资料
              </div>
              <p class="text-[11px] text-muted-foreground">支持上传 txt、md、json、csv，AI 会结合这些资料拆解项目。文件在本地读取，解析时文本会发送给当前 AI 服务。</p>
            </div>
            <button class="h-8 inline-flex items-center justify-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted transition-colors gap-1.5 shrink-0" type="button" :disabled="loading" @click="referenceInputRef?.click()">
              <Upload class="h-3.5 w-3.5" />
              上传文档
            </button>
            <input ref="referenceInputRef" type="file" class="hidden" multiple accept=".txt,.md,.markdown,.json,.csv,text/plain,text/markdown,application/json,text/csv" @change="handleReferenceFileChange" />
          </div>

          <div v-if="referenceDocuments.length" class="space-y-2">
            <div class="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>已添加 {{ referenceDocuments.length }} 个参考文档</span>
              <span>{{ totalReferenceChars.toLocaleString() }} / {{ MAX_REFERENCE_CHARS.toLocaleString() }} 字符</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div v-for="document in referenceDocuments" :key="document.id" class="rounded-lg border bg-background/70 px-3 py-2 flex items-center gap-2 min-w-0">
                <FileText class="h-4 w-4 text-indigo-500 shrink-0" />
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-medium truncate">{{ document.name }}</div>
                  <div class="text-[10px] text-muted-foreground">{{ formatFileSize(document.size) }} · {{ document.content.length.toLocaleString() }} 字符<span v-if="document.truncated"> · 已截断</span></div>
                </div>
                <button class="h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10" type="button" :disabled="loading" @click="removeReferenceDocument(document.id)">
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="referenceErrorMsg" class="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600">
            {{ referenceErrorMsg }}
          </div>
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
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-indigo-500 hover:bg-indigo-500/90 text-white px-5 text-sm font-medium transition-all shadow-md gap-1.5" :disabled="!hasParseInput || loading || (!isAiConfigured && !quickApiKey)" @click="startAiParse">
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
