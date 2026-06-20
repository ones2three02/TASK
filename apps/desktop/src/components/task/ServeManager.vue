<script setup lang="ts">
import { computed, ref, watchEffect, nextTick } from "vue";
import { useTaskStore, type Serve } from "@/stores/taskStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { suggestAcceptanceCriteriaWithAi } from "@/lib/aiParser";
import type { ChecklistItem } from "@/lib/taskPlanning";
import { uuid } from "@/lib/utils";
import { Handshake, FileCheck, CalendarDays, ClipboardCheck, Paperclip, CheckCircle2, Circle, FileText, Eye, Save, X, FolderOpen, Sparkles, Loader2 } from "@lucide/vue";
import { useToast } from "@/composables/useToast";
import { writeServeTemplateToLocal } from "@/lib/taskFileSync";

const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const { toast } = useToast();

const aiRecommending = ref(false);

async function handleAiRecommendAcceptance() {
  if (!currentServe.value) return;

  const serve = currentServe.value;
  aiRecommending.value = true;
  toast("🤖 AI 正在智能推演验收条件...");
  try {
    const results = await suggestAcceptanceCriteriaWithAi(settingsStore.aiConfig, serve.title, serve.description, serve.deliverable, serve.client);

    if (results && results.length > 0) {
      const serveCopy = { ...serve };
      if (!serveCopy.acceptanceChecklist) serveCopy.acceptanceChecklist = [];

      results.forEach((title) => {
        const exists = serveCopy.acceptanceChecklist!.some((item) => item.title === title);
        if (!exists) {
          serveCopy.acceptanceChecklist!.push({
            id: uuid(),
            title,
            completed: false,
          });
        }
      });

      taskStore.updateServe(serveCopy);
      toast("✨ 验收条件推荐并合并成功！");
    } else {
      toast("AI 未返回更多验收条件建议");
    }
  } catch (e: any) {
    console.error("AI recommend acceptance criteria failed", e);
    toast(`推荐失败: ${e?.message || e}`);
  } finally {
    aiRecommending.value = false;
  }
}

const projectServes = computed(() => taskStore.serves.filter((s) => s.projectId === taskStore.activeProjectId));

// 获取当前项目的唯一 Target 目标
const activeTarget = computed(() => {
  return taskStore.targets.find((t) => t.projectId === taskStore.activeProjectId);
});

const activeProject = computed(() => {
  return taskStore.projects.find((p) => p.id === taskStore.activeProjectId);
});

// 静默初始化 Target 交付记录
watchEffect(() => {
  if (taskStore.activeProjectId && activeTarget.value) {
    const serves = taskStore.serves.filter((s) => s.projectId === taskStore.activeProjectId);
    if (serves.length === 0) {
      taskStore.addServe(
        activeTarget.value.title,
        activeTarget.value.description || "当前项目核心目标的交付与验收文档汇总",
        "核心交付物",
        "需求方",
        "active",
        undefined,
        "pending",
        undefined,
        activeTarget.value.successCriteria?.map((sc) => ({ id: uuid(), title: sc.title, completed: sc.completed })) || [],
      );
    }
  }
});

// 绑定到当前唯一的交付项
const currentServe = computed(() => {
  return projectServes.value[0] || null;
});

function isDocumentGenerated(serve: Serve, type: "architecture_design" | "technical_implementation" | "test_cases" | "deployment_guide" | "user_guide"): boolean {
  if (!serve.evidence) return false;
  const filenameMap = {
    architecture_design: "1_概要设计_",
    technical_implementation: "2_实现方案_",
    test_cases: "3_测试用例_",
    deployment_guide: "4_上线部署_",
    user_guide: "5_功能操作_",
  };
  const prefix = filenameMap[type];
  return serve.evidence.some((e) => e.content.includes(prefix));
}

