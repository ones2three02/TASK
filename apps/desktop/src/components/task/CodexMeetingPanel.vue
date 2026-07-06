<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTaskStore } from "@/stores/taskStore";
import { useOfficeStore } from "@/stores/officeStore";
import { parseMeetingWithAi, type ParsedMeetingResult } from "@/lib/codexMeetingParser";
import { useToast } from "@/composables/useToast";
import { uuid } from "@/lib/utils";
import { isTauriRuntime } from "@/lib/tauriRuntime";

import { X, Mic, MicOff, Sparkles, Loader2, CheckCircle, Circle, Target, ListTodo, Archive, FileText, Upload, Trash2, ChevronRight, AlertTriangle, Link2, Settings, Check, RefreshCw, LogOut, Terminal, Info } from "@lucide/vue";

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
const officeStore = useOfficeStore();
const { toast } = useToast();

// Tabs: meeting (会议记录) | workspace (AI 协同设置)
const activeTab = ref<"meeting" | "workspace">("meeting");

const step = ref<"input" | "preview">("input");
const meetingNotes = ref("");
const liveText = ref("");
const loading = ref(false);
const errorMsg = ref("");

// Meeting input mode: speech | text
const inputMode = ref<"speech" | "text">("speech");

// Feishu Minutes Import Integration
const minutesLink = ref("");
const isMinutesLoading = ref(false);

// Post-Import options
const syncToFeishu = ref(false);
const syncToDingTalk = ref(false);

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

// Connection polling states
const larkLoginUrl = ref("");
const dwsLoginUrl = ref("");
const isFeishuLogginIn = ref(false);
const isDingtalkLogginIn = ref(false);

const isAiConfigured = computed(() => {
  const cfg = settingsStore.aiConfig;
  return !!cfg.endpoint && !!cfg.model && (cfg.provider !== "openai" || !!cfg.apiKey);
});

