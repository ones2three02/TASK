<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useTaskStore } from "@/stores/taskStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToast } from "@/composables/useToast";
import { generateIllustrationPromptWithAi, generateIllustrationImageWithAi } from "@/lib/illustrationGenerator";
import { X, Sparkles, Loader2, Upload, Link, Check, Image as ImageIcon, Copy, ExternalLink, Trash2 } from "@lucide/vue";

const props = defineProps<{
  open: boolean;
  projectId: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const { toast } = useToast();

const project = computed(() => taskStore.projects.find((p) => p.id === props.projectId));

const loadingPrompt = ref(false);
const loadingImage = ref(false);
const errorMsg = ref(false);
const errorText = ref("");

// 编辑中的状态
const illustrationUrl = ref("");
const illustrationPrompt = ref("");
const illustrationDesc = ref("");
const imageUrlInput = ref("");
const fileInputRef = ref<HTMLInputElement | null>(null);

// 初始化数据
watch(
  () => props.open,
  (newVal) => {
    if (newVal && project.value) {
      illustrationUrl.value = project.value.illustrationUrl || "";
      illustrationPrompt.value = project.value.illustrationPrompt || "";
      illustrationDesc.value = project.value.illustrationDesc || "";
      imageUrlInput.value = "";
      errorText.value = "";
      errorMsg.value = false;
    }
  },
  { immediate: true },
);

// 用 Canvas 对图片进行高质量长边缩放与 JPEG 压缩，大幅减少 Base64 大小，规避 localStorage 空间限制
function compressImage(base64Str: string, maxWidth = 1024, maxHeight = 1024): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // 只有在尺寸超出限制时才进行缩放
      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // 以 0.7 质量进行 JPEG 压缩，对于黑白手绘风格体积通常可缩减 80% 以上
      const compressed = canvas.toDataURL("image/jpeg", 0.7);
      resolve(compressed);
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
}

// 转换网络图片到 base64 并压缩，进行离线存储
async function convertUrlToBase64(url: string): Promise<string> {
  // 如果已经是 base64，直接返回
  if (url.startsWith("data:")) return url;

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const rawBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return await compressImage(rawBase64);
  } catch (e) {
    console.warn("[TASK] Failed to convert image url to base64, using raw url:", e);
    return url;
  }
}

// 1. AI 策划隐喻和提示词
async function handleAiPlan() {
  if (!project.value) return;
  loadingPrompt.value = true;
  errorMsg.value = false;
  errorText.value = "";

  try {
    const result = await generateIllustrationPromptWithAi(settingsStore.aiConfig, project.value.name, project.value.description);
    illustrationPrompt.value = result.prompt;
    illustrationDesc.value = result.desc;
    toast("AI 创意策划完成！已为你构思好物理隐喻。", 3000);
  } catch (err: any) {
    errorMsg.value = true;
    errorText.value = err?.message || String(err) || "策划创意失败，请检查网络或 AI 服务配置。";
  } finally {
    loadingPrompt.value = false;
  }
}

// 2. AI 自动绘图
async function handleAiDraw() {
  if (!illustrationPrompt.value) return;
  loadingImage.value = true;
  errorMsg.value = false;
  errorText.value = "";

  try {
    toast("正在呼叫生图引擎，这可能需要 10-20 秒...", 3000);
    const rawUrl = await generateIllustrationImageWithAi(settingsStore.aiConfig, illustrationPrompt.value);

    // 转换为 base64 永久保存，防止临时 URL 失效
    toast("生图完成，正在做本地化离线处理...", 2000);
    const localBase64 = await convertUrlToBase64(rawUrl);
    illustrationUrl.value = localBase64;

    toast("绘制完成并成功本地保存！", 3000);
  } catch (err: any) {
    errorMsg.value = true;
    errorText.value = err?.message || String(err) || "调用 AI 绘制失败。如果您的 AI 服务不支持生图，请复制提示词手动前往外部大模型绘制并上传。";
  } finally {
    loadingImage.value = false;
  }
}

// 3. 上传本地图片
function triggerFileUpload() {
  fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    toast("请选择有效的图片文件！", 3000);
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    if (e.target?.result) {
      const rawBase64 = e.target.result as string;
      const compressed = await compressImage(rawBase64);
      illustrationUrl.value = compressed;
      toast("本地插图上传并压缩成功！", 3000);
    }
  };
  reader.readAsDataURL(file);
  input.value = ""; // reset
}

// 4. 输入外链保存
async function handleUrlInputSave() {
  if (!imageUrlInput.value.trim()) return;

  loadingImage.value = true;
  errorMsg.value = false;
  try {
    const base64Url = await convertUrlToBase64(imageUrlInput.value.trim());
    illustrationUrl.value = base64Url;
    imageUrlInput.value = "";
    toast("外部图片导入成功！", 3000);
  } catch (err: any) {
    toast("网络图片加载失败，请检查链接是否正确或网络是否可达。", 3000);
  } finally {
    loadingImage.value = false;
  }
}