async function generateDeliverableTemplate(serve: Serve, templateType: "architecture_design" | "technical_implementation" | "test_cases" | "deployment_guide" | "user_guide") {
  if (!activeProject.value || !activeProject.value.localPath) {
    toast("此项目未绑定本地映射文件夹，无法生成物理模版文件。");
    return;
  }

  const path = await writeServeTemplateToLocal(activeProject.value.localPath, templateType, serve.title);
  if (path) {
    const filename = path.split(/[/\\]/).pop() || "report.md";
    const matchedEvidence = serve.evidence?.some((e) => e.content.includes(filename));
    if (!matchedEvidence) {
      const serveCopy = { ...serve };
      if (!serveCopy.evidence) serveCopy.evidence = [];

      const labelMap = {
        architecture_design: "概要设计文档",
        technical_implementation: "技术实现方案",
        test_cases: "测试用例与自测报告",
        deployment_guide: "上线部署指引",
        user_guide: "功能操作文档",
      };

      serveCopy.evidence.push({
        id: uuid(),
        title: `初始化交付文档: ${labelMap[templateType]}`,
        content: `./reports/${filename}`,
        type: "text",
        createdAt: new Date().toISOString(),
      });
      taskStore.updateServe(serveCopy);
    }
    toast(`📄 交付文档“${filename}”已初始化写入本地 reports 目录！`);
  } else {
    toast("文档模版写入失败，请检查目录权限。");
  }
}

async function importExternalDocument(serve: Serve, templateType: "architecture_design" | "technical_implementation" | "test_cases" | "deployment_guide" | "user_guide") {
  if (!activeProject.value || !activeProject.value.localPath) {
    toast("此项目未绑定本地映射文件夹，无法导入文件。");
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

    const { readTextFile, writeTextFile, exists, mkdir } = await import("@tauri-apps/plugin-fs");
    const { processMarkdownImages } = await import("@/lib/taskFileSync");
    const rawContent = await readTextFile(filePath);

    const cleanTitle = serve.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
    const reportsDir = `${activeProject.value.localPath}/3_SERVE/reports`;

    if (!(await exists(reportsDir))) {
      await mkdir(reportsDir, { recursive: true });
    }
    const destImagesDir = `${reportsDir}/images`;
    const content = await processMarkdownImages(rawContent, filePath, destImagesDir);

    const filenameMap = {
      architecture_design: `1_概要设计_${cleanTitle}.md`,
      technical_implementation: `2_实现方案_${cleanTitle}.md`,
      test_cases: `3_测试用例_${cleanTitle}.md`,
      deployment_guide: `4_上线部署_${cleanTitle}.md`,
      user_guide: `5_功能操作_${cleanTitle}.md`,
    };

    const destPath = `${reportsDir}/${filenameMap[templateType]}`;
    await writeTextFile(destPath, content);

    const filename = filenameMap[templateType];
    const matchedEvidence = serve.evidence?.some((e) => e.content.includes(filename));
    if (!matchedEvidence) {
      const serveCopy = { ...serve };
      if (!serveCopy.evidence) serveCopy.evidence = [];

      const labelMap = {
        architecture_design: "概要设计文档",
        technical_implementation: "技术实现方案",
        test_cases: "测试用例与自测报告",
        deployment_guide: "上线部署指引",
        user_guide: "功能操作文档",
      };

      serveCopy.evidence.push({
        id: uuid(),
        title: `导入交付文档: ${labelMap[templateType]}`,
        content: `./reports/${filename}`,
        type: "text",
        createdAt: new Date().toISOString(),
      });
      taskStore.updateServe(serveCopy);
    }

    toast(`📥 外部文档已成功导入并覆盖归档至 reports/${filename}`);
  } catch (err) {
    console.error(err);
    toast("导入外部文档失败，请检查文件格式及读写权限。");
  }
}

// Markdown Editor States
const showEditorDialog = ref(false);
const editorContent = ref("");
const editingFilePath = ref("");
const editingFileTitle = ref("");