onMounted(() => {
  // Initialize connection state
  officeStore.initStatus();

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

watch(
  () => props.open,
  (newVal) => {
    if (!newVal) {
      stopListening();
    } else {
      officeStore.initStatus();
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

    recognition.start();
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

  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }

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
      grad.addColorStop(0, "rgba(99, 102, 241, 0.2)");
      grad.addColorStop(0.5, "rgba(139, 92, 246, 0.6)");
      grad.addColorStop(1, "rgba(236, 72, 153, 0.8)");

      ctx.fillStyle = grad;
      ctx.fillRect(canvas.width / 2 + x, canvas.height - barHeight, barWidth - 2, barHeight);
      ctx.fillRect(canvas.width / 2 - x - barWidth, canvas.height - barHeight, barWidth - 2, barHeight);

      x += barWidth;
    }
  };

  draw();
}

// 4. Download Feishu Minutes (MyMinutes) via lark-cli Bridge
async function handleImportMinutes() {
  if (!minutesLink.value.trim()) {
    toast("请输入飞书文档链接或会议妙记ID", 3000);
    return;
  }

  isMinutesLoading.value = true;
  toast("小科正在通过 lark-cli 拉取飞书妙记...", 3000);

  try {
    // lark meeting minutes download --url <URL>
    const output = await officeStore.runCli("lark", ["meeting", "minutes", "download", "--url", minutesLink.value.trim()]);

    if (output) {
      meetingNotes.value += (meetingNotes.value ? "\n\n" : "") + `[从飞书妙记导入]\n${output}`;
      toast("飞书妙记提取成功！已添加至速记框", 3000);
      minutesLink.value = "";
    } else {
      toast("提取内容为空，请确保会议已有妙记纪要生成", 3000);
    }
  } catch (err: any) {
    console.error("Lark-cli download minutes failed", err);
    toast(`提取失败: ${err.message || "请检查 CLI 登录状态"}`, 5000);
  } finally {
    isMinutesLoading.value = false;
  }
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

// 5. Unified Import & Sync via CLI
async function handleImport() {
  if (!parsedResult.value) return;

  const currentProjectId = taskStore.activeProjectId;
  if (!currentProjectId) {
    toast("导入失败：当前没有活跃的项目", 3000);
    return;
  }

  let targetsImported = 0;
  let actionsImported = 0;
  let keepsImported = 0;
  let feishuSynced = 0;
  let dingtalkSynced = 0;

  // 1. Sync or Create Target
  if (selectedTarget.value && parsedResult.value.target) {
    const newTarget = parsedResult.value.target;
    const existingTarget = taskStore.targets.find((t) => t.projectId === currentProjectId);

    if (existingTarget) {
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

  // 2. Import Actions & Sync with Lark/DingTalk CLI
  for (let idx = 0; idx < parsedResult.value.actions.length; idx++) {
    const a = parsedResult.value.actions[idx];
    if (selectedActions.value[idx]) {
      const devItems = (a.devItems || []).map((title) => ({ title, completed: false }));
      const testItems = (a.testItems || []).map((title) => ({ title, completed: false }));
      const outputItems = (a.outputItems || []).map((title) => ({ title, completed: false }));

      // Save locally
      taskStore.addAction(a.title, a.description, a.priority, a.dueDate || undefined, "todo", undefined, false, "", "", undefined, "", devItems, testItems, outputItems);
      actionsImported++;

      // Trigger Feishu Sync via CLI
      if (syncToFeishu.value && officeStore.larkConnected) {
        try {
          await officeStore.runCli("lark", ["task", "create", "--title", `[TASK] ${a.title}`, "--description", a.description || "同步自 TASK 工作台"]);
          feishuSynced++;
        } catch (e) {
          console.error("Feishu sync failed for action:", a.title, e);
        }
      }

      // Trigger DingTalk Sync via CLI
      if (syncToDingTalk.value && officeStore.dwsConnected) {
        try {
          await officeStore.runCli("dws", ["todo", "create", "--subject", `[TASK] ${a.title}`]);
          dingtalkSynced++;
        } catch (e) {
          console.error("Dingtalk sync failed for action:", a.title, e);
        }
      }
    }
  }

  // 3. Import Keep & Backup
  if (selectedKeep.value && parsedResult.value.keep) {
    const k = parsedResult.value.keep;
    taskStore.addKeep(k.name, "retrospective", k.content);
    keepsImported++;

    // Sync knowledge doc to Feishu Cloud Doc via CLI
    if (syncToFeishu.value && officeStore.larkConnected) {
      try {
        await officeStore.runCli("lark", ["doc", "create", "--title", k.name, "--content", k.content]);
        officeStore.addLog("success", `会议简报 [${k.name}] 成功同步并备份到飞书云文档`);
      } catch (e: any) {
        officeStore.addLog("error", `备份文档至飞书失败: ${e.message}`);
      }
    }
  }

  // Success summary
  let syncMsg = "";
  if (feishuSynced > 0) syncMsg += `，成功向飞书同步 ${feishuSynced} 项待办`;
  if (dingtalkSynced > 0) syncMsg += `，成功向钉钉同步 ${dingtalkSynced} 项待办`;

  toast(`小科整理导入成功！导入 ${targetsImported} 个目标、${actionsImported} 项看板卡片、${keepsImported} 篇纪要${syncMsg}。`, 5000);
  emit("stateChange", "happy");

  setTimeout(() => {
    emit("close");
    resetPanel();
    emit("stateChange", "idle");
  }, 2500);
}

function resetPanel() {
  step.value = "input";
  meetingNotes.value = "";
  liveText.value = "";
  errorMsg.value = "";
  parsedResult.value = null;
}

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

async function handleLarkInstall() {
  toast("小科已开始通过 Volta 自动部署飞书 CLI，这需要十几秒，请耐心等待...", 4000);
  try {
    await officeStore.installLarkCli();
    toast("飞书 lark-cli 部署完成！🎉", 3000);
  } catch (err: any) {
    toast(`部署失败: ${err.message || String(err)}`, 5000);
  }
}

async function handleDwsInstall() {
  toast("小科已开始通过 Volta 自动部署钉钉 CLI，这需要十几秒，请耐心等待...", 4000);
  try {
    await officeStore.installDwsCli();
    toast("钉钉 dws 部署完成！🎉", 3000);
  } catch (err: any) {
    toast(`部署失败: ${err.message || String(err)}`, 5000);
  }
}

function openExternalUrl(url: string) {
  if (isTauriRuntime()) {
    import("@tauri-apps/plugin-shell").then(({ open }) => open(url));
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// OAuth Browser Login
async function startFeishuLogin() {
  isFeishuLogginIn.value = true;
  try {
    const url = await officeStore.getLarkLoginUrl();
    if (url) {
      larkLoginUrl.value = url;
      openExternalUrl(url);
      toast("已在浏览器打开飞书授权页面，请授权后点击“确认已绑定”", 5000);
    } else {
      toast("授权拉取失败，请检查 CLI 本地状态", 3000);
    }
  } catch (err: any) {
    toast(`登录拉取失败: ${err.message}`, 4000);
  }
}

async function confirmFeishuLogin() {
  isFeishuLogginIn.value = false;
  larkLoginUrl.value = "";
  await officeStore.checkLarkStatus();
  if (officeStore.larkConnected) {
    toast(`飞书绑定成功！欢迎回来，${officeStore.larkUsername}`, 3000);
  } else {
    toast("飞书账号尚未检测到已登录，请重试", 3000);
  }
}

async function startDingtalkLogin() {
  isDingtalkLogginIn.value = true;
  try {
    const url = await officeStore.getDwsLoginUrl();
    if (url) {
      dwsLoginUrl.value = url;
      openExternalUrl(url);
      toast("已在浏览器打开钉钉授权页面，请授权后点击“确认已绑定”", 5000);
    } else {
      toast("授权拉取失败，请检查 dws 本地状态", 3000);
    }
  } catch (err: any) {
    toast(`登录拉取失败: ${err.message}`, 4000);
  }
}

async function confirmDingtalkLogin() {
  isDingtalkLogginIn.value = false;
  dwsLoginUrl.value = "";
  await officeStore.checkDwsStatus();
  if (officeStore.dwsConnected) {
    toast(`钉钉绑定成功！欢迎回来，${officeStore.dwsUsername}`, 3000);
  } else {
    toast("钉钉账号尚未检测到已登录，请重试", 3000);
  }
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
  <div v-if="open" class="fixed bottom-24 right-6 w-[520px] max-w-[95vw] rounded-2xl border border-white/10 dark:border-white/5 bg-background/80 backdrop-blur-lg shadow-2xl z-50 overflow-hidden flex flex-col max-h-[75vh] transition-all duration-300 animate-in fade-in slide-in-from-bottom-5">
    <!-- Header -->
    <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-indigo-500/10">
      <div class="flex items-center gap-2.5">
        <div class="h-6.5 w-6.5 rounded bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg">
          <Sparkles class="h-3.5 w-3.5 animate-pulse" />
        </div>
        <div>
          <h3 class="text-sm font-semibold text-foreground">小科 AI 办公助理控制中心</h3>
          <p class="text-[10px] text-muted-foreground">基于官方开源 CLI 桥接的多端操作与敏捷生命周期工作台</p>
        </div>
      </div>
      <button class="h-6 w-6 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer" @click="emit('close')">
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Mode Tabs -->
    <div class="flex px-4 border-b border-white/5 bg-muted/20 text-xs shrink-0">
      <button class="px-4 py-2.5 font-medium border-b-2 transition-all cursor-pointer" :class="activeTab === 'meeting' ? 'border-indigo-500 text-indigo-400 font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'" @click="activeTab = 'meeting'">会议方案与看板整理</button>
      <button class="px-4 py-2.5 font-medium border-b-2 transition-all cursor-pointer flex items-center gap-1.5" :class="activeTab === 'workspace' ? 'border-indigo-500 text-indigo-400 font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'" @click="activeTab = 'workspace'">
        <Settings class="h-3.5 w-3.5" />
        办公协同自检与绑定
      </button>
    </div>

    <!-- Tab 1: Meeting & TASK Parser -->
    <div v-if="activeTab === 'meeting'" class="flex-1 overflow-hidden flex flex-col">
      <!-- Step 1: Input -->
      <div v-if="step === 'input'" class="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-h-[320px]">
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
            手动记录/文档导入
          </button>
        </div>

        <!-- Speech Recording Area -->
        <div v-if="inputMode === 'speech'" class="flex-1 flex flex-col items-center justify-center py-6 border border-dashed border-indigo-500/20 rounded-xl bg-indigo-500/5 relative min-h-[170px]">
          <canvas ref="canvasRef" width="350" height="60" class="w-full absolute bottom-2 left-0 opacity-60 pointer-events-none" />

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

        <!-- Text/Doc Input Area -->
        <div v-else class="flex-1 flex flex-col gap-3 min-h-[170px]">
          <!-- Feishu Minutes Bridge download -->
          <div v-if="officeStore.larkConnected" class="p-3.5 rounded-xl border border-indigo-500/10 bg-indigo-500/5 flex items-center gap-2">
            <input v-model="minutesLink" type="text" placeholder="粘贴飞书妙记分享链接或文档 URL" class="flex-1 h-8 rounded-lg border border-white/10 bg-background/50 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/40" :disabled="isMinutesLoading" />
            <button class="h-8 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white px-3 text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer" :disabled="isMinutesLoading || !minutesLink.trim()" @click="handleImportMinutes">
              <RefreshCw v-if="isMinutesLoading" class="h-3.5 w-3.5 animate-spin" />
              <Link2 v-else class="h-3.5 w-3.5" />
              自动拉取妙记
            </button>
          </div>

          <div class="flex-1 flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <label class="text-[11px] font-semibold text-muted-foreground">记录文本区</label>
              <label class="text-[11px] flex items-center gap-1 text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors">
                <Upload class="h-3 w-3" />
                本地文件读取 (.txt/.md)
                <input type="file" class="hidden" accept=".txt,.md" @change="handleFileUpload" />
              </label>
            </div>
            <textarea
              v-model="meetingNotes"
              placeholder="在此记录会议内容，或点击上方直接拉取飞书妙记..."
              class="flex-1 w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-xs leading-relaxed placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50 resize-none"
            />
          </div>
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

        <!-- Sync collaborator choices -->
        <div class="pt-2.5 border-t border-white/5 flex flex-wrap gap-x-6 gap-y-2 shrink-0">
          <label v-if="officeStore.larkConnected" class="flex items-center gap-2 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            <input v-model="syncToFeishu" type="checkbox" class="rounded border-white/10" />
            <span>⚡ 同步并创建飞书待办与备份文档</span>
          </label>
          <label v-if="officeStore.dwsConnected" class="flex items-center gap-2 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            <input v-model="syncToDingTalk" type="checkbox" class="rounded border-white/10" />
            <span>⚡ 同步并创建钉钉工作待办</span>
          </label>
        </div>

        <!-- Action buttons -->
        <div class="flex justify-between items-center border-t border-white/5 pt-3 shrink-0 mt-auto">
          <button class="h-8 inline-flex items-center justify-center rounded-lg border px-3 text-xs font-medium hover:bg-muted active:scale-95 transition-all cursor-pointer" @click="step = 'input'">返回修改</button>
          <button class="h-8 inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-4 text-xs font-semibold transition-all active:scale-[0.97] shadow-md gap-1.5 cursor-pointer" @click="handleImport">导入项目方案 (T/A/K)</button>
        </div>
      </div>
    </div>

    <!-- Tab 2: Workspace integrations and CLI Checkers -->
    <div v-else class="flex-1 overflow-y-auto p-5 flex flex-col gap-5 min-h-[300px]">
      <!-- Feishu lark-cli Status -->
      <div class="p-4 rounded-xl border border-white/10 bg-background/50 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="h-7 w-7 rounded bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs shadow-inner">L</div>
            <div>
              <h4 class="text-xs font-semibold">飞书 lark-cli 协同</h4>
              <p class="text-[9px] text-muted-foreground">处理会议日历、拉取妙记文字、同步飞书待办/云文档</p>
            </div>
          </div>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full border" :class="officeStore.larkInstalled ? (officeStore.larkConnected ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-amber-500/10 border-amber-500 text-amber-400') : 'bg-red-500/10 border-red-500 text-red-400'">
            {{ officeStore.larkInstalled ? (officeStore.larkConnected ? "已连接" : "未登录") : "未安装" }}
          </span>
        </div>

        <!-- 1. Uninstalled guidance (Volta adaptation) -->
        <div v-if="!officeStore.larkInstalled" class="p-3 rounded-lg bg-red-500/5 border border-red-500/10 space-y-2">
          <div class="text-[10px] text-red-400 leading-relaxed flex items-start gap-1.5">
            <Info class="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p>系统未检测到全局安装的 <code>lark-cli</code>。由于您的系统使用 Volta 软件包管理，可以直接点击一键自动安装：</p>
          </div>
          <div class="flex items-center justify-between gap-3 mt-1.5">
            <div class="bg-black/40 px-3 py-2 rounded border border-white/5 font-mono text-[10px] flex-1 flex items-center justify-between text-zinc-300">
              <code>volta install @larksuite/cli</code>
              <Terminal class="h-3 w-3 opacity-60" />
            </div>
            <button
              class="h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-xs px-4 font-semibold transition-all active:scale-[0.97] shadow-md flex items-center gap-1.5 disabled:opacity-50 shrink-0 cursor-pointer animate-pulse"
              :disabled="officeStore.larkInstalling"
              @click="handleLarkInstall"
            >
              <Loader2 v-if="officeStore.larkInstalling" class="h-3.5 w-3.5 animate-spin" />
              <Sparkles v-else class="h-3.5 w-3.5" />
              {{ officeStore.larkInstalling ? "正在安装..." : "一键自动安装" }}
            </button>
          </div>
        </div>

        <!-- 2. Logged out login trigger -->
        <div v-else-if="!officeStore.larkConnected" class="flex gap-2 items-center justify-between">
          <span class="text-[10px] text-muted-foreground">已检测到本地 lark-cli 环境，请进行授权登录。</span>
          <button v-if="!isFeishuLogginIn" class="h-7 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-3 font-semibold transition-all active:scale-95 cursor-pointer" @click="startFeishuLogin">授权登录飞书</button>
          <button v-else class="h-7 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 font-semibold transition-all active:scale-95 cursor-pointer" @click="confirmFeishuLogin">确认已绑定</button>
        </div>

        <!-- 3. Connected user status -->
        <div v-else class="flex gap-2 items-center justify-between bg-emerald-500/5 p-3 border border-emerald-500/10 rounded-lg">
          <div class="flex items-center gap-2">
            <CheckCircle class="h-4 w-4 text-emerald-400" />
            <span class="text-[10px] text-foreground"
              >绑定账号：<strong>{{ officeStore.larkUsername }}</strong></span
            >
          </div>
          <button class="h-6 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 text-[10px] px-2 flex items-center gap-1 cursor-pointer" @click="officeStore.logoutLark()"><LogOut class="h-3 w-3" /> 解除绑定</button>
        </div>
      </div>

      <!-- DingTalk dws Status -->
      <div class="p-4 rounded-xl border border-white/10 bg-background/50 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="h-7 w-7 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xs shadow-inner">D</div>
            <div>
              <h4 class="text-xs font-semibold">钉钉 dws 协同</h4>
              <p class="text-[9px] text-muted-foreground">同步钉钉待办事项、更新钉钉云盘资产、派发通知</p>
            </div>
          </div>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full border" :class="officeStore.dwsInstalled ? (officeStore.dwsConnected ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-amber-500/10 border-amber-500 text-amber-400') : 'bg-red-500/10 border-red-500 text-red-400'">
            {{ officeStore.dwsInstalled ? (officeStore.dwsConnected ? "已连接" : "未登录") : "未安装" }}
          </span>
        </div>

        <!-- 1. Uninstalled guidance -->
        <div v-if="!officeStore.dwsInstalled" class="p-3 rounded-lg bg-red-500/5 border border-red-500/10 space-y-2">
          <div class="text-[10px] text-red-400 leading-relaxed flex items-start gap-1.5">
            <Info class="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p>系统未检测到全局安装的 <code>dws</code>。由于您的系统使用 Volta 软件包管理，可以直接点击一键自动安装：</p>
          </div>
          <div class="flex items-center justify-between gap-3 mt-1.5">
            <div class="bg-black/40 px-3 py-2 rounded border border-white/5 font-mono text-[10px] flex-1 flex items-center justify-between text-zinc-300">
              <code>volta install dingtalk-workspace-cli</code>
              <Terminal class="h-3 w-3 opacity-60" />
            </div>
            <button
              class="h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-xs px-4 font-semibold transition-all active:scale-[0.97] shadow-md flex items-center gap-1.5 disabled:opacity-50 shrink-0 cursor-pointer animate-pulse"
              :disabled="officeStore.dwsInstalling"
              @click="handleDwsInstall"
            >
              <Loader2 v-if="officeStore.dwsInstalling" class="h-3.5 w-3.5 animate-spin" />
              <Sparkles v-else class="h-3.5 w-3.5" />
              {{ officeStore.dwsInstalling ? "正在安装..." : "一键自动安装" }}
            </button>
          </div>
        </div>

        <!-- 2. Logged out login trigger -->
        <div v-else-if="!officeStore.dwsConnected" class="flex gap-2 items-center justify-between">
          <span class="text-[10px] text-muted-foreground">已检测到本地 dws 钉钉环境，请授权登录。</span>
          <button v-if="!isDingtalkLogginIn" class="h-7 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 font-semibold transition-all active:scale-95 cursor-pointer" @click="startDingtalkLogin">授权登录钉钉</button>
          <button v-else class="h-7 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 font-semibold transition-all active:scale-95 cursor-pointer" @click="confirmDingtalkLogin">确认已绑定</button>
        </div>

        <!-- 3. Connected user status -->
        <div v-else class="flex gap-2 items-center justify-between bg-emerald-500/5 p-3 border border-emerald-500/10 rounded-lg">
          <div class="flex items-center gap-2">
            <CheckCircle class="h-4 w-4 text-emerald-400" />
            <span class="text-[10px] text-foreground"
              >绑定账号：<strong>{{ officeStore.dwsUsername }}</strong></span
            >
          </div>
          <button class="h-6 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 text-[10px] px-2 flex items-center gap-1 cursor-pointer" @click="officeStore.logoutDws()"><LogOut class="h-3 w-3" /> 解除绑定</button>
        </div>
      </div>

      <!-- Sync Logs -->
      <div v-if="officeStore.syncLogs.length" class="space-y-1.5">
        <span class="text-[10px] font-semibold text-muted-foreground">同步活动日志：</span>
        <div class="max-h-24 overflow-y-auto p-3 rounded-lg border border-white/5 bg-black/20 text-[9px] font-mono leading-relaxed space-y-1 text-zinc-400">
          <div v-for="log in officeStore.syncLogs" :key="log.id">
            [{{ log.time }}] <span :class="log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'text-blue-400'">{{ log.type.toUpperCase() }}</span
            >: {{ log.message }}
          </div>
        </div>
      </div>

      <!-- Refresh Status -->
      <button
        class="h-8 rounded-lg border bg-muted/20 hover:bg-muted text-xs font-semibold mt-auto flex items-center justify-center gap-1.5 cursor-pointer"
        @click="
          officeStore.initStatus();
          toast('状态刷新成功', 1000);
        "
      >
        <RefreshCw class="h-3.5 w-3.5" /> 重新检测状态
      </button>
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