// 5. 复制提示词
function copyPrompt() {
  if (!illustrationPrompt.value) return;
  navigator.clipboard.writeText(illustrationPrompt.value);
  toast("英文生图提示词已复制到剪贴板！", 2000);
}

// 6. 保存并退出
function handleSave() {
  if (!project.value) return;

  taskStore.updateProject({
    ...project.value,
    illustrationUrl: illustrationUrl.value || undefined,
    illustrationPrompt: illustrationPrompt.value || undefined,
    illustrationDesc: illustrationDesc.value || undefined,
  });

  emit("saved");
  emit("close");
}

// 7. 删除插画
function handleDeleteIllustration() {
  illustrationUrl.value = "";
  toast("已移除项目插画，保存后生效。", 3000);
}

const isProviderNotDalle = computed(() => {
  const provider = settingsStore.aiConfig.provider;
  const model = settingsStore.aiConfig.model?.toLowerCase() || "";

  // 1. 默认不支持生图的提供商预设
  if (["claude", "gemini", "deepseek", "qwen", "ollama"].includes(provider)) {
    return true;
  }

  // 2. 自定义或兼容型提供商下，智能分析模型名称来防呆
  const isImageModel = model.includes("dall") || model.includes("flux") || model.includes("sd") || model.includes("stable") || model.includes("image");
  const isTextModel = model.includes("gpt") || model.includes("claude") || model.includes("deepseek") || model.includes("qwen") || model.includes("llama") || model.includes("m3") || model.includes("abab");

  if (isTextModel && !isImageModel) {
    return true;
  }

  return false;
});

const providerLabel = computed(() => {
  const provider = settingsStore.aiConfig.provider;
  if (provider === "custom") return "自定义提供商";
  if (provider === "openai-compatible") return "兼容 OpenAI 接口";
  switch (provider) {
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    case "deepseek":
      return "DeepSeek";
    case "qwen":
      return "Qwen";
    case "ollama":
      return "Ollama";
    default:
      return provider;
  }
});