async function openMarkdownEditor(serve: Serve, templateType: "architecture_design" | "technical_implementation" | "test_cases" | "deployment_guide" | "user_guide") {
  if (!activeProject.value || !activeProject.value.localPath) {
    toast("此项目未绑定本地映射文件夹，无法编辑物理文件。");
    return;
  }

  const cleanTitle = serve.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
  const reportsDir = `${activeProject.value.localPath}/3_SERVE/reports`;
  const filenameMap = {
    architecture_design: `1_概要设计_${cleanTitle}.md`,
    technical_implementation: `2_实现方案_${cleanTitle}.md`,
    test_cases: `3_测试用例_${cleanTitle}.md`,
    deployment_guide: `4_上线部署_${cleanTitle}.md`,
    user_guide: `5_功能操作_${cleanTitle}.md`,
  };
  const labelMap = {
    architecture_design: "概要设计文档",
    technical_implementation: "技术实现方案",
    test_cases: "测试用例与自测报告",
    deployment_guide: "上线部署指引",
    user_guide: "功能操作文档",
  };

  const filename = filenameMap[templateType];
  const filePath = `${reportsDir}/${filename}`;
  editingFilePath.value = filePath;
  editingFileTitle.value = `${labelMap[templateType]} - ${serve.title}`;

  try {
    const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
    if (await exists(filePath)) {
      const content = await readTextFile(filePath);
      editorContent.value = content;
      showEditorDialog.value = true;
    } else {
      toast("文件不存在，请先点击初始化生成模板！");
    }
  } catch (err) {
    console.error(err);
    toast("读取本地文件失败，请检查文件权限！");
  }
}

async function saveMarkdownFile() {
  if (!editingFilePath.value) return;
  try {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(editingFilePath.value, editorContent.value);
    toast("💾 文件保存成功！");
    showEditorDialog.value = false;
  } catch (err) {
    console.error(err);
    toast("保存物理文件失败，请检查文件权限！");
  }
}

