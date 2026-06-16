<script setup lang="ts">
import { ref, computed } from "vue";
import { useTaskStore, type Keep } from "@/stores/taskStore";
import { buildProjectRetrospective, exportProjectSnapshot, normalizeImportedProjectSnapshot } from "@/lib/taskPlanning";
import { Plus, Archive, Trash2, Edit, FileText, Link, PackageOpen, ExternalLink, X, Download, Upload, ClipboardList } from "@lucide/vue";

const taskStore = useTaskStore();

// Filter keeps for active project
const projectKeeps = computed(() => {
  return taskStore.keeps.filter((k) => k.projectId === taskStore.activeProjectId);
});

// Classify keeps
const documents = computed(() => projectKeeps.value.filter((k) => k.type === "document"));
const links = computed(() => projectKeeps.value.filter((k) => k.type === "link"));
const archives = computed(() => projectKeeps.value.filter((k) => k.type === "archive"));

// Dialog state
const showDialog = ref(false);
const isEdit = ref(false);
const editId = ref("");
const formName = ref("");
const formType = ref<"document" | "link" | "archive">("document");
const formContent = ref("");
const importInputRef = ref<HTMLInputElement | null>(null);

// Selected keep details (for reading documents)
const selectedKeepForView = ref<Keep | null>(null);
const activeProject = computed(() => taskStore.projects.find((p) => p.id === taskStore.activeProjectId));

function openAddDialog() {
  isEdit.value = false;
  editId.value = "";
  formName.value = "";
  formType.value = "document";
  formContent.value = "";
  showDialog.value = true;
}

function openEditDialog(keep: Keep) {
  isEdit.value = true;
  editId.value = keep.id;
  formName.value = keep.name;
  formType.value = keep.type;
  formContent.value = keep.content;
  showDialog.value = true;
}

function submitForm() {
  if (!formName.value.trim() || !formContent.value.trim()) return;

  if (isEdit.value) {
    const existing = taskStore.keeps.find((k) => k.id === editId.value);
    if (existing) {
      existing.name = formName.value.trim();
      existing.type = formType.value;
      existing.content = formContent.value.trim();
      taskStore.updateKeep(existing);
    }
  } else {
    taskStore.addKeep(formName.value.trim(), formType.value, formContent.value.trim());
  }
  showDialog.value = false;
}

function deleteKeep(id: string) {
  if (confirm("确定要删除这个存档记录吗？")) {
    taskStore.deleteKeep(id);
    if (selectedKeepForView.value?.id === id) {
      selectedKeepForView.value = null;
    }
  }
}

function visitLink(url: string) {
  let finalUrl = url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    finalUrl = "https://" + url;
  }
  window.open(finalUrl, "_blank");
}

