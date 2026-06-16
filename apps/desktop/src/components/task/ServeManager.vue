<script setup lang="ts">
import { ref, computed } from "vue";
import { useTaskStore, type Serve } from "@/stores/taskStore";
import type { AcceptanceStatus } from "@/lib/taskPlanning";
import { Plus, Handshake, Trash2, Edit, CheckSquare, Users, FileCheck, X } from "@lucide/vue";

const taskStore = useTaskStore();

// Filter serves for active project
const projectServes = computed(() => {
  return taskStore.serves.filter((s) => s.projectId === taskStore.activeProjectId);
});

// Dialog state
const showDialog = ref(false);
const isEdit = ref(false);
const editId = ref("");
const formTitle = ref("");
const formDescription = ref("");
const formDeliverable = ref("");
const formClient = ref("");
const formStatus = ref<"draft" | "active" | "delivered">("draft");
const formDeliveredAt = ref("");
const formAcceptanceStatus = ref<AcceptanceStatus>("pending");

function openAddDialog() {
  isEdit.value = false;
  editId.value = "";
  formTitle.value = "";
  formDescription.value = "";
  formDeliverable.value = "";
  formClient.value = "";
  formStatus.value = "draft";
  formDeliveredAt.value = "";
  formAcceptanceStatus.value = "pending";
  showDialog.value = true;
}

function openEditDialog(serve: Serve) {
  isEdit.value = true;
  editId.value = serve.id;
  formTitle.value = serve.title;
  formDescription.value = serve.description;
  formDeliverable.value = serve.deliverable;
  formClient.value = serve.client;
  formStatus.value = serve.status;
  formDeliveredAt.value = serve.deliveredAt || "";
  formAcceptanceStatus.value = serve.acceptanceStatus || "pending";
  showDialog.value = true;
}

function submitForm() {
  if (!formTitle.value.trim()) return;

  if (isEdit.value) {
    const existing = taskStore.serves.find((s) => s.id === editId.value);
    if (existing) {
      existing.title = formTitle.value.trim();
      existing.description = formDescription.value.trim();
      existing.deliverable = formDeliverable.value.trim();
      existing.client = formClient.value.trim();
      existing.status = formStatus.value;
      existing.deliveredAt = formDeliveredAt.value || undefined;
      existing.acceptanceStatus = formAcceptanceStatus.value;
      taskStore.updateServe(existing);
    }
  } else {
    taskStore.addServe(formTitle.value.trim(), formDescription.value.trim(), formDeliverable.value.trim(), formClient.value.trim(), formStatus.value, formDeliveredAt.value || undefined, formAcceptanceStatus.value);
  }
  showDialog.value = false;
}

function deleteServe(id: string) {
  if (confirm("确定要删除这个服务交付吗？")) {
    taskStore.deleteServe(id);
  }
}

// Visual helpers for Status
function getStatusBadge(status: "draft" | "active" | "delivered") {
  switch (status) {
    case "delivered":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "active":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "draft":
      return "bg-slate-500/10 text-slate-500 border-slate-500/20";
  }
}

function getStatusLabel(status: "draft" | "active" | "delivered") {
  switch (status) {
    case "delivered":
      return "已完成交付";
    case "active":
      return "持续服务中";
    case "draft":
      return "规划草案";
  }
}

function getAcceptanceBadge(status: AcceptanceStatus) {
  switch (status) {
    case "accepted":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "changes_requested":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "pending":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  }
}

