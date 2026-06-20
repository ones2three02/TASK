<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useTaskStore } from "@/stores/taskStore";
import { Target, ListTodo, Handshake, Archive, Plus, Trash2, ChevronDown, FolderGit2, FolderPlus, X, Sparkles, LayoutDashboard, FolderOpen, Calendar } from "@lucide/vue";
import AiParserModal from "@/components/task/AiParserModal.vue";
import { isTauriRuntime } from "@/lib/tauriRuntime";
import { useToast } from "@/composables/useToast";

const { toast } = useToast();

const showAiModal = ref(false);

const props = defineProps<{
  sidebarWidth: number;
  activeModule: "dashboard" | "target" | "action" | "serve" | "keep" | "calendar";
  classicLayout?: boolean;
}>();

const emit = defineEmits<{
  "select-module": [module: "dashboard" | "target" | "action" | "serve" | "keep" | "calendar"];
  startResize: [event: MouseEvent];
}>();

const taskStore = useTaskStore();
const isDesktop = ref(false);

onMounted(() => {
  isDesktop.value = isTauriRuntime();
  // Fallback retry in case the webview initialization has a slight delay in injecting globals
  if (!isDesktop.value) {
    setTimeout(() => {
      isDesktop.value = isTauriRuntime();
    }, 200);
  }
});

// Dropdown state for project switching
const showProjectDropdown = ref(false);

// New project form modal state
const showNewProjectDialog = ref(false);
const newProjectName = ref("");
const newProjectDesc = ref("");
const newProjectLocalPath = ref("");

const activeProject = computed(() => {
  return taskStore.projects.find((p) => p.id === taskStore.activeProjectId);
});

function selectProject(id: string) {
  taskStore.activeProjectId = id;
  showProjectDropdown.value = false;
}

async function selectLocalPath() {
  if (!isTauriRuntime()) return;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择项目本地根目录",
    });
    if (typeof selected === "string") {
      newProjectLocalPath.value = selected;
    }
  } catch (e) {
    console.error("[TASK] Failed to select folder", e);
  }
}

async function openLocalFolder(path: string) {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_saved_sql_storage_dir", { dir: path });
  } catch (e) {
    console.error("[TASK] Failed to open folder via tauri invoke", e);
    toast("无法打开本地文件夹，请检查目录权限或确认其存在。");
  }
}

function handleCreateProject() {
  if (newProjectName.value.trim()) {
    const newProj = taskStore.addProject(newProjectName.value.trim(), newProjectDesc.value.trim(), newProjectLocalPath.value || undefined);

    // Explicitly set the active project ID to switch to the newly created project
    if (newProj && newProj.id) {
      taskStore.activeProjectId = newProj.id;
    }

    newProjectName.value = "";
    newProjectDesc.value = "";
    newProjectLocalPath.value = "";
    showNewProjectDialog.value = false;
    showProjectDropdown.value = false;

    // Switch active view to dashboard to welcome the user into the new project
    emit("select-module", "dashboard");
  }
}

async function handleDeleteProject(project?: any) {
  const targetProj = project || activeProject.value;
  if (!targetProj) return;

  const isSelf = targetProj.id === taskStore.activeProjectId;

  const firstConfirm = confirm(`确定要删除项目「${targetProj.name}」吗？这会清除该项目在应用中的所有目标、行动和交付记录。`);
  if (!firstConfirm) return;

  const localPath = targetProj.localPath;
  if (localPath) {
    const secondConfirm = confirm(`【二次确认】此操作不可逆！该项目关联的本地物理文件夹「${localPath}」及其中的所有存档物理文档、图片和子目录也将会从磁盘上被永久删除！\n\n确定要彻底删除该物理目录吗？`);
    if (!secondConfirm) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_project_local_folder", { path: localPath });
      toast("🗑️ 项目本地物理文件夹及存档文件已从磁盘中永久删除");
    } catch (e) {
      console.error("[TASK] Failed to delete local project folder", e);
      toast("本地物理文件夹删除失败，请检查目录权限或手动删除。");
    }
  }

  taskStore.deleteProject(targetProj.id);
  if (isSelf) {
    emit("select-module", "dashboard");
  }
}

