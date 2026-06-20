<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { useTaskStore, type Keep } from "@/stores/taskStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { buildProjectRetrospective, exportProjectSnapshot, normalizeImportedProjectSnapshot, type KeepType } from "@/lib/taskPlanning";
import { generateKeepContentWithAi } from "@/lib/aiParser";
import { Plus, Archive, Trash2, Edit, FileText, Link, PackageOpen, ExternalLink, X, Download, Upload, ClipboardList, Save, Eye, FolderOpen, Sparkles } from "@lucide/vue";
import { useToast } from "@/composables/useToast";
import { uuid } from "@/lib/utils";

const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const { toast } = useToast();

const aiKeepWriting = ref(false);

async function handleAiKeepCopilot(action: "continue" | "summary" | "outline" | "polish") {
  const content = docFormContent.value.trim();
  const title = docFormName.value.trim();

  if (action === "outline") {
    const input = title || content;
    if (!input) {
      toast("请先输入标题或部分正文，以便生成大纲");
      return;
    }
  } else {
    if (!content) {
      toast("请先输入要处理的文档正文内容");
      return;
    }
  }

  aiKeepWriting.value = true;
  toast("🤖 AI 正在努力写作中...");
  try {
    const promptInput = action === "outline" ? title || content : content;
    const extraPrompt = activeProject.value ? `项目名称: ${activeProject.value.name}。项目说明: ${activeProject.value.description || ""}` : undefined;

    const result = await generateKeepContentWithAi(settingsStore.aiConfig, action, promptInput, extraPrompt);

    if (action === "continue") {
      docFormContent.value += (docFormContent.value ? "\n\n" : "") + result.trim();
      toast("✨ 续写成功！已追加至文章末尾");
    } else if (action === "outline" || action === "polish" || action === "summary") {
      if (confirm(`是否用 AI 生成的内容替换当前编辑框中的内容？`)) {
        docFormContent.value = result.trim();
        toast("✨ 文档更新成功！");
      }
    }
  } catch (e: any) {
    console.error("AI Keep writing failed", e);
    toast(`AI 写作失败: ${e?.message || e}`);
  } finally {
    aiKeepWriting.value = false;
  }
}

// Filter keeps for active project
const projectKeeps = computed(() => {
  return taskStore.keeps.filter((k) => k.projectId === taskStore.activeProjectId);
});

const knowledgeAssets = computed(() => projectKeeps.value.filter((k) => k.type === "document"));
const archiveAssets = computed(() => projectKeeps.value.filter((k) => k.type === "archive" || k.type === "version" || k.type === "link" || k.type === "evidence"));
const retrospectiveAssets = computed(() => projectKeeps.value.filter((k) => k.type === "retrospective"));

// Dialog state (Standard dialog for Links, Versions, Archives)
const showDialog = ref(false);
const isEdit = ref(false);
const editId = ref("");
const formName = ref("");
const formType = ref<KeepType>("link");
const formContent = ref("");
const formRelatedServeId = ref("");
const formRelatedActionId = ref("");
const importInputRef = ref<HTMLInputElement | null>(null);

// Markdown Keep Document Editor states
const showDocEditorDialog = ref(false);
const isDocEdit = ref(false);
const docEditId = ref("");
const docFormName = ref("");
const docFormContent = ref("");

const cleanDocName = computed(() => {
  return docFormName.value.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
});

// Selected keep details (for reading documents)
const selectedKeepForView = ref<Keep | null>(null);
const activeProject = computed(() => taskStore.projects.find((p) => p.id === taskStore.activeProjectId));

// Keep Types (excluding document and retrospective for standard dialog selection if needed, but keeping them for compatibility)
const keepTypes: KeepType[] = ["link", "archive", "evidence", "version"];
const projectKeepsProjectTargets = computed(() => taskStore.targets.filter((t) => t.projectId === taskStore.activeProjectId));
const projectKeepsProjectActions = computed(() => taskStore.actions.filter((a) => a.projectId === taskStore.activeProjectId));
const projectKeepsProjectServes = computed(() => taskStore.serves.filter((s) => s.projectId === taskStore.activeProjectId));