function createRetrospective() {
  if (!activeProject.value) return;
  const retrospective = buildProjectRetrospective(activeProject.value, projectKeepsProjectTargets.value, projectKeepsProjectActions.value, projectKeepsProjectServes.value, projectKeeps.value);
  taskStore.addKeep(`项目复盘 - ${activeProject.value.name}`, "document", retrospective);
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

const projectKeepsProjectTargets = computed(() => taskStore.targets.filter((t) => t.projectId === taskStore.activeProjectId));
const projectKeepsProjectActions = computed(() => taskStore.actions.filter((a) => a.projectId === taskStore.activeProjectId));
const projectKeepsProjectServes = computed(() => taskStore.serves.filter((s) => s.projectId === taskStore.activeProjectId));

function getKeepIcon(type: "document" | "link" | "archive") {
  switch (type) {
    case "document":
      return FileText;
    case "link":
      return Link;
    case "archive":
      return PackageOpen;
  }
}

function getKeepBadgeClass(type: "document" | "link" | "archive") {
  switch (type) {
    case "document":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "link":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case "archive":
      return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
  }
}

function getKeepLabel(type: "document" | "link" | "archive") {
  switch (type) {
    case "document":
      return "知识文档";
    case "link":
      return "快捷链接";
    case "archive":
      return "归档版本";
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
          <p class="text-xs text-muted-foreground mt-1">项目资产需要积累。沉淀有价值的文档、快捷工具网页、归档包，告别项目碎片化。</p>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <button class="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-medium hover:bg-muted transition-colors gap-1" @click="createRetrospective">
            <ClipboardList class="h-4 w-4" />
            生成复盘
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
      <!-- Documents Column -->
      <div class="rounded-xl border border-border/60 bg-muted/5 flex flex-col min-h-[450px] p-4 gap-4">
        <div class="flex items-center justify-between border-b pb-2 border-border/40">
          <div class="flex items-center gap-2">
            <FileText class="h-4 w-4 text-blue-500" />
            <h3 class="font-medium text-sm text-foreground">知识与文档</h3>
            <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
              {{ documents.length }}
            </span>
          </div>
        </div>

        <div class="flex-1 flex flex-col gap-3">
          <div v-for="keep in documents" :key="keep.id" class="group p-4 rounded-lg border bg-background/50 hover:bg-muted/10 transition-all border-border/80 relative shadow-sm cursor-pointer" @click="selectedKeepForView = keep">
            <div class="flex items-start justify-between gap-2">
              <h4 class="font-medium text-sm truncate pr-6">{{ keep.name }}</h4>
              <div class="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground" @click.stop="openEditDialog(keep)">
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
          </div>
          <div v-if="documents.length === 0" class="py-10 text-center border border-dashed border-border/30 rounded-lg text-muted-foreground/40 text-xs italic">无沉淀文档</div>
        </div>
      </div>

      <!-- Links Column -->
      <div class="rounded-xl border border-border/60 bg-muted/5 flex flex-col min-h-[450px] p-4 gap-4">
        <div class="flex items-center justify-between border-b pb-2 border-border/40">
          <div class="flex items-center gap-2">
            <Link class="h-4 w-4 text-purple-500" />
            <h3 class="font-medium text-sm text-foreground">网址与快捷链接</h3>
            <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
              {{ links.length }}
            </span>
          </div>
        </div>

        <div class="flex-1 flex flex-col gap-3">
          <div v-for="keep in links" :key="keep.id" class="group p-4 rounded-lg border bg-background/50 hover:bg-muted/10 transition-all border-border/80 relative shadow-sm">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h4 class="font-medium text-sm truncate pr-1">{{ keep.name }}</h4>
                <button class="text-[10px] text-purple-500 font-medium hover:underline truncate inline-flex items-center gap-0.5 mt-1.5 max-w-full text-left" @click="visitLink(keep.content)">
                  {{ keep.content }}
                  <ExternalLink class="h-2.5 w-2.5 shrink-0" />
                </button>
              </div>

              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4">
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground" @click="openEditDialog(keep)">
                  <Edit class="h-3 w-3" />
                </button>
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click="deleteKeep(keep.id)">
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
          <div v-if="links.length === 0" class="py-10 text-center border border-dashed border-border/30 rounded-lg text-muted-foreground/40 text-xs italic">无记录链接</div>
        </div>
      </div>

      <!-- Archives Column -->
      <div class="rounded-xl border border-border/60 bg-muted/5 flex flex-col min-h-[450px] p-4 gap-4">
        <div class="flex items-center justify-between border-b pb-2 border-border/40">
          <div class="flex items-center gap-2">
            <PackageOpen class="h-4 w-4 text-indigo-500" />
            <h3 class="font-medium text-sm text-foreground">归档包与交付版本</h3>
            <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
              {{ archives.length }}
            </span>
          </div>
        </div>

        <div class="flex-1 flex flex-col gap-3">
          <div v-for="keep in archives" :key="keep.id" class="group p-4 rounded-lg border bg-background/50 hover:bg-muted/10 transition-all border-border/80 relative shadow-sm">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h4 class="font-medium text-sm truncate pr-1">{{ keep.name }}</h4>
                <p class="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap leading-relaxed select-all">
                  {{ keep.content }}
                </p>
              </div>

              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4">
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground" @click="openEditDialog(keep)">
                  <Edit class="h-3 w-3" />
                </button>
                <button class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click="deleteKeep(keep.id)">
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
          <div v-if="archives.length === 0" class="py-10 text-center border border-dashed border-border/30 rounded-lg text-muted-foreground/40 text-xs italic">无归档记录</div>
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
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="t in ['document', 'link', 'archive'] as const"
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

          <!-- Content -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">存档内容</label>
            <textarea
              v-model="formContent"
              :placeholder="formType === 'link' ? '请输入完整的网址链接，例如: github.com/username/project' : '请输入具体文档备忘详情，或百度网盘/云盘下载下载提取地址...'"
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
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors" @click="selectedKeepForView = null">关闭阅读</button>
          <button
            class="h-9 inline-flex items-center justify-center rounded-lg bg-primary/20 hover:bg-primary/30 text-foreground px-4 text-sm font-medium transition-colors"
            @click="
              openEditDialog(selectedKeepForView);
              selectedKeepForView = null;
            "
          >
            编辑文档
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