const activeModelName = computed(() => settingsStore.aiConfig.model || "未指定模型");
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
    <div class="w-full max-w-[850px] rounded-xl border bg-background shadow-2xl flex flex-col max-h-[90vh] relative animate-in fade-in zoom-in-95 duration-200">
      <!-- Close button -->
      <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer" @click="emit('close')">
        <X class="h-4 w-4" />
      </button>

      <!-- Modal Title -->
      <div class="p-6 border-b border-border/40 flex items-center gap-2 shrink-0">
        <div class="h-7 w-7 rounded bg-zinc-950 dark:bg-zinc-50 text-white dark:text-zinc-950 flex items-center justify-center shadow-md">
          <ImageIcon class="h-4 w-4" />
        </div>
        <div>
          <h3 class="text-base font-semibold">项目手绘小黑插画管理</h3>
          <p class="text-xs text-muted-foreground mt-0.5">为当前项目配置代表其灵魂的手绘风物理隐喻。支持 AI 构思策划、自动绘制，以及本地上传或外链导入。</p>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6 min-h-[350px]">
        <!-- Left Column: Visual Preview -->
        <div class="w-full md:w-[45%] flex flex-col gap-4">
          <label class="text-xs font-semibold text-muted-foreground">插画视觉预览 (16:9)</label>

          <div class="relative w-full aspect-video rounded-lg border bg-muted/20 flex flex-col items-center justify-center overflow-hidden group shadow-inner">
            <template v-if="illustrationUrl">
              <img :src="illustrationUrl" alt="Project Illustration" class="w-full h-full object-contain bg-white" />
              <button class="absolute bottom-2 right-2 h-8 w-8 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow active:scale-90 cursor-pointer" title="删除当前插画" @click="handleDeleteIllustration">
                <Trash2 class="h-4 w-4" />
              </button>
            </template>
            <template v-else>
              <div class="text-center p-4">
                <ImageIcon class="h-10 w-10 text-muted-foreground/45 mx-auto mb-2" />
                <span class="text-xs text-muted-foreground">尚未配置项目插画</span>
              </div>
            </template>
            <!-- Loading indicator for Drawing -->
            <div v-if="loadingImage" class="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white p-4">
              <Loader2 class="h-8 w-8 animate-spin mb-2" />
              <span class="text-xs">生图引擎加载中...</span>
            </div>
          </div>

          <!-- Metaphor Design Explanation -->
          <div class="rounded-lg border bg-muted/10 p-4 space-y-2">
            <h4 class="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles class="h-3.5 w-3.5 text-zinc-950 dark:text-zinc-50" />
              AI 物理隐喻设计构思
            </h4>
            <p class="text-xs text-muted-foreground leading-relaxed min-h-[48px]">
              {{ illustrationDesc || "点击下方的“AI 创意策划”，让 AI 为你的项目构思一个有创意的、低技术怪诞物理隐喻。" }}
            </p>
          </div>
        </div>

        <!-- Right Column: Settings and Controls -->
        <div class="flex-1 flex flex-col gap-5">
          <!-- Step 1: AI Planner -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-muted-foreground">第一步：AI 创意构思</label>
              <span class="text-[10px] text-muted-foreground">大模型分析项目标题与背景</span>
            </div>

            <button class="w-full h-9 inline-flex items-center justify-center rounded-lg border bg-background px-4 text-xs font-medium hover:bg-muted active:scale-95 transition-all gap-1.5 cursor-pointer" :disabled="loadingPrompt || loadingImage" @click="handleAiPlan">
              <Loader2 v-if="loadingPrompt" class="h-3.5 w-3.5 animate-spin" />
              <Sparkles v-else class="h-3.5 w-3.5" />
              {{ loadingPrompt ? "AI 正在飞速头脑风暴中..." : "AI 创意策划（隐喻构思与生图词）" }}
            </button>
          </div>

          <!-- Step 2: Prompt and Render -->
          <div v-if="illustrationPrompt" class="space-y-2.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-muted-foreground">第二步：插画渲染生成</label>
              <span class="text-[10px] text-muted-foreground">由 AI 提示词驱动生成</span>
            </div>

            <!-- English Prompt Display -->
            <div class="rounded-lg border bg-muted/20 px-3 py-2 flex flex-col gap-1.5 relative group">
              <span class="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">生图提示词 (DALL-E 3)</span>
              <p class="text-[11px] font-mono text-muted-foreground leading-relaxed break-words line-clamp-3">
                {{ illustrationPrompt }}
              </p>
              <div class="flex justify-end gap-1.5 mt-1 border-t pt-2 border-border/30">
                <button class="h-7 px-2.5 rounded border bg-background hover:bg-muted text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer active:scale-95 transition-all" @click="copyPrompt">
                  <Copy class="h-3 w-3" />
                  复制提示词
                </button>
                <a href="https://chatgpt.com/" target="_blank" class="h-7 px-2.5 rounded border bg-background hover:bg-muted text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer active:scale-95 transition-all text-muted-foreground hover:text-foreground decoration-none">
                  前往生图
                  <ExternalLink class="h-3 w-3" />
                </a>
              </div>
            </div>

            <!-- Non-image model friendly warning banner -->
            <div v-if="isProviderNotDalle" class="p-3.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-500 text-[11px] leading-relaxed">
              💡 提示：当前 AI 配置的引擎（{{ providerLabel }} / 模型: {{ activeModelName }}）主要用于文本与代码对话。由于其默认不包含生图接口，直接自动生成可能会报 404 错误。建议点击上面的“复制提示词”前往外部（如 ChatGPT / Midjourney）生成后手动上传。
            </div>

            <!-- Render Button -->
            <button
              class="w-full h-9 inline-flex items-center justify-center rounded-lg bg-zinc-950 dark:bg-zinc-50 hover:bg-zinc-900 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 px-5 text-xs font-semibold transition-all active:scale-[0.97] shadow-md gap-1.5 cursor-pointer"
              :disabled="loadingImage || loadingPrompt"
              @click="handleAiDraw"
            >
              <Loader2 v-if="loadingImage" class="h-3.5 w-3.5 animate-spin" />
              <Sparkles v-else class="h-3.5 w-3.5" />
              AI 自动生成与导入（需支持生图的接口）
            </button>
          </div>

          <!-- Step 3: Manual Upload / URL Import -->
          <div class="space-y-2.5 border-t pt-4 border-border/40">
            <label class="text-xs font-semibold text-muted-foreground">或者：手动上传与导入</label>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <!-- Upload Local File -->
              <button class="h-9 inline-flex items-center justify-center rounded-lg border border-dashed bg-muted/5 px-3 text-xs font-medium hover:bg-muted active:scale-95 transition-all gap-1.5 cursor-pointer" :disabled="loadingImage || loadingPrompt" @click="triggerFileUpload">
                <Upload class="h-3.5 w-3.5 text-zinc-950 dark:text-zinc-50" />
                选择本地图片上传
              </button>
              <input ref="fileInputRef" type="file" class="hidden" accept="image/*" @change="handleFileChange" />

              <!-- URL Input Box -->
              <div class="flex items-center gap-1.5">
                <input v-model="imageUrlInput" type="text" placeholder="粘贴网络图片 URL" class="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring" :disabled="loadingImage || loadingPrompt" @keyup.enter="handleUrlInputSave" />
                <button class="h-9 w-9 rounded-lg border bg-background hover:bg-muted flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all" :disabled="!imageUrlInput.trim() || loadingImage || loadingPrompt" @click="handleUrlInputSave">
                  <Link class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- Error Info -->
          <div v-if="errorMsg" class="p-3.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-500 text-xs leading-relaxed">
            {{ errorText }}
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="flex justify-end gap-2 border-t p-6 border-border/40 shrink-0">
        <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted active:scale-95 transition-all cursor-pointer" @click="emit('close')" :disabled="loadingImage || loadingPrompt">取消</button>
        <button class="h-9 inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-500/95 text-white px-5 text-sm font-bold transition-all active:scale-[0.97] shadow-md gap-1.5 cursor-pointer" :disabled="loadingImage || loadingPrompt" @click="handleSave">
          <Check class="h-4 w-4" />
          保存更改
        </button>
      </div>
    </div>
  </div>
</template>