async function writeKeepToLocal(name: string, content: string) {
  if (!activeProject.value || !activeProject.value.localPath) return;
  try {
    const { exists, mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const keepDir = `${activeProject.value.localPath}/4_KEEP/knowledge`;
    if (!(await exists(keepDir))) {
      await mkdir(keepDir, { recursive: true });
    }
    const cleanName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
    const filePath = `${keepDir}/${cleanName}.md`;
    await writeTextFile(filePath, `# ${name}\n\n${content}`);
  } catch (e) {
    console.error("[TASK] writeKeepToLocal failed", e);
    toast("物理文档同步写入失败，请检查目录权限");
  }
}

function openAddDialog() {
  isEdit.value = false;
  editId.value = "";
  formName.value = "";
  formType.value = "link";
  formContent.value = "";
  formRelatedServeId.value = "";
  formRelatedActionId.value = "";
  showDialog.value = true;
}

function openEditDialog(keep: Keep) {
  isEdit.value = true;
  editId.value = keep.id;
  formName.value = keep.name;
  formType.value = keep.type;
  formContent.value = keep.content;
  formRelatedServeId.value = keep.relatedServeId || "";
  formRelatedActionId.value = keep.relatedActionId || "";
  showDialog.value = true;
}

async function submitForm() {
  if (!formName.value.trim() || !formContent.value.trim()) return;

  const name = formName.value.trim();
  const content = formContent.value.trim();

  if (isEdit.value) {
    const existing = taskStore.keeps.find((k) => k.id === editId.value);
    if (existing) {
      existing.name = name;
      existing.type = formType.value;
      existing.content = content;
      existing.relatedServeId = formRelatedServeId.value || undefined;
      existing.relatedActionId = formRelatedActionId.value || undefined;
      taskStore.updateKeep(existing);
    }
  } else {
    taskStore.addKeep(name, formType.value, content, formRelatedServeId.value || undefined, formRelatedActionId.value || undefined);
  }

  // 物理盘写回支持，若是知识文档形式
  if (formType.value === "document" && activeProject.value?.localPath) {
    await writeKeepToLocal(name, content);
  }

  showDialog.value = false;
}

// Markdown Knowledge document edit triggers
function openDocEditor(keep: Keep | null) {
  if (keep) {
    isDocEdit.value = true;
    docEditId.value = keep.id;
    docFormName.value = keep.name;
    docFormContent.value = keep.content;
  } else {
    isDocEdit.value = false;
    docEditId.value = "";
    docFormName.value = "";
    docFormContent.value = "";
  }
  showDocEditorDialog.value = true;
}

async function submitDocForm() {
  const name = docFormName.value.trim();
  const content = docFormContent.value.trim();
  if (!name || !content) return;

  if (isDocEdit.value) {
    const existing = taskStore.keeps.find((k) => k.id === docEditId.value);
    if (existing) {
      existing.name = name;
      existing.content = content;
      taskStore.updateKeep(existing);
    }
  } else {
    taskStore.addKeep(name, "document", content);
  }

  if (activeProject.value && activeProject.value.localPath) {
    await writeKeepToLocal(name, content);
    toast(`💾 知识文档“${name}”已成功保存并同步至 4_KEEP/knowledge/ 下`);
  } else {
    toast(`✨ 知识文档“${name}”已保存！`);
  }

  showDocEditorDialog.value = false;
}

async function importTechnicalDocument() {
  if (!activeProject.value || !activeProject.value.localPath) {
    toast("该项目未绑定本地路径，无法导入技术文档。");
    return;
  }

  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const filePath = await open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });

    if (!filePath || Array.isArray(filePath)) {
      return;
    }

    const { readTextFile, exists, mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const { processMarkdownImages } = await import("@/lib/taskFileSync");
    const rawContent = await readTextFile(filePath);

    const originalFilename = filePath.split(/[/\\]/).pop() || "未命名文档";
    const keepName = originalFilename.replace(/\.md$/, "");
    const cleanName = keepName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");

    const keepDir = `${activeProject.value.localPath}/4_KEEP/knowledge`;
    if (!(await exists(keepDir))) {
      await mkdir(keepDir, { recursive: true });
    }
    const destImagesDir = `${keepDir}/images`;
    const content = await processMarkdownImages(rawContent, filePath, destImagesDir);

    const destPath = `${keepDir}/${cleanName}.md`;
    await writeTextFile(destPath, content);

    const existing = projectKeeps.value.find((k) => k.type === "document" && k.name === keepName);
    if (existing) {
      existing.content = content;
      taskStore.updateKeep(existing);
      toast(`📥 知识文档“${keepName}”已成功导入覆盖并归档至 4_KEEP/knowledge/`);
    } else {
      taskStore.addKeep(keepName, "document", content);
      toast(`📥 知识文档“${keepName}”已成功导入并归档至 4_KEEP/knowledge/`);
    }
  } catch (err) {
    console.error(err);
    toast("导入外部文档失败，请检查文件读写权限。");
  }
}

