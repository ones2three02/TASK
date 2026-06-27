<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTaskStore } from "@/stores/taskStore";
import { parseMeetingWithAi, type ParsedMeetingResult } from "@/lib/codexMeetingParser";
import { useToast } from "@/composables/useToast";
import { uuid } from "@/lib/utils";
import { X, Mic, MicOff, Sparkles, Loader2, CheckCircle, Circle, Target, ListTodo, Archive, FileText, Upload, Trash2, ChevronRight, AlertTriangle, Play, Square } from "@lucide/vue";

const props = defineProps<{
  open: boolean;
  petState: "idle" | "recording" | "thinking" | "happy" | "sleeping";
}>();

const emit = defineEmits<{
  close: [];
  stateChange: [state: "idle" | "recording" | "thinking" | "happy" | "sleeping"];
}>();

const settingsStore = useSettingsStore();
const taskStore = useTaskStore();
const { toast } = useToast();

const step = ref<"input" | "preview">("input");
const meetingNotes = ref("");
const liveText = ref("");
const loading = ref(false);
const errorMsg = ref("");

// Input mode: speech or manual copy
const inputMode = ref<"speech" | "text">("speech");

// Web Speech Recognition
let recognition: any = null;
const isListening = ref(false);
const speechSupported = ref(false);

// Web Audio API for visualizer
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let dataArray: Uint8Array = new Uint8Array(0);
let sourceNode: MediaStreamAudioSourceNode | null = null;
let audioStream: MediaStream | null = null;
let animationFrameId: number | null = null;
const canvasRef = ref<HTMLCanvasElement | null>(null);

// AI parsed preview
const parsedResult = ref<ParsedMeetingResult | null>(null);
const selectedTarget = ref(true);
const selectedActions = ref<Record<number, boolean>>({});
const selectedKeep = ref(true);

// API key check
const isAiConfigured = computed(() => {
  const cfg = settingsStore.aiConfig;
  return !!cfg.endpoint && !!cfg.model && (cfg.provider !== "openai" || !!cfg.apiKey);
});

onMounted(() => {
  // Init speech recognition
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (SpeechRecognition) {
    speechSupported.value = true;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        meetingNotes.value += (meetingNotes.value ? "\n" : "") + finalTranscript;
      }
      liveText.value = interimTranscript;
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        toast("麦克风权限被拒绝，请手动粘贴纪要", 3000);
        inputMode.value = "text";
      }
    };

    recognition.onend = () => {
      if (isListening.value) {
        // Auto restart if it cuts off
        try {
          recognition.start();
        } catch {
          /* ignore */
        }
      }
    };
  }
});

onUnmounted(() => {
  stopListening();
});

// Watch open state to stop recognition if closed
watch(
  () => props.open,
  (newVal) => {
    if (!newVal) {
      stopListening();
    }
  },
);

async function startListening() {
  if (!speechSupported.value) {
    toast("当前环境不支持语音识别，请使用文本导入模式", 3000);
    inputMode.value = "text";
    return;
  }

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    isListening.value = true;
    emit("stateChange", "recording");

    // Start Speech
    recognition.start();

    // Start audio visualization
    initVisualizer(audioStream);
  } catch (err) {
    console.error("Mic access failed", err);
    toast("无法获取麦克风，请检查系统设置", 3000);
    inputMode.value = "text";
  }
}

function stopListening() {
  if (!isListening.value) return;
  isListening.value = false;
  emit("stateChange", "idle");

  if (recognition) {
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
  }

  // Stop stream
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }

  // Stop visualization
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }
}

function initVisualizer(stream: MediaStream) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 64;
  sourceNode = audioContext.createMediaStreamSource(stream);
  sourceNode.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  const draw = () => {
    if (!isListening.value || !canvas || !ctx || !analyser) return;

    animationFrameId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray as any);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 1.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i] / 2.5;

      const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
      grad.addColorStop(0, "rgba(99, 102, 241, 0.2)"); // Indigo
      grad.addColorStop(0.5, "rgba(139, 92, 246, 0.6)"); // Violet
      grad.addColorStop(1, "rgba(236, 72, 153, 0.8)"); // Pink

      ctx.fillStyle = grad;
      // Mirror style
      ctx.fillRect(canvas.width / 2 + x, canvas.height - barHeight, barWidth - 2, barHeight);
      ctx.fillRect(canvas.width / 2 - x - barWidth, canvas.height - barHeight, barWidth - 2, barHeight);

      x += barWidth;
    }
  };

  draw();
}