function getProjectStats(projectId: string) {
  const projTargets = taskStore.targets.filter((t) => t.projectId === projectId);
  const targetsTotal = projTargets.length;
  const targetsCompleted = projTargets.filter((t) => t.status === "completed").length;

  const projActions = taskStore.actions.filter((a) => a.projectId === projectId);
  const actionsTotal = projActions.length;
  const actionsCompleted = projActions.filter((a) => a.status === "done").length;

  const projDocs = taskStore.serves.filter((s) => s.projectId === projectId).length + taskStore.keeps.filter((k) => k.projectId === projectId).length;

  return {
    targetsTotal,
    targetsCompleted,
    actionsTotal,
    actionsCompleted,
    docs: projDocs,
  };
}

const activeProjectStats = computed(() => {
  if (!taskStore.activeProjectId) return null;
  return getProjectStats(taskStore.activeProjectId);
});
</script>

<template>
  <div class="h-full shrink-0 relative select-none" :class="classicLayout ? '' : 'rounded-md border border-border/80 bg-background'" :style="{ width: sidebarWidth + 'px' }">
    <div class="h-full flex flex-col overflow-hidden">
      <!-- Project Selection Header -->
      <div class="p-3 border-b border-border/60 bg-muted/10 relative">
        <label class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 block mb-1.5">当前项目</label>

        <div class="relative">
          <button class="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border bg-background/50 hover:bg-muted/50 transition-all text-left text-sm font-medium shadow-xs hover:border-primary/30" @click="showProjectDropdown = !showProjectDropdown">
            <span class="truncate flex items-center gap-2">
              <FolderGit2 class="h-4 w-4 text-primary shrink-0 animate-pulse" v-if="activeProjectStats && activeProjectStats.actionsTotal > 0 && activeProjectStats.actionsCompleted < activeProjectStats.actionsTotal" />
              <FolderGit2 class="h-4 w-4 text-primary shrink-0" v-else />
              {{ activeProject ? activeProject.name : "选择或创建项目" }}
            </span>
            <ChevronDown class="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200" :class="{ 'rotate-180': showProjectDropdown }" />
          </button>

          <!-- Dropdown List -->
          <div v-if="showProjectDropdown" class="absolute top-full left-0 right-0 z-50 mt-1.5 max-h-[380px] overflow-y-auto rounded-lg border border-border/70 bg-background/95 backdrop-blur-md shadow-2xl p-1 divide-y divide-border/40 animate-in fade-in slide-in-from-top-1 duration-150">
            <div class="py-1 space-y-1">
              <div
                v-for="project in taskStore.projects"
                :key="project.id"
                class="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/80 flex flex-col gap-1 transition-all border border-transparent hover:border-border/40 relative group/item cursor-pointer"
                :class="project.id === taskStore.activeProjectId ? 'bg-primary/10 border-primary/20 hover:bg-primary/15' : ''"
                @click="selectProject(project.id)"
              >
                <div class="flex items-center justify-between w-full min-w-0">
                  <span class="truncate flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <FolderGit2 v-if="project.id === taskStore.activeProjectId" class="h-3.5 w-3.5 text-primary shrink-0" />
                    <FolderOpen v-else class="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
                    {{ project.name }}
                  </span>
                  <!-- Delete project button (shows on hover) -->
                  <button
                    v-if="taskStore.projects.length > 1"
                    type="button"
                    class="h-5 w-5 rounded hover:bg-destructive/10 hover:text-destructive flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity cursor-pointer"
                    @click.stop="handleDeleteProject(project)"
                    title="删除项目"
                  >
                    <Trash2 class="h-3 w-3" />
                  </button>
                </div>

                <p class="text-[10px] text-muted-foreground/80 truncate w-full px-0.5" v-if="project.description">
                  {{ project.description }}
                </p>
                <p class="text-[9px] text-muted-foreground/50 truncate w-full px-0.5" v-else-if="project.localPath">
                  {{ project.localPath }}
                </p>

                <div class="flex items-center gap-3 mt-1.5 text-[9px] text-muted-foreground/75 px-0.5">
                  <span class="flex items-center gap-1">
                    <Target class="h-2.5 w-2.5 text-indigo-500" />
                    目标: {{ getProjectStats(project.id).targetsCompleted }}/{{ getProjectStats(project.id).targetsTotal }}
                  </span>
                  <span class="flex items-center gap-1">
                    <ListTodo class="h-2.5 w-2.5 text-emerald-500" />
                    任务: {{ getProjectStats(project.id).actionsCompleted }}/{{ getProjectStats(project.id).actionsTotal }}
                  </span>
                  <span class="flex items-center gap-1">
                    <Archive class="h-2.5 w-2.5 text-amber-500" />
                    文档: {{ getProjectStats(project.id).docs }}
                  </span>
                </div>
              </div>
            </div>

            <div class="pt-1">
              <button class="w-full text-left px-3 py-2 text-xs text-primary font-medium hover:bg-primary/5 rounded-lg flex items-center gap-2 transition-colors cursor-pointer" @click="showNewProjectDialog = true">
                <FolderPlus class="h-3.5 w-3.5" />
                新建 TASK 项目...
              </button>
            </div>
          </div>
        </div>

        <!-- Sleek active project task progress bar -->
        <div v-if="activeProjectStats && activeProjectStats.actionsTotal > 0" class="mt-2.5 px-1 space-y-1">
          <div class="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
            <span class="flex items-center gap-1"><ListTodo class="h-3 w-3" /> 任务总进度</span>
            <span>{{ activeProjectStats.actionsCompleted }}/{{ activeProjectStats.actionsTotal }} ({{ Math.round((activeProjectStats.actionsCompleted / activeProjectStats.actionsTotal) * 100) }}%)</span>
          </div>
          <div class="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div class="h-full bg-primary transition-all duration-500 rounded-full" :style="{ width: `${(activeProjectStats.actionsCompleted / activeProjectStats.actionsTotal) * 100}%` }" />
          </div>
        </div>

        <p class="text-[11px] text-muted-foreground/80 mt-2 line-clamp-2 px-1 leading-normal" v-if="activeProject">
          {{ activeProject.description || "无项目详细描述。" }}
        </p>

        <div v-if="activeProject?.localPath" class="mt-2 flex items-center justify-between px-1 bg-muted/20 border border-border/40 rounded-lg p-1.5">
          <span class="text-[9px] text-muted-foreground truncate max-w-[130px] flex items-center gap-1" :title="activeProject.localPath">
            <FolderOpen class="h-3 w-3 text-muted-foreground shrink-0" />
            {{ activeProject.localPath }}
          </span>
          <button class="text-[9px] text-primary hover:underline font-semibold shrink-0 cursor-pointer" @click="openLocalFolder(activeProject.localPath)">打开本地目录</button>
        </div>

        <button
          v-if="activeProject"
          class="w-full h-7 mt-2 inline-flex items-center justify-center rounded-md border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 text-[11px] font-semibold transition-all gap-1 shadow-sm select-none cursor-pointer"
          @click="showAiModal = true"
        >
          <Sparkles class="h-3.5 w-3.5 animate-pulse" />
          AI 需求智能拆解...
        </button>
      </div>

      <!-- T-A-S-K Navigation Menu -->
      <div class="flex-1 min-h-0 p-3 flex flex-col gap-2">
        <label class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 block px-1 mb-1">TASK 核心流程</label>

        <button
          class="w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-all hover:bg-muted/50"
          :class="activeModule === 'dashboard' ? 'bg-primary/10 text-primary border-primary/30 font-medium' : 'border-transparent text-muted-foreground'"
          @click="emit('select-module', 'dashboard')"
        >
          <div class="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <LayoutDashboard class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase tracking-wider">DASHBOARD</div>
            <div class="text-[10px] text-muted-foreground/90 truncate mt-0.5">项目健康度和下一步建议</div>
          </div>
        </button>

        <!-- T: Target -->
        <button
          class="w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-all hover:bg-muted/50"
          :class="activeModule === 'target' ? 'bg-primary/10 text-primary border-primary/30 font-medium' : 'border-transparent text-muted-foreground'"
          @click="emit('select-module', 'target')"
        >
          <div class="h-8 w-8 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Target class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase tracking-wider">T - TARGET</div>
            <div class="text-[10px] text-muted-foreground/90 truncate mt-0.5">规划核心目标和里程碑</div>
          </div>
        </button>

        <!-- A: Action -->
        <button
          class="w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-all hover:bg-muted/50"
          :class="activeModule === 'action' ? 'bg-primary/10 text-primary border-primary/30 font-medium' : 'border-transparent text-muted-foreground'"
          @click="emit('select-module', 'action')"
        >
          <div class="h-8 w-8 rounded-md bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <ListTodo class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase tracking-wider">A - ACTION</div>
            <div class="text-[10px] text-muted-foreground/90 truncate mt-0.5">敏捷行动看板与待办清单</div>
          </div>
        </button>

        <!-- S: Serve -->
        <button
          class="w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-all hover:bg-muted/50"
          :class="activeModule === 'serve' ? 'bg-primary/10 text-primary border-primary/30 font-medium' : 'border-transparent text-muted-foreground'"
          @click="emit('select-module', 'serve')"
        >
          <div class="h-8 w-8 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <Handshake class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase tracking-wider">S - SERVE</div>
            <div class="text-[10px] text-muted-foreground/90 truncate mt-0.5">服务对象及核心交付物</div>
          </div>
        </button>

        <!-- K: Keep -->
        <button
          class="w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-all hover:bg-muted/50"
          :class="activeModule === 'keep' ? 'bg-primary/10 text-primary border-primary/30 font-medium' : 'border-transparent text-muted-foreground'"
          @click="emit('select-module', 'keep')"
        >
          <div class="h-8 w-8 rounded-md bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
            <Archive class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase tracking-wider">K - KEEP</div>
            <div class="text-[10px] text-muted-foreground/90 truncate mt-0.5">沉淀知识归档与备份资产</div>
          </div>
        </button>

        <!-- C: Calendar -->
        <button
          class="w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-all hover:bg-muted/50"
          :class="activeModule === 'calendar' ? 'bg-primary/10 text-primary border-primary/30 font-medium' : 'border-transparent text-muted-foreground'"
          @click="emit('select-module', 'calendar')"
        >
          <div class="h-8 w-8 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Calendar class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold uppercase tracking-wider">C - CALENDAR</div>
            <div class="text-[10px] text-muted-foreground/90 truncate mt-0.5">日历看板与任务进度</div>
          </div>
        </button>
      </div>

      <!-- Delete Project Button at the bottom -->
      <div class="p-3 border-t border-border/60 bg-muted/5 mt-auto flex justify-between items-center" v-if="taskStore.projects.length > 1">
        <span class="text-[10px] text-muted-foreground">危险操作区域</span>
        <button class="h-7 px-2 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded text-xs flex items-center gap-1 transition-all" @click="handleDeleteProject">
          <Trash2 class="h-3.5 w-3.5" />
          删除此项目
        </button>
      </div>
    </div>

    <!-- Resize handler -->
    <div class="panel-resize-handle panel-resize-handle--right" @mousedown="emit('startResize', $event)" />

    <!-- Create Project Modal Dialog -->
    <div v-if="showNewProjectDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div class="w-full max-w-[420px] rounded-xl border bg-background p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground" @click="showNewProjectDialog = false">
          <X class="h-4 w-4" />
        </button>

        <h3 class="text-base font-semibold">创建新的 TASK 项目</h3>

        <div class="flex flex-col gap-4">
          <!-- Name -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">项目名称</label>
            <input v-model="newProjectName" type="text" placeholder="请输入项目名称..." class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          <!-- Description -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">项目背景/说明</label>
            <textarea
              v-model="newProjectDesc"
              placeholder="此项目的主要目的或背景说明..."
              rows="3"
              class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none text-xs"
            />
          </div>

          <!-- Local path mapping (Desktop only) -->
          <div v-if="isDesktop" class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>本地物理映射文件夹 (可选)</span>
              <span class="text-[9px] text-muted-foreground/80">将在本地初始化 T-A-S-K 结构</span>
            </label>
            <div class="flex gap-1.5">
              <input v-model="newProjectLocalPath" type="text" placeholder="选择或粘贴本地目录路径..." class="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              <button class="h-9 px-3 text-xs border border-border hover:bg-muted rounded-md cursor-pointer shrink-0 font-medium" @click="selectLocalPath">选择...</button>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3 border-border/40">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors" @click="showNewProjectDialog = false">取消</button>
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md" :disabled="!newProjectName.trim()" @click="handleCreateProject">创建项目</button>
        </div>
      </div>
    </div>
    <AiParserModal :open="showAiModal" @close="showAiModal = false" />
  </div>
</template>