async function handleTextareaPaste(event: ClipboardEvent) {
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

        const destImagesDir = `${activeProject.value.localPath}/3_SERVE/reports/images`;

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

        editorContent.value = text.substring(0, startPos) + imageLink + text.substring(endPos);

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

async function handleTextareaDrop(event: DragEvent) {
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

    const destImagesDir = `${activeProject.value.localPath}/3_SERVE/reports/images`;

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

    editorContent.value = text;

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

const draggingOverServe = ref(false);

async function handleFileDropOnServe(event: DragEvent, serve: Serve) {
  draggingOverServe.value = false;
  if (!activeProject.value || !activeProject.value.localPath) {
    toast("该项目未绑定本地映射路径，无法在物理目录归档凭证");
    return;
  }

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  const filePath = (file as any).path;
  if (!filePath) {
    toast("无法获取文件本地绝对路径，仅支持在桌面客户端中拖拽本地文件");
    return;
  }

  const filename = file.name || filePath.split(/[/\\]/).pop() || "evidence";

  try {
    const { copyFileToLocalServe } = await import("@/lib/taskFileSync");
    const destPath = await copyFileToLocalServe(activeProject.value.localPath, filePath, serve.title);
    if (destPath) {
      const serveCopy = { ...serve };
      if (!serveCopy.evidence) serveCopy.evidence = [];

      serveCopy.evidence.push({
        id: uuid(),
        title: `拖拽归档凭证: ${filename}`,
        content: `./evidence/${serve.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")}/${filename}`,
        type: "text",
        createdAt: new Date().toISOString(),
      });

      taskStore.updateServe(serveCopy);
      toast(`📎 凭证“${filename}”已自动复制并归档至本地 3_SERVE/evidence/ 目录下！`);
    } else {
      toast("凭证归档物理拷贝失败");
    }
  } catch (err) {
    console.error(err);
    toast("凭证归档发生错误");
  }
}

function getChecklistSummary(items?: ChecklistItem[]) {
  const total = items?.length ?? 0;
  if (total === 0) return "未配置";
  const completed = items?.filter((item) => item.completed).length ?? 0;
  return `${completed}/${total}`;
}

function toggleChecklistItem(serve: Serve, itemId: string) {
  const serveCopy = { ...serve };
  if (!serveCopy.acceptanceChecklist) return;
  const item = serveCopy.acceptanceChecklist.find((c) => c.id === itemId);
  if (item) {
    item.completed = !item.completed;

    const allDone = serveCopy.acceptanceChecklist.every((c) => c.completed);
    if (allDone && serveCopy.status !== "delivered") {
      serveCopy.status = "delivered";
      serveCopy.acceptanceStatus = "accepted";
    } else if (!allDone) {
      serveCopy.status = "active";
      serveCopy.acceptanceStatus = "pending";
    }

    taskStore.updateServe(serveCopy);
  }
}

async function aggregateActionsToReport(serve: Serve) {
  if (!activeProject.value || !activeProject.value.localPath) {
    toast("该项目未绑定本地映射路径，无法生成物理报告");
    return;
  }

  const actions = taskStore.actions.filter((a) => a.projectId === taskStore.activeProjectId);
  if (actions.length === 0) {
    toast("项目下暂无任何行动卡片，无法进行自测汇总");
    return;
  }

  const cleanTitle = serve.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_");
  const reportsDir = `${activeProject.value.localPath}/3_SERVE/reports`;
  const filename = `3_测试用例_${cleanTitle}.md`;

  let content = `# 🧪 测试用例与验证报告 - ${serve.title}\n\n` + `## 1. 交付与测试概述\n- **交付目标**: ${serve.title}\n- **核心交付物**: 物理交付文档与系统功能验证\n- **自测汇总时间**: ${new Date().toLocaleString()}\n\n` + `## 2. 看板 Action 全量自测用例明细 (自动汇总)\n\n`;

  actions.forEach((a, idx) => {
    const statusText = a.status === "done" ? "✅ 自测已完成" : "⏳ 推进中";
    content += `### [Action-${idx + 1}] ${a.title}\n` + `- **当前状态**: ${statusText}\n` + `- **任务描述**: ${a.description || "无"}\n`;

    if (a.devItems && a.devItems.length > 0) {
      content += `- **💻 开发步骤明细**:\n`;
      a.devItems.forEach((item) => {
        content += `  - [${item.completed ? "x" : " "}] ${item.title}\n`;
      });
    }

    if (a.testItems && a.testItems.length > 0) {
      content += `- **🧪 验证与自测用例**:\n`;
      a.testItems.forEach((item) => {
        content += `  - [${item.completed ? "x" : " "}] ${item.title}\n`;
      });
    } else {
      content += `- **🧪 验证与自测用例**: *(无明确子自测项)*\n`;
    }

    if (a.outputItems && a.outputItems.length > 0) {
      content += `- **📦 预期交付产出**:\n`;
      a.outputItems.forEach((item) => {
        content += `  - [${item.completed ? "x" : " "}] ${item.title}\n`;
      });
    }

    if (a.evidence) {
      content += `- **自测与交付凭证**: ${a.evidence}\n`;
    }
    content += `\n`;
  });

  content += `## 3. 交付验收清单 (Checklist) 状态\n`;
  if (serve.acceptanceChecklist && serve.acceptanceChecklist.length > 0) {
    serve.acceptanceChecklist.forEach((item) => {
      content += `- [${item.completed ? "x" : " "}] ${item.title}\n`;
    });
  } else {
    content += `- [ ] 默认验收项\n`;
  }

  try {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const filePath = `${reportsDir}/${filename}`;
    await writeTextFile(filePath, content);

    const matchedEvidence = serve.evidence?.some((e) => e.content.includes(filename));
    if (!matchedEvidence) {
      const serveCopy = { ...serve };
      if (!serveCopy.evidence) serveCopy.evidence = [];
      serveCopy.evidence.push({
        id: uuid(),
        title: `汇总测试用例文档: ${filename}`,
        content: `./reports/${filename}`,
        type: "text",
        createdAt: new Date().toISOString(),
      });
      taskStore.updateServe(serveCopy);
    }

    toast(`📊 测试用例文档已一键汇总并写入本地 reports 目录！`);
  } catch (err) {
    console.error(err);
    toast("交付报告汇总写入失败，请检查本地目录权限");
  }
}
</script>

<template>
  <div class="flex-1 min-w-0 overflow-y-auto bg-background/50 p-6 flex flex-col gap-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 p-5 rounded-xl border bg-muted/10 backdrop-blur-md">
      <div>
        <h2 class="text-xl font-semibold flex items-center gap-2">
          <Handshake class="h-5 w-5 text-amber-500" />
          S - SERVE 交付物与文档输出
        </h2>
        <p class="text-xs text-muted-foreground mt-1">针对当前项目目标进行文档输出及自测汇总，直接对齐概要设计、实现方案、测试用例、部署指引及操作文档等 5 个企业级核心交付物。</p>
      </div>
    </div>

    <!-- Main Workspace -->
    <div v-if="activeTarget && currentServe" class="flex flex-col gap-6">
      <!-- Target Info Card & Drop evidence area -->
      <div
        class="group p-5 rounded-xl border bg-background/40 hover:bg-muted/5 transition-all border-border/80 flex flex-col gap-4 shadow-sm relative overflow-hidden"
        :class="draggingOverServe ? 'border-primary bg-primary/5 ring-2 ring-primary/20 scale-[1.01] shadow-lg' : ''"
        @dragenter.prevent="draggingOverServe = true"
        @dragleave.prevent="draggingOverServe = false"
        @dragover.prevent
        @drop.prevent="handleFileDropOnServe($event, currentServe)"
      >
        <!-- Drag & Drop visual overlay -->
        <div v-if="draggingOverServe" class="absolute inset-0 bg-primary/10 flex flex-col items-center justify-center gap-2 pointer-events-none z-10 animate-in fade-in duration-200">
          <div class="h-10 w-10 rounded-full bg-primary/20 text-primary flex items-center justify-center">
            <Paperclip class="h-5 w-5" />
          </div>
          <span class="text-xs font-semibold text-primary">松手即可将该文件拷贝归档为本地交付凭证 🔗</span>
        </div>

        <!-- Target Header Details -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/20 pb-4">
          <div class="space-y-1.5 flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded uppercase tracking-wider">当前交付目标</span>
              <span v-if="activeProject?.localPath" class="text-[10px] text-muted-foreground flex items-center gap-0.5"> <FolderOpen class="h-3 w-3 inline" /> reports: ./3_SERVE/reports/ </span>
            </div>
            <h3 class="font-bold text-base text-foreground truncate">{{ activeTarget.title }}</h3>
            <p v-if="activeTarget.description" class="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {{ activeTarget.description }}
            </p>
          </div>

          <!-- Quick Report Aggregator -->
          <div class="shrink-0 flex items-center gap-2">
            <button
              title="一键提取并汇总看板中所有 Actions 的自测用例成果"
              class="h-9 px-3.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer font-semibold shadow-sm"
              @click="aggregateActionsToReport(currentServe)"
            >
              <FileCheck class="h-4 w-4" />
              一键汇总自测报告
            </button>
          </div>
        </div>

        <!-- Document Grid -->
        <div v-if="activeProject?.localPath" class="space-y-3">
          <div class="text-[11px] font-bold text-muted-foreground/75 uppercase tracking-wider flex items-center gap-1">
            <FileText class="h-4 w-4 text-primary shrink-0" />
            企业级五大核心交付文档
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="docType in [
                { type: 'architecture_design', label: '1. 概要设计文档', desc: '系统模块、数据库表及基础架构设计方案' },
                { type: 'technical_implementation', label: '2. 技术实现方案', desc: '业务流程图、核心算法及核心接口定义' },
                { type: 'test_cases', label: '3. 测试用例与报告', desc: '可执行的测试场景、执行结果及自测汇总（支持一键自动汇总）' },
                { type: 'deployment_guide', label: '4. 上线部署指引', desc: '环境依赖、部署脚本及配置更新记录' },
                { type: 'user_guide', label: '5. 功能操作文档', desc: '供非开发人员使用的用户指南与系统功能指引' },
              ] as const"
              :key="docType.type"
              class="p-3.5 rounded-xl border bg-muted/10 border-border/40 hover:bg-muted/20 transition-all flex flex-col justify-between gap-3"
            >
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-xs text-foreground/90 truncate">{{ docType.label }}</span>
                  <span class="text-[9px] font-semibold px-1.5 py-0.2 rounded-full border" :class="isDocumentGenerated(currentServe, docType.type) ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'">
                    {{ isDocumentGenerated(currentServe, docType.type) ? "已就绪" : "未生成" }}
                  </span>
                </div>
                <p class="text-[10px] text-muted-foreground leading-relaxed">{{ docType.desc }}</p>
              </div>

              <div class="flex items-center gap-1.5 border-t border-border/20 pt-2.5 mt-1 shrink-0 justify-end">
                <template v-if="isDocumentGenerated(currentServe, docType.type)">
                  <button type="button" class="h-7 px-2 bg-primary/5 hover:bg-primary/10 border border-primary/20 text-primary text-[10px] font-semibold rounded cursor-pointer flex items-center gap-0.5 transition-colors" @click="openMarkdownEditor(currentServe, docType.type)">
                    <Eye class="h-3 w-3" /> 在线编辑
                  </button>
                  <button type="button" class="h-7 px-2 hover:bg-muted border text-[10px] font-medium text-muted-foreground hover:text-foreground rounded cursor-pointer flex items-center gap-0.5 transition-colors" @click="importExternalDocument(currentServe, docType.type)">
                    <Paperclip class="h-3 w-3" /> 覆盖
                  </button>
                </template>
                <template v-else>
                  <button type="button" class="h-7 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-semibold rounded cursor-pointer transition-colors" @click="generateDeliverableTemplate(currentServe, docType.type)">+ 初始化</button>
                  <button type="button" class="h-7 px-2 hover:bg-muted border text-[10px] font-medium text-muted-foreground hover:text-foreground rounded cursor-pointer flex items-center gap-0.5 transition-colors" @click="importExternalDocument(currentServe, docType.type)">
                    <Paperclip class="h-3 w-3" /> 导入
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Success Criteria Checklist inside Workspace -->
        <div v-if="currentServe.acceptanceChecklist && currentServe.acceptanceChecklist.length > 0" class="border-t border-border/20 pt-4 flex flex-col gap-2.5">
          <div class="text-[11px] font-bold text-muted-foreground/75 uppercase tracking-wider flex items-center justify-between gap-1 w-full shrink-0">
            <span class="flex items-center gap-1">
              <ClipboardCheck class="h-4 w-4 text-primary shrink-0" />
              核心目标验收状态 (Checklist: {{ getChecklistSummary(currentServe.acceptanceChecklist) }})
            </span>
            <button
              type="button"
              class="inline-flex h-6 items-center justify-center rounded border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 px-2 text-[10px] font-medium transition-all gap-1 cursor-pointer"
              @click="handleAiRecommendAcceptance"
              :disabled="aiRecommending"
            >
              <Sparkles v-if="!aiRecommending" class="h-3 w-3" />
              <Loader2 v-else class="h-3 w-3 animate-spin" />
              {{ aiRecommending ? "AI 生成中..." : "AI 推荐验收条件" }}
            </button>
          </div>
          <div class="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            <div v-for="item in currentServe.acceptanceChecklist" :key="item.id" class="inner-group flex items-start gap-2.5 text-xs py-2 px-3 rounded-lg border bg-muted/15 border-border/40 hover:bg-muted/30 transition-all w-full min-w-0">
              <button class="flex items-start gap-2 text-left flex-1 min-w-0 cursor-pointer" @click="toggleChecklistItem(currentServe, item.id)">
                <CheckCircle2 v-if="item.completed" class="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <Circle v-else class="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span :class="{ 'line-through text-muted-foreground/50': item.completed }" class="flex-1 whitespace-normal break-words leading-relaxed text-[11px] font-medium">
                  {{ item.title }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Evidence checklist/files showing -->
        <div v-if="currentServe.evidence && currentServe.evidence.length > 0" class="border-t border-border/20 pt-4 flex flex-col gap-2">
          <div class="text-[11px] font-bold text-muted-foreground/75 uppercase tracking-wider flex items-center gap-1">
            <Paperclip class="h-4 w-4 text-primary shrink-0" />
            已归档交付凭证与记录 ({{ currentServe.evidence.length }} 条)
          </div>
          <div class="flex flex-wrap gap-2">
            <div v-for="ev in currentServe.evidence" :key="ev.id" class="px-2.5 py-1 bg-muted rounded-full border border-border/40 text-[10px] text-muted-foreground font-medium flex items-center gap-1.5">
              <span>📎</span>
              <span class="truncate max-w-[200px]" :title="ev.title">{{ ev.title }}</span>
              <span class="text-muted-foreground/40 font-mono scale-90">{{ ev.content.replace(/^\.\//, "") }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State / No Target configured -->
    <div v-else class="flex-1 flex flex-col items-center justify-center gap-3 p-12 text-center rounded-xl border border-dashed border-border/80 bg-background/20 max-w-2xl mx-auto my-12">
      <div class="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground shadow-sm">
        <Handshake class="h-6 w-6" />
      </div>
      <div>
        <h3 class="font-semibold text-sm text-foreground">暂未建立项目交付目标</h3>
        <p class="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">T - TARGET 是行动与交付的根基。请先前往 **T - TARGET 目标章程** 页面规划核心目标及成功标准，随后系统将自动为您开辟该目标的五大核心交付文档输出台。</p>
      </div>
    </div>

    <!-- Markdown File Editor Dialog Modal (Online Edit) -->
    <div v-if="showEditorDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div class="w-full max-w-[850px] h-[85vh] rounded-xl border bg-background/80 backdrop-blur-md p-6 shadow-2xl flex flex-col gap-4 relative animate-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer" @click="showEditorDialog = false">
          <X class="h-4 w-4" />
        </button>

        <div class="flex items-center gap-2 border-b border-border/40 pb-3">
          <div class="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <FileText class="h-4 w-4" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-foreground">{{ editingFileTitle }}</h3>
            <p class="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[650px]">{{ editingFilePath }}</p>
          </div>
        </div>

        <div class="flex-1 min-h-0 flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>在线预览与编辑物理 Markdown 文档</span>
            <span class="text-[10px] bg-muted px-2 py-0.5 rounded">Markdown 格式</span>
          </div>
          <textarea
            v-model="editorContent"
            placeholder="在此直接输入或编辑交付文档内容..."
            class="flex-1 w-full rounded-lg border border-input bg-muted/10 p-4 text-xs font-mono shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none leading-relaxed"
            @paste="handleTextareaPaste"
            @drop="handleTextareaDrop"
          />
        </div>

        <div class="flex justify-between items-center border-t pt-3 border-border/40 shrink-0">
          <span class="text-[11px] text-muted-foreground italic">⚠️ 修改后将直接保存写入本地的物理项目文件夹。</span>
          <div class="flex gap-2">
            <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors cursor-pointer" @click="showEditorDialog = false">取消</button>
            <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1 cursor-pointer" @click="saveMarkdownFile">
              <Save class="h-4 w-4" />
              保存并写入本地
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