async function triggerAiAnalysis() {
  const text = (meetingNotes.value + "\n" + liveText.value).trim();
  if (!text) {
    toast("会议记录为空，请输入或录入会议内容", 3000);
    return;
  }

  loading.value = true;
  errorMsg.value = "";
  emit("stateChange", "thinking");

  try {
    const result = await parseMeetingWithAi(settingsStore.aiConfig, text);
    parsedResult.value = result;

    // Reset check state
    selectedTarget.value = !!result.target;
    selectedKeep.value = !!result.keep;
    selectedActions.value = {};
    result.actions.forEach((_, idx) => {
      selectedActions.value[idx] = true;
    });

    step.value = "preview";
    emit("stateChange", "idle");
  } catch (err: any) {
    console.error(err);
    errorMsg.value = err?.message || String(err) || "小科整理失败，请检查 AI 秘钥配置或网络连接。";
    emit("stateChange", "idle");
  } finally {
    loading.value = false;
  }
}

function handleImport() {
  if (!parsedResult.value) return;

  const currentProjectId = taskStore.activeProjectId;
  if (!currentProjectId) {
    toast("导入失败：当前没有活跃的项目", 3000);
    return;
  }

  let targetsImported = 0;
  let actionsImported = 0;
  let keepsImported = 0;

  // 1. Sync or Create Target
  if (selectedTarget.value && parsedResult.value.target) {
    const newTarget = parsedResult.value.target;
    const existingTarget = taskStore.targets.find((t) => t.projectId === currentProjectId);

    if (existingTarget) {
      // Merge milestones and details
      taskStore.updateTarget({
        ...existingTarget,
        title: newTarget.title || existingTarget.title,
        description: newTarget.description || existingTarget.description,
        milestones: [...existingTarget.milestones, ...newTarget.milestones.map((m) => ({ id: uuid(), title: m, completed: false }))],
        successCriteria: [...(existingTarget.successCriteria || []), ...newTarget.successCriteria.map((item) => ({ id: uuid(), title: item, completed: false }))],
        risks: [...(existingTarget.risks || []), ...newTarget.risks.map((item) => ({ id: uuid(), title: item, completed: false }))],
      });
    } else {
      taskStore.addTarget(
        newTarget.title,
        newTarget.description,
        newTarget.milestones.map((m) => ({ title: m, completed: false })),
        newTarget.scope,
        newTarget.outOfScope,
        newTarget.successCriteria.map((item) => ({ title: item, completed: false })),
        newTarget.risks.map((item) => ({ title: item, completed: false })),
      );
    }
    targetsImported++;
  }

  // 2. Import Actions
  parsedResult.value.actions.forEach((a, idx) => {
    if (selectedActions.value[idx]) {
      const devItems = (a.devItems || []).map((title) => ({ title, completed: false }));
      const testItems = (a.testItems || []).map((title) => ({ title, completed: false }));
      const outputItems = (a.outputItems || []).map((title) => ({ title, completed: false }));
      taskStore.addAction(
        a.title,
        a.description,
        a.priority,
        a.dueDate || undefined,
        "todo",
        undefined, // serveId
        false, // blocked
        "", // blockerReason
        "", // evidence
        undefined, // supersededById
        "", // discardedReason
        devItems,
        testItems,
        outputItems,
      );
      actionsImported++;
    }
  });

  // 3. Import Keep
  if (selectedKeep.value && parsedResult.value.keep) {
    const k = parsedResult.value.keep;
    taskStore.addKeep(k.name, "retrospective", k.content);
    keepsImported++;
  }

  toast(`小科整理导入成功！导入 ${targetsImported} 个目标更新、${actionsImported} 项待办行动、${keepsImported} 篇会议归档纪要。`, 4000);
  emit("stateChange", "happy");

  // Happy state for 2.5s, then close
  setTimeout(() => {
    emit("close");
    resetPanel();
  }, 2500);
}

function resetPanel() {
  step.value = "input";
  meetingNotes.value = "";
  liveText.value = "";
  errorMsg.value = "";
  parsedResult.value = null;
}

// Upload file helper
function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result;
    if (typeof text === "string") {
      meetingNotes.value += (meetingNotes.value ? "\n" : "") + text.trim();
      toast(`成功读取文件: ${file.name}`, 2000);
    }
  };
  reader.readAsText(file);
  input.value = "";
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "P0":
      return "bg-red-600/20 border-red-500 text-red-500 font-bold";
    case "P1":
      return "bg-orange-500/20 border-orange-500 text-orange-500";
    case "P2":
      return "bg-blue-500/20 border-blue-500 text-blue-500";
    default:
      return "bg-slate-500/20 border-slate-500 text-slate-400";
  }
}
</script>

