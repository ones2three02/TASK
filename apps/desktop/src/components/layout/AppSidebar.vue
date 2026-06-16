<script setup lang="ts">
import { computed, ref } from "vue";
import { useTaskStore } from "@/stores/taskStore";
import { Target, ListTodo, Handshake, Archive, Plus, Trash2, ChevronDown, FolderGit2, FolderPlus, X, Sparkles, LayoutDashboard } from "@lucide/vue";
import AiParserModal from "@/components/task/AiParserModal.vue";

const showAiModal = ref(false);

const props = defineProps<{
  sidebarWidth: number;
  activeModule: "dashboard" | "target" | "action" | "serve" | "keep";
  classicLayout?: boolean;
}>();

const emit = defineEmits<{
  "select-module": [module: "dashboard" | "target" | "action" | "serve" | "keep"];
  startResize: [event: MouseEvent];
}>();

const taskStore = useTaskStore();

// Dropdown state for project switching
const showProjectDropdown = ref(false);

// New project form modal state
const showNewProjectDialog = ref(false);
const newProjectName = ref("");
const newProjectDesc = ref("");

const activeProject = computed(() => {
  return taskStore.projects.find((p) => p.id === taskStore.activeProjectId);
});

function selectProject(id: string) {
  taskStore.activeProjectId = id;
  showProjectDropdown.value = false;
}

function handleCreateProject() {
  if (newProjectName.value.trim()) {
    taskStore.addProject(newProjectName.value.trim(), newProjectDesc.value.trim());
    newProjectName.value = "";
    newProjectDesc.value = "";
    showNewProjectDialog.value = false;
    showProjectDropdown.value = false;
  }
}

function handleDeleteProject() {
  if (!activeProject.value) return;
  if (confirm(`确定要删除项目「${activeProject.value.name}」吗？这将删除该项目下的所有目标、任务及归档文件，此操作不可恢复。`)) {
    taskStore.deleteProject(activeProject.value.id);
  }
}
</script>

<template>
  <div class="h-full shrink-0 relative select-none" :class="classicLayout ? '' : 'rounded-md border border-border/80 bg-background'" :style="{ width: sidebarWidth + 'px' }">
    <div class="h-full flex flex-col overflow-hidden">
      <!-- Project Selection Header -->
      <div class="p-3 border-b border-border/60 bg-muted/10 relative">
        <label class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 block mb-1.5">当前项目</label>

        <div class="relative">
          <button class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-background/50 hover:bg-muted/50 transition-all text-left text-sm font-medium" @click="showProjectDropdown = !showProjectDropdown">
            <span class="truncate flex items-center gap-2">
              <FolderGit2 class="h-4 w-4 text-primary shrink-0" />
              {{ activeProject ? activeProject.name : "选择或创建项目" }}
            </span>
            <ChevronDown class="h-4 w-4 text-muted-foreground shrink-0" />
          </button>

          <!-- Dropdown List -->
          <div v-if="showProjectDropdown" class="absolute top-full left-0 right-0 z-50 mt-1.5 rounded-lg border bg-background shadow-xl p-1 divide-y divide-border/40 animate-in fade-in slide-in-from-top-1 duration-150">
            <div class="py-1">
              <button
                v-for="project in taskStore.projects"
                :key="project.id"
                class="w-full text-left px-3 py-2 text-xs rounded hover:bg-muted/80 flex items-center justify-between"
                :class="{ 'bg-primary/10 text-primary font-semibold': project.id === taskStore.activeProjectId }"
                @click="selectProject(project.id)"
              >
                <span class="truncate">{{ project.name }}</span>
              </button>
            </div>

            <div class="pt-1">
              <button class="w-full text-left px-3 py-2 text-xs text-primary font-medium hover:bg-primary/5 rounded flex items-center gap-2" @click="showNewProjectDialog = true">
                <FolderPlus class="h-3.5 w-3.5" />
                新建 TASK 项目...
              </button>
            </div>
          </div>
        </div>

        <p class="text-[11px] text-muted-foreground/80 mt-1.5 line-clamp-2 px-1 leading-normal" v-if="activeProject">
          {{ activeProject.description || "无项目详细描述。" }}
        </p>

        <button v-if="activeProject" class="w-full h-7 mt-2 inline-flex items-center justify-center rounded-md border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-500 text-[11px] font-semibold transition-all gap-1 shadow-sm select-none" @click="showAiModal = true">
          <Sparkles class="h-3.5 w-3.5" />
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