function getAcceptanceLabel(status: AcceptanceStatus) {
  switch (status) {
    case "accepted":
      return "验收通过";
    case "changes_requested":
      return "需调整";
    case "pending":
      return "待验收";
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
            <Handshake class="h-5 w-5 text-amber-500" />
            S - SERVE 服务与价值
          </h2>
          <p class="text-xs text-muted-foreground mt-1">项目不是空中楼阁。明确服务对象与核心交付物，记录每一份项目价值产出。</p>
        </div>
        <button class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1" @click="openAddDialog">
          <Plus class="h-4 w-4" />
          规划服务/交付
        </button>
      </div>
    </div>

    <!-- Grid items -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6" v-if="projectServes.length > 0">
      <div v-for="serve in projectServes" :key="serve.id" class="group p-5 rounded-xl border bg-background/40 hover:bg-muted/10 transition-all border-border/80 flex flex-col gap-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full border shrink-0" :class="getStatusBadge(serve.status)">
                {{ getStatusLabel(serve.status) }}
              </span>
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full border shrink-0" :class="getAcceptanceBadge(serve.acceptanceStatus)">
                {{ getAcceptanceLabel(serve.acceptanceStatus) }}
              </span>
            </div>
            <h3 class="font-medium text-base truncate mt-2">{{ serve.title }}</h3>
            <p class="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2" v-if="serve.description">
              {{ serve.description }}
            </p>
          </div>

          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button class="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground" @click="openEditDialog(serve)">
              <Edit class="h-3.5 w-3.5" />
            </button>
            <button class="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click="deleteServe(serve.id)">
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <!-- Metadata specs -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-auto border-t border-border/40 pt-3 text-xs">
          <!-- Client served -->
          <div class="flex items-start gap-2.5 bg-muted/20 p-2.5 rounded-lg border border-border/20">
            <Users class="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div class="min-w-0">
              <div class="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">服务对象 / 需求方</div>
              <div class="font-medium text-foreground truncate mt-0.5">{{ serve.client || "未定义对象" }}</div>
            </div>
          </div>

          <!-- Major Deliverable -->
          <div class="flex items-start gap-2.5 bg-muted/20 p-2.5 rounded-lg border border-border/20">
            <FileCheck class="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div class="min-w-0">
              <div class="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">核心交付物 / 产出物</div>
              <div class="font-medium text-foreground truncate mt-0.5">{{ serve.deliverable || "未定义交付物" }}</div>
            </div>
          </div>

          <div class="flex items-start gap-2.5 bg-muted/20 p-2.5 rounded-lg border border-border/20 sm:col-span-2">
            <CheckSquare class="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div class="min-w-0">
              <div class="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">交付日期 / 验收状态</div>
              <div class="font-medium text-foreground truncate mt-0.5">{{ serve.deliveredAt || "未填写交付日期" }} · {{ getAcceptanceLabel(serve.acceptanceStatus) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex-1 flex flex-col items-center justify-center gap-3 p-12 text-center rounded-xl border border-dashed border-border/80 bg-background/20">
      <div class="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground">
        <Handshake class="h-6 w-6" />
      </div>
      <div>
        <h3 class="font-medium text-sm">暂未建立服务价值模型</h3>
        <p class="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">S - SERVE 服务将您的项目努力同外部用户的实际需求相连接。添加您为他人提供或交付的价值服务。</p>
      </div>
      <button class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1 mt-2" @click="openAddDialog">
        <Plus class="h-4 w-4" />
        规划第一项交付
      </button>
    </div>

    <!-- Dialog Modal -->
    <div v-if="showDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div class="w-full max-w-[500px] rounded-xl border bg-background p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground" @click="showDialog = false">
          <X class="h-4 w-4" />
        </button>

        <h3 class="text-base font-semibold">{{ isEdit ? "编辑服务详情" : "规划新服务/交付" }}</h3>

        <div class="flex flex-col gap-4 overflow-y-auto max-h-[60vh] pr-1">
          <!-- Title -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">服务/成果名称</label>
            <input
              v-model="formTitle"
              type="text"
              placeholder="例如：开发数据可视化大屏"
              class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <!-- Description -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">服务背景/成果说明</label>
            <textarea
              v-model="formDescription"
              placeholder="说明此项交付解决了服务对象的哪些痛点，有哪些主要价值..."
              rows="3"
              class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <!-- Client -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">服务对象 / 需求方</label>
            <input v-model="formClient" type="text" placeholder="例如：运营团队、核心合伙人、首批公测用户" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          <!-- Deliverable -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">核心交付物 / 产出物</label>
            <input v-model="formDeliverable" type="text" placeholder="例如：操作手册PDF、编译发布包、数据库Schema" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          <!-- Status -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">交付状态</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="s in ['draft', 'active', 'delivered'] as const"
                :key="s"
                type="button"
                class="h-9 rounded-md border text-xs font-medium flex items-center justify-center transition-colors"
                :class="formStatus === s ? getStatusBadge(s) + ' border-current' : 'border-border hover:bg-muted text-muted-foreground'"
                @click="formStatus = s"
              >
                {{ getStatusLabel(s) }}
              </button>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">交付日期（可选）</label>
            <input v-model="formDeliveredAt" type="date" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">验收状态</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="s in ['pending', 'accepted', 'changes_requested'] as const"
                :key="s"
                type="button"
                class="h-9 rounded-md border text-xs font-medium flex items-center justify-center transition-colors"
                :class="formAcceptanceStatus === s ? getAcceptanceBadge(s) + ' border-current' : 'border-border hover:bg-muted text-muted-foreground'"
                @click="formAcceptanceStatus = s"
              >
                {{ getAcceptanceLabel(s) }}
              </button>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3 border-border/40">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors" @click="showDialog = false">取消</button>
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md" :disabled="!formTitle.trim()" @click="submitForm">保存服务</button>
        </div>
      </div>
    </div>
  </div>
</template>