<template>
  <div v-if="open" class="fixed bottom-24 right-6 w-[480px] max-w-[90vw] rounded-2xl border border-white/10 dark:border-white/5 bg-background/80 backdrop-blur-lg shadow-2xl z-50 overflow-hidden flex flex-col max-h-[70vh] transition-all duration-300 animate-in fade-in slide-in-from-bottom-5">
    <!-- Header -->
    <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-indigo-500/10">
      <div class="flex items-center gap-2">
        <div class="h-6 w-6 rounded bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg">
          <Sparkles class="h-3.5 w-3.5" />
        </div>
        <div>
          <h3 class="text-sm font-semibold text-foreground">小科 AI 会议纪要整理</h3>
          <p class="text-[10px] text-muted-foreground">陪同飞书会议，自动从讨论中生成项目目标和待办看板</p>
        </div>
      </div>
      <button class="h-6 w-6 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer" @click="emit('close')">
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Step 1: Input -->
    <div v-if="step === 'input'" class="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-h-[300px]">
      <!-- Input Mode Switcher -->
      <div class="flex p-0.5 rounded-lg bg-muted/60 border border-white/5">
        <button class="flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer" :class="inputMode === 'speech' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'" @click="inputMode = 'speech'">
          <Mic class="h-3.5 w-3.5" />
          实时语音听会
        </button>
        <button
          class="flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          :class="inputMode === 'text' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="
            inputMode = 'text';
            stopListening();
          "
        >
          <FileText class="h-3.5 w-3.5" />
          粘贴/上传纪要
        </button>
      </div>

      <!-- Speech Recording Area -->
      <div v-if="inputMode === 'speech'" class="flex-1 flex flex-col items-center justify-center py-6 border border-dashed border-indigo-500/20 rounded-xl bg-indigo-500/5 relative min-h-[160px]">
        <canvas ref="canvasRef" width="300" height="60" class="w-full absolute bottom-2 left-0 opacity-60 pointer-events-none" />

        <button v-if="!isListening" class="h-16 w-16 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer" @click="startListening">
          <Mic class="h-7 w-7" />
        </button>
        <button v-else class="h-16 w-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all animate-pulse cursor-pointer" @click="stopListening">
          <MicOff class="h-7 w-7" />
        </button>

        <span class="text-xs font-medium mt-3" :class="isListening ? 'text-indigo-400' : 'text-muted-foreground'">
          {{ isListening ? "小科正在陪同会议并记录中..." : "点击开始陪同会议" }}
        </span>

        <p v-if="liveText" class="text-xs text-center text-foreground/80 px-6 mt-4 italic max-w-sm truncate">"... {{ liveText }} ..."</p>
      </div>

      <!-- Text Input Area -->
      <div v-else class="flex-1 flex flex-col gap-2 min-h-[160px]">
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-semibold text-muted-foreground">粘贴会议纪要或飞书妙记</label>
          <label class="text-[11px] flex items-center gap-1 text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors">
            <Upload class="h-3 w-3" />
            上传纪要文件
            <input type="file" class="hidden" accept=".txt,.md,.json" @change="handleFileUpload" />
          </label>
        </div>
        <textarea
          v-model="meetingNotes"
          placeholder="在此粘贴会议纪要内容，例如：&#10;“本次会议讨论了支付系统的对接：&#10;1. 确定下周二完成微信支付联调。&#10;2. 责任人小张，需要输出一份技术文档。&#10;3. 新增目标为：保障支付闭环安全。”"
          class="flex-1 w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-xs leading-relaxed placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50 resize-none"
        />
      </div>

      <!-- Quick note editor -->
      <div v-if="inputMode === 'speech' && meetingNotes" class="flex flex-col gap-1.5">
        <span class="text-[10px] font-semibold text-muted-foreground">已录入纪要文本预览：</span>
        <div class="max-h-24 overflow-y-auto p-3 rounded-lg border border-white/5 bg-muted/40 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {{ meetingNotes }}
        </div>
        <button class="text-[10px] text-red-400 hover:text-red-300 self-end flex items-center gap-1 cursor-pointer" @click="meetingNotes = ''"><Trash2 class="h-3 w-3" /> 清空记录</button>
      </div>

      <!-- Config Check -->
      <div v-if="!isAiConfigured" class="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-500 flex gap-2 items-start shrink-0">
        <AlertTriangle class="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div class="text-[10px] leading-relaxed">
          <div class="font-semibold">AI 模型未配置</div>
          <p class="opacity-90">需要配置大模型秘钥才能让小科帮你整理方案，请前往系统设置。</p>
        </div>
      </div>

      <!-- Submit -->
      <div class="flex justify-end gap-2 border-t border-white/5 pt-4 shrink-0 mt-auto">
        <button class="h-8 inline-flex items-center justify-center rounded-lg border px-3 text-xs font-medium hover:bg-muted active:scale-95 transition-all cursor-pointer" @click="resetPanel">重置</button>
        <button
          class="h-8 inline-flex items-center justify-center rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white px-4 text-xs font-semibold transition-all active:scale-[0.97] shadow-md gap-1.5 cursor-pointer"
          :disabled="loading || (!meetingNotes.trim() && !liveText.trim()) || !isAiConfigured"
          @click="
            stopListening();
            triggerAiAnalysis();
          "
        >
          <Loader2 v-if="loading" class="h-3.5 w-3.5 animate-spin" />
          <Sparkles v-else class="h-3.5 w-3.5" />
          {{ loading ? "小科正在拼命梳理方案..." : "结束会议并整理方案" }}
        </button>
      </div>
    </div>

    <!-- Step 2: Preview & Import -->
    <div v-else-if="step === 'preview'" class="flex-1 overflow-hidden flex flex-col p-5 gap-3">
      <div class="flex-1 overflow-y-auto space-y-4 pr-1">
        <!-- Target -->
        <div v-if="parsedResult?.target" class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-indigo-400 flex items-center gap-1">
              <Target class="h-3.5 w-3.5" />
              T - 决议目标 (主目标更新)
            </span>
            <button class="text-muted-foreground hover:text-indigo-400 active:scale-90 transition-all cursor-pointer" @click="selectedTarget = !selectedTarget">
              <CheckCircle v-if="selectedTarget" class="h-4 w-4 text-indigo-400" />
              <Circle v-else class="h-4 w-4" />
            </button>
          </div>
          <div class="p-3 rounded-lg border border-white/5 bg-muted/30" :class="{ 'opacity-50': !selectedTarget }">
            <h4 class="text-xs font-semibold">{{ parsedResult.target.title }}</h4>
            <p class="text-[11px] text-muted-foreground mt-1 leading-relaxed">{{ parsedResult.target.description }}</p>
            <div class="mt-2 pl-3 border-l-2 border-indigo-500/50 space-y-1">
              <div v-for="(m, idx) in parsedResult.target.milestones" :key="idx" class="text-[10px] text-muted-foreground flex items-center gap-1">
                <ChevronRight class="h-3 w-3 text-indigo-500" />
                <span>{{ m }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div v-if="parsedResult?.actions.length" class="space-y-2">
          <span class="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
            <ListTodo class="h-3.5 w-3.5" />
            A - 决议行动看板待办
          </span>
          <div class="space-y-2">
            <div v-for="(a, idx) in parsedResult.actions" :key="idx" class="p-3 rounded-lg border border-white/5 bg-muted/30 flex items-start gap-2" :class="{ 'opacity-50': !selectedActions[idx] }">
              <button class="mt-0.5 text-muted-foreground hover:text-emerald-400 shrink-0 active:scale-90 transition-all cursor-pointer" @click="selectedActions[idx] = !selectedActions[idx]">
                <CheckCircle v-if="selectedActions[idx]" class="h-4 w-4 text-emerald-400" />
                <Circle v-else class="h-4 w-4" />
              </button>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <h4 class="text-xs font-semibold truncate">{{ a.title }}</h4>
                  <span class="text-[8px] px-1 py-0.5 rounded border shrink-0 font-bold" :class="getPriorityColor(a.priority)">
                    {{ a.priority }}
                  </span>
                </div>
                <p class="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{{ a.description }}</p>
                <div v-if="a.devItems?.length" class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-muted-foreground bg-black/10 p-1.5 rounded">
                  <div v-for="(dev, dIdx) in a.devItems.slice(0, 2)" :key="dIdx" class="truncate">• {{ dev }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Keep -->
        <div v-if="parsedResult?.keep" class="space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-purple-400 flex items-center gap-1">
              <Archive class="h-3.5 w-3.5" />
              K - 会议纪要与简报沉淀
            </span>
            <button class="text-muted-foreground hover:text-purple-400 active:scale-90 transition-all cursor-pointer" @click="selectedKeep = !selectedKeep">
              <CheckCircle v-if="selectedKeep" class="h-4 w-4 text-purple-400" />
              <Circle v-else class="h-4 w-4" />
            </button>
          </div>
          <div class="p-3 rounded-lg border border-white/5 bg-muted/30" :class="{ 'opacity-50': !selectedKeep }">
            <h4 class="text-xs font-semibold flex items-center gap-1.5">
              <FileText class="h-3.5 w-3.5 text-purple-400" />
              {{ parsedResult.keep.name }}
            </h4>
            <div class="text-[9px] text-muted-foreground mt-1 line-clamp-3 leading-relaxed whitespace-pre-wrap bg-black/10 p-2 rounded">
              {{ parsedResult.keep.content }}
            </div>
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex justify-between items-center border-t border-white/5 pt-4 shrink-0 mt-auto">
        <button class="h-8 inline-flex items-center justify-center rounded-lg border px-3 text-xs font-medium hover:bg-muted active:scale-95 transition-all cursor-pointer" @click="step = 'input'">返回修改</button>
        <button class="h-8 inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-4 text-xs font-semibold transition-all active:scale-[0.97] shadow-md gap-1.5 cursor-pointer" @click="handleImport">导入项目方案 (T/A/K)</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