function deleteKeep(id: string) {
  if (confirm("确定要删除这个存档记录吗？")) {
    taskStore.deleteKeep(id);
    if (selectedKeepForView.value?.id === id) {
      selectedKeepForView.value = null;
    }
  }
}

async function handleTextareaPaste(event: ClipboardEvent, targetType: "document" | "retrospective") {
  if (!activeProject.value || !activeProject.value.localPath) return;
  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith("image/")) {
      event.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;

      try {
        const { exists, mkdir, writeFile } = await import("@tauri-apps/plugin-fs");
        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        const ext = file.name.split(".").pop() || "png";
        const imgName = `image_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;

        const relativeImagesDir = targetType === "retrospective" ? "4_KEEP/images" : "4_KEEP/knowledge/images";
        const destImagesDir = `${activeProject.value.localPath}/${relativeImagesDir}`;

        if (!(await exists(destImagesDir))) {
          await mkdir(destImagesDir, { recursive: true });
        }

        const destPath = `${destImagesDir}/${imgName}`;
        await writeFile(destPath, uint8);

        const textarea = event.target as HTMLTextAreaElement;
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        const text = textarea.value;
        const imageLink = `![image](./images/${imgName})`;

        const newText = text.substring(0, startPos) + imageLink + text.substring(endPos);

        if (targetType === "retrospective") {
          retroContent.value = newText;
        } else {
          docFormContent.value = newText;
        }

        nextTick(() => {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = startPos + imageLink.length;
        });

        toast("🖼️ 粘贴的图片已自动保存并插入 Markdown！");
      } catch (e) {
        console.error("[TASK] paste image failed", e);
        toast("保存粘贴的图片失败，请检查写入权限。");
      }
    }
  }
}

async function handleTextareaDrop(event: DragEvent, targetType: "document" | "retrospective") {
  if (!activeProject.value || !activeProject.value.localPath) return;
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
  if (imageFiles.length === 0) return;

  event.preventDefault();

  try {
    const { exists, mkdir, writeFile } = await import("@tauri-apps/plugin-fs");
    const textarea = event.target as HTMLTextAreaElement;
    let text = textarea.value;
    let cursorOffset = textarea.selectionStart;

    const relativeImagesDir = targetType === "retrospective" ? "4_KEEP/images" : "4_KEEP/knowledge/images";
    const destImagesDir = `${activeProject.value.localPath}/${relativeImagesDir}`;

    if (!(await exists(destImagesDir))) {
      await mkdir(destImagesDir, { recursive: true });
    }

    for (const file of imageFiles) {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      const ext = file.name.split(".").pop() || "png";
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5.-]/g, "_");
      const imgName = `${Date.now()}_${cleanFileName}`;

      const destPath = `${destImagesDir}/${imgName}`;
      await writeFile(destPath, uint8);

      const imageLink = `![${file.name}](./images/${imgName})`;
      text = text.substring(0, cursorOffset) + imageLink + text.substring(cursorOffset);
      cursorOffset += imageLink.length;
    }

    if (targetType === "retrospective") {
      retroContent.value = text;
    } else {
      docFormContent.value = text;
    }

    nextTick(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = cursorOffset;
    });

    toast("🖼️ 拖入的图片已自动保存并插入 Markdown！");
  } catch (e) {
    console.error("[TASK] drop image failed", e);
    toast("保存拖入的图片失败。");
  }
}

function visitLink(url: string) {
  let finalUrl = url;
  if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
    finalUrl = "https://" + finalUrl;
  }
  window.open(finalUrl, "_blank");
}

// Retro Editor States
const showRetroEditor = ref(false);
const retroContent = ref("");
const retroFilePath = ref("");
const retroKeepId = ref("");

async function createRetrospective() {
  if (!activeProject.value) return;

  const existingRetro = projectKeeps.value.find((k) => k.type === "retrospective");
  if (existingRetro) {
    retroContent.value = existingRetro.content;
    retroKeepId.value = existingRetro.id;
  } else {
    const retrospective = buildProjectRetrospective(activeProject.value, projectKeepsProjectTargets.value, projectKeepsProjectActions.value, projectKeepsProjectServes.value, projectKeeps.value);
    retroContent.value = retrospective;
    retroKeepId.value = "";
  }

  if (activeProject.value.localPath) {
    retroFilePath.value = `${activeProject.value.localPath}/4_KEEP/retrospective.md`;
  } else {
    retroFilePath.value = "";
  }

  showRetroEditor.value = true;
}

function openRetrospectiveDetail(keep: Keep) {
  retroContent.value = keep.content;
  retroKeepId.value = keep.id;
  if (activeProject.value?.localPath) {
    retroFilePath.value = `${activeProject.value.localPath}/4_KEEP/retrospective.md`;
  } else {
    retroFilePath.value = "";
  }
  showRetroEditor.value = true;
}

async function saveRetrospective() {
  if (!activeProject.value) return;

  const title = `项目复盘 - ${activeProject.value.name}`;

  if (retroKeepId.value) {
    const existing = taskStore.keeps.find((k) => k.id === retroKeepId.value);
    if (existing) {
      existing.content = retroContent.value;
      taskStore.updateKeep(existing);
    }
  } else {
    const newKeep = taskStore.addKeep(title, "retrospective", retroContent.value);
    retroKeepId.value = newKeep.id;
  }

  if (activeProject.value.localPath) {
    try {
      const { saveRetrospectiveToLocal } = await import("@/lib/taskFileSync");
      await saveRetrospectiveToLocal(activeProject.value.localPath, retroContent.value);
      toast("💾 结项复盘成功！已保存并写入本地 4_KEEP/retrospective.md");
    } catch (e) {
      console.error(e);
      toast("结项复盘本地写入失败，请检查目录权限");
    }
  } else {
    toast("✨ 复盘内容已更新保存！");
  }

  showRetroEditor.value = false;
}

function exportCurrentProject() {
  if (!activeProject.value) return;
  const snapshot = exportProjectSnapshot(activeProject.value, projectKeepsProjectTargets.value, projectKeepsProjectActions.value, projectKeepsProjectServes.value, projectKeeps.value);
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${activeProject.value.name || "task-project"}.task.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function openImportDialog() {
  importInputRef.value?.click();
}

async function importProject(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const snapshot = normalizeImportedProjectSnapshot(JSON.parse(await file.text()));
    taskStore.addProjectSnapshot(snapshot);
  } catch (error) {
    alert(error instanceof Error ? error.message : "导入 TASK 项目失败，请检查 JSON 文件格式。");
  } finally {
    input.value = "";
  }
}

function getRelatedServeTitle(id?: string) {
  if (!id) return "";
  return projectKeepsProjectServes.value.find((serve) => serve.id === id)?.title || "关联交付项已删除";
}

function getRelatedActionTitle(id?: string) {
  if (!id) return "";
  return projectKeepsProjectActions.value.find((action) => action.id === id)?.title || "关联行动已删除";
}

function getKeepIcon(type: KeepType) {
  switch (type) {
    case "document":
    case "retrospective":
      return FileText;
    case "link":
    case "evidence":
      return Link;
    case "archive":
    case "version":
      return PackageOpen;
  }
}

function getKeepBadgeClass(type: KeepType) {
  switch (type) {
    case "document":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "retrospective":
      return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
    case "link":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case "evidence":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "archive":
      return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    case "version":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  }
}

function getKeepLabel(type: KeepType) {
  switch (type) {
    case "document":
      return "知识文档";
    case "link":
      return "快捷链接";
    case "archive":
      return "归档版本";
    case "evidence":
      return "交付证据";
    case "version":
      return "版本记录";
    case "retrospective":
      return "项目复盘";
  }
}
</script>

<template>
  <div class="flex-1 min-w-0 overflow-y-auto bg-background/50 p-6 flex flex-col gap-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 p-5 rounded-xl border bg-muted/10 backdrop-blur-md">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold flex items-center gap-2">
            <Archive class="h-5 w-5 text-purple-500" />
            K - KEEP 留存与归档
          </h2>
          <p class="text-xs text-muted-foreground mt-1">沉淀文档、链接、交付证据、版本记录和复盘，让项目结果可追溯、可复用。</p>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <button class="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all gap-1 cursor-pointer" @click="createRetrospective">
            <ClipboardList class="h-4 w-4 text-primary" />
            一键结项复盘
          </button>
          <button class="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium hover:bg-muted transition-colors gap-1" @click="exportCurrentProject">
            <Download class="h-4 w-4" />
            导出项目
          </button>
          <button class="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium hover:bg-muted transition-colors gap-1" @click="openImportDialog">
            <Upload class="h-4 w-4" />
            导入项目
          </button>
          <button class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1" @click="openAddDialog">
            <Plus class="h-4 w-4" />
            新增留存
          </button>
          <input ref="importInputRef" type="file" accept="application/json,.json" class="hidden" @change="importProject" />
        </div>
      </div>
    </div>

    <!-- Keep Pillars Grid -->
    <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
      <!-- Column 1: 技术知识沉淀 (Knowledge) -->
      <div class="rounded-xl border border-border/60 bg-muted/5 flex flex-col min-h-[450px] p-4 gap-4">
        <div class="flex items-center justify-between border-b pb-2 border-border/40">
          <div class="flex items-center gap-2">
            <FileText class="h-4 w-4 text-blue-500" />
            <h3 class="font-medium text-sm text-foreground">技术知识沉淀</h3>
            <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
              {{ knowledgeAssets.length }}
            </span>
          </div>
          <!-- 新建与导入按钮 -->
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" class="text-[10px] text-primary hover:underline font-semibold flex items-center gap-0.5 cursor-pointer" title="在线通过Markdown编辑新建技术文档" @click="openDocEditor(null)">+ 新建</button>
            <span class="text-muted-foreground/30 text-[10px]">|</span>
            <button type="button" class="text-[10px] text-primary hover:underline font-semibold flex items-center gap-0.5 cursor-pointer" title="导入外部Markdown文档物理归档" @click="importTechnicalDocument">导入</button>
          </div>
        </div>

        <div class="flex-1 flex flex-col gap-3">
          <div v-for="keep in knowledgeAssets" :key="keep.id" class="group p-4 rounded-lg border bg-background/50 hover:bg-muted/10 transition-all border-border/80 relative shadow-sm cursor-pointer" @click="selectedKeepForView = keep">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 pr-6">
                <h4 class="font-medium text-sm truncate">{{ keep.name }}</h4>
                <span class="mt-1 inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold" :class="getKeepBadgeClass(keep.type)">{{ getKeepLabel(keep.type) }}</span>
              </div>
              <div class="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground" @click.stop="openDocEditor(keep)">
                  <Edit class="h-3 w-3" />
                </button>
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click.stop="deleteKeep(keep.id)">
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
            </div>
            <p class="text-xs text-muted-foreground line-clamp-3 leading-relaxed mt-2">
              {{ keep.content }}
            </p>
            <div v-if="keep.relatedServeId || keep.relatedActionId" class="mt-2 space-y-1 text-[10px] text-muted-foreground">
              <div v-if="keep.relatedServeId">S：{{ getRelatedServeTitle(keep.relatedServeId) }}</div>
              <div v-if="keep.relatedActionId">A：{{ getRelatedActionTitle(keep.relatedActionId) }}</div>
            </div>
          </div>
          <div v-if="knowledgeAssets.length === 0" class="py-10 text-center border border-dashed border-border/30 rounded-lg text-muted-foreground/40 text-xs italic">无知识沉淀</div>
        </div>
      </div>

      <!-- Column 2: 项目归档包 (Archives) -->
      <div class="rounded-xl border border-border/60 bg-muted/5 flex flex-col min-h-[450px] p-4 gap-4">
        <div class="flex items-center justify-between border-b pb-2 border-border/40">
          <div class="flex items-center gap-2">
            <PackageOpen class="h-4 w-4 text-purple-500" />
            <h3 class="font-medium text-sm text-foreground">项目归档包</h3>
            <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
              {{ archiveAssets.length }}
            </span>
          </div>
        </div>

        <div class="flex-1 flex flex-col gap-3">
          <div v-for="keep in archiveAssets" :key="keep.id" class="group p-4 rounded-lg border bg-background/50 hover:bg-muted/10 transition-all border-border/80 relative shadow-sm cursor-pointer" @click="keep.type !== 'link' ? (selectedKeepForView = keep) : null">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h4 class="font-medium text-sm truncate pr-1">{{ keep.name }}</h4>
                <span class="mt-1 inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold" :class="getKeepBadgeClass(keep.type)">{{ getKeepLabel(keep.type) }}</span>
                <button v-if="keep.type === 'link'" class="block text-[10px] text-purple-500 font-medium hover:underline truncate inline-flex items-center gap-0.5 mt-1.5 max-w-full text-left" @click="visitLink(keep.content)">
                  {{ keep.content }}
                  <ExternalLink class="h-2.5 w-2.5 shrink-0" />
                </button>
                <p v-else class="text-xs text-muted-foreground mt-1.5 line-clamp-3 whitespace-pre-wrap leading-relaxed">{{ keep.content }}</p>
                <div v-if="keep.relatedServeId || keep.relatedActionId" class="mt-2 space-y-1 text-[10px] text-muted-foreground">
                  <div v-if="keep.relatedServeId">S：{{ getRelatedServeTitle(keep.relatedServeId) }}</div>
                  <div v-if="keep.relatedActionId">A：{{ getRelatedActionTitle(keep.relatedActionId) }}</div>
                </div>
              </div>

              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4">
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground" @click.stop="openEditDialog(keep)">
                  <Edit class="h-3 w-3" />
                </button>
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click.stop="deleteKeep(keep.id)">
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
          <div v-if="archiveAssets.length === 0" class="py-10 text-center border border-dashed border-border/30 rounded-lg text-muted-foreground/40 text-xs italic">无归档包资产</div>
        </div>
      </div>

      <!-- Column 3: 结项复盘与收获 (Value & Retro) -->
      <div class="rounded-xl border border-border/60 bg-muted/5 flex flex-col min-h-[450px] p-4 gap-4">
        <div class="flex items-center justify-between border-b pb-2 border-border/40">
          <div class="flex items-center gap-2">
            <ClipboardList class="h-4 w-4 text-cyan-500" />
            <h3 class="font-medium text-sm text-foreground">结项复盘与收获</h3>
            <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
              {{ retrospectiveAssets.length }}
            </span>
          </div>
        </div>

        <div class="flex-1 flex flex-col gap-3">
          <div v-for="keep in retrospectiveAssets" :key="keep.id" class="group p-4 rounded-lg border bg-background/50 hover:bg-muted/10 transition-all border-border/80 relative shadow-sm cursor-pointer" @click="openRetrospectiveDetail(keep)">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 pr-6">
                <h4 class="font-medium text-sm truncate">{{ keep.name }}</h4>
                <span class="mt-1 inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold" :class="getKeepBadgeClass(keep.type)">{{ getKeepLabel(keep.type) }}</span>
              </div>
              <div class="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground" @click.stop="openEditDialog(keep)">
                  <Edit class="h-3 w-3" />
                </button>
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click.stop="deleteKeep(keep.id)">
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
            </div>
            <p class="text-xs text-muted-foreground line-clamp-4 leading-relaxed mt-2 whitespace-pre-line">
              {{ keep.content }}
            </p>
          </div>

          <div v-if="retrospectiveAssets.length === 0" class="flex-1 flex flex-col items-center justify-center p-6 text-center border border-dashed border-border/30 rounded-lg">
            <ClipboardList class="h-8 w-8 text-cyan-500/40 mb-2" />
            <p class="text-xs text-muted-foreground italic mb-3">暂无结项复盘总结</p>
            <button type="button" class="inline-flex h-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500 hover:text-white px-3 text-xs font-medium text-cyan-500 transition-all gap-1 cursor-pointer" @click="createRetrospective">
              <ClipboardList class="h-3.5 w-3.5" />
              一键生成复盘
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="projectKeeps.length === 0" class="flex-1 flex flex-col items-center justify-center gap-3 p-12 text-center rounded-xl border border-dashed border-border/80 bg-background/20">
      <div class="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground">
        <Archive class="h-6 w-6" />
      </div>
      <div>
        <h3 class="font-medium text-sm">项目档案库空空如也</h3>
        <p class="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">K - KEEP 留存归档可以协助您管理关于该项目的所有产出资产，如交付成果说明、快捷工具外链或版本发布归档。</p>
      </div>
      <button class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1 mt-2" @click="openAddDialog">
        <Plus class="h-4 w-4" />
        添加首个存档
      </button>
    </div>

    <!-- Edit Dialog Modal -->
    <div v-if="showDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div class="w-full max-w-[480px] rounded-xl border bg-background p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground" @click="showDialog = false">
          <X class="h-4 w-4" />
        </button>

        <h3 class="text-base font-semibold">{{ isEdit ? "编辑存档信息" : "添加存档资产" }}</h3>

        <div class="flex flex-col gap-4">
          <!-- Name -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">存档名称</label>
            <input
              v-model="formName"
              type="text"
              placeholder="例如：系统操作手册、GitHub开发库地址、v1.0发版安装包"
              class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <!-- Type -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">存档类别</label>
            <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
              <button
                v-for="t in keepTypes"
                :key="t"
                type="button"
                class="h-9 rounded-md border text-xs font-medium flex items-center justify-center transition-colors"
                :class="formType === t ? getKeepBadgeClass(t) + ' border-current' : 'border-border hover:bg-muted text-muted-foreground'"
                @click="formType = t"
              >
                {{ getKeepLabel(t) }}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
              关联 Serve 交付项（可选）
              <select v-model="formRelatedServeId" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="">不关联交付项</option>
                <option v-for="serve in projectKeepsProjectServes" :key="serve.id" :value="serve.id">
                  {{ serve.title }}
                </option>
              </select>
            </label>

            <label class="space-y-1.5 text-xs font-medium text-muted-foreground">
              关联 Action 行动（可选）
              <select v-model="formRelatedActionId" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="">不关联行动</option>
                <option v-for="action in projectKeepsProjectActions" :key="action.id" :value="action.id">
                  {{ action.title }}
                </option>
              </select>
            </label>
          </div>

          <!-- Content -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">存档内容</label>
            <textarea
              v-model="formContent"
              :placeholder="formType === 'link' ? '请输入完整的网址链接，例如: github.com/username/project' : formType === 'version' ? '请输入版本号、变更摘要或发布包位置...' : formType === 'evidence' ? '请输入验收证据、截图说明、文档位置或确认记录...' : '请输入具体文档、复盘或归档内容...'"
              rows="4"
              class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none font-mono"
            />
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3 border-border/40">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors" @click="showDialog = false">取消</button>
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md" :disabled="!formName.trim() || !formContent.trim()" @click="submitForm">保存存档</button>
        </div>
      </div>
    </div>

    <!-- Read Dialog Modal (For reading full document text) -->
    <div v-if="selectedKeepForView" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div class="w-full max-w-[550px] rounded-xl border bg-background p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground" @click="selectedKeepForView = null">
          <X class="h-4 w-4" />
        </button>

        <div class="flex items-center gap-2.5">
          <component :is="getKeepIcon(selectedKeepForView.type)" class="h-5 w-5 text-blue-500" />
          <h3 class="text-base font-semibold">{{ selectedKeepForView.name }}</h3>
        </div>

        <div class="bg-muted/30 p-4 rounded-lg border border-border/40 text-sm whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto font-sans select-text">
          {{ selectedKeepForView.content }}
        </div>

        <div class="flex justify-end gap-2 border-t pt-3 border-border/40">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors cursor-pointer" @click="selectedKeepForView = null">关闭阅读</button>
          <button
            class="h-9 inline-flex items-center justify-center rounded-lg bg-primary/20 hover:bg-primary/30 text-foreground px-4 text-sm font-medium transition-colors cursor-pointer"
            @click="
              selectedKeepForView.type === 'document' ? openDocEditor(selectedKeepForView) : openEditDialog(selectedKeepForView);
              selectedKeepForView = null;
            "
          >
            编辑文档
          </button>
        </div>
      </div>
    </div>

    <!-- Retrospective Editor Dialog Modal -->
    <div v-if="showRetroEditor" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div class="w-full max-w-[850px] h-[85vh] rounded-xl border bg-background/80 backdrop-blur-md p-6 shadow-2xl flex flex-col gap-4 relative animate-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer" @click="showRetroEditor = false">
          <X class="h-4 w-4" />
        </button>

        <div class="flex items-center gap-2 border-b border-border/40 pb-3">
          <div class="h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
            <ClipboardList class="h-4 w-4" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-foreground">结项复盘与收获编辑器</h3>
            <p class="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[650px]">{{ retroFilePath || "暂未绑定物理文件夹" }}</p>
          </div>
        </div>

        <div class="flex-1 min-h-0 flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>结项复盘可用于记录项目的反思、避坑经验、成长收获等</span>
            <span class="text-[10px] bg-muted px-2 py-0.5 rounded">Markdown 格式</span>
          </div>
          <textarea
            v-model="retroContent"
            placeholder="记录最终的技术收获与结项价值..."
            class="flex-1 w-full rounded-lg border border-input bg-muted/10 p-4 text-xs font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none leading-relaxed"
            @paste="(e) => handleTextareaPaste(e, 'retrospective')"
            @drop="(e) => handleTextareaDrop(e, 'retrospective')"
          />
        </div>

        <div class="flex justify-between items-center border-t pt-3 border-border/40 shrink-0">
          <span class="text-[11px] text-muted-foreground italic">💡 优质复盘内容可成为后续项目的复用参考。</span>
          <div class="flex gap-2">
            <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors cursor-pointer" @click="showRetroEditor = false">取消</button>
            <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1 cursor-pointer" @click="saveRetrospective">
              <Save class="h-4 w-4" />
              保存并同步本地
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Markdown Knowledge Editor Dialog Modal (Online Edit/Write Keep Document) -->
    <div v-if="showDocEditorDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div class="w-full max-w-[850px] h-[85vh] rounded-xl border bg-background/80 backdrop-blur-md p-6 shadow-2xl flex flex-col gap-4 relative animate-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer" @click="showDocEditorDialog = false">
          <X class="h-4 w-4" />
        </button>

        <div class="flex items-center gap-2 border-b border-border/40 pb-3">
          <div class="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <FileText class="h-4 w-4" />
          </div>
          <div class="flex-1 min-w-0 pr-6">
            <h3 class="text-sm font-semibold text-foreground">{{ isDocEdit ? "编辑知识文档" : "新建知识文档" }}</h3>
            <p v-if="activeProject?.localPath" class="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[650px] flex items-center gap-0.5"><FolderOpen class="h-3 w-3 inline" /> knowledge: ./4_KEEP/knowledge/{{ cleanDocName }}.md</p>
            <p v-else class="text-[10px] text-muted-foreground mt-0.5">暂未绑定物理文件夹</p>
          </div>
        </div>

        <div class="flex flex-col gap-4 flex-1 min-h-0">
          <div class="space-y-1.5 shrink-0">
            <label class="text-xs font-semibold text-foreground">知识文档标题</label>
            <input
              v-model="docFormName"
              type="text"
              placeholder="请输入标题，例如：Redis缓存雪崩防范机制、Docker部署常见网络坑点"
              class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div class="flex-1 min-h-0 flex flex-col gap-2">
            <div class="flex items-center justify-between text-xs text-muted-foreground font-medium shrink-0">
              <span>使用 Markdown 格式输入内容</span>
              <div class="flex items-center gap-2">
                <!-- AI Copilot Actions -->
                <div class="flex items-center rounded-md border bg-indigo-500/5 border-indigo-500/20 p-0.5 gap-1">
                  <span class="text-[10px] px-1.5 font-semibold text-indigo-500 flex items-center gap-0.5"> <Sparkles class="h-2.5 w-2.5 shrink-0" /> AI 写作: </span>
                  <button
                    v-for="act in [
                      { id: 'polish', label: '润色', tooltip: '美化文字与排版' },
                      { id: 'continue', label: '续写', tooltip: '根据上下文向下续写' },
                      { id: 'outline', label: '大纲', tooltip: '根据标题/主题自动生成结构大纲' },
                      { id: 'summary', label: '摘要', tooltip: '提取文档总结' },
                    ] as const"
                    :key="act.id"
                    type="button"
                    class="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-medium transition-colors cursor-pointer"
                    :title="act.tooltip"
                    :disabled="aiKeepWriting"
                    @click="handleAiKeepCopilot(act.id)"
                  >
                    {{ act.label }}
                  </button>
                </div>
                <span class="text-[10px] bg-muted px-2 py-0.5 rounded">Markdown 格式</span>
              </div>
            </div>
            <textarea
              v-model="docFormContent"
              placeholder="在此直接输入或编辑知识文档内容，支持规范的 Markdown 语法..."
              class="flex-1 w-full rounded-lg border border-input bg-muted/10 p-4 text-xs font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none leading-relaxed"
              @paste="(e) => handleTextareaPaste(e, 'document')"
              @drop="(e) => handleTextareaDrop(e, 'document')"
            />
          </div>
        </div>

        <div class="flex justify-between items-center border-t pt-3 border-border/40 shrink-0">
          <span class="text-[11px] text-muted-foreground italic">⚠️ 保存后将同时在本地 `./4_KEEP/knowledge/` 目录下创建物理文件。</span>
          <div class="flex gap-2">
            <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors cursor-pointer" @click="showDocEditorDialog = false">取消</button>
            <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1 cursor-pointer" :disabled="!docFormName.trim() || !docFormContent.trim()" @click="submitDocForm">
              <Save class="h-4 w-4" />
              保存并写入本地
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
