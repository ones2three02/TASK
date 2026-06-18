<script setup lang="ts">
import { computed, ref } from "vue";
import { useTaskStore, type Serve } from "@/stores/taskStore";
import type { AcceptanceStatus, ChecklistItem, EvidenceItem, EvidenceType, ServeStatus } from "@/lib/taskPlanning";
import { uuid } from "@/lib/utils";
import { Plus, Handshake, Trash2, Edit, Users, FileCheck, X, CalendarDays, ClipboardCheck, Paperclip, RotateCcw } from "@lucide/vue";

const taskStore = useTaskStore();

type ChecklistDraft = ChecklistItem;
type EvidenceDraft = EvidenceItem;

const serveStatuses: ServeStatus[] = ["draft", "active", "delivered", "accepted", "changes_requested"];
const acceptanceStatuses: AcceptanceStatus[] = ["pending", "accepted", "changes_requested"];
const evidenceTypes: EvidenceType[] = ["text", "link", "version"];

const projectServes = computed(() => taskStore.serves.filter((s) => s.projectId === taskStore.activeProjectId));

const showDialog = ref(false);
const isEdit = ref(false);
const editId = ref("");
const formTitle = ref("");
const formDescription = ref("");
const formDeliverable = ref("");
const formClient = ref("");
const formStatus = ref<ServeStatus>("draft");
const formPlannedAt = ref("");
const formDeliveredAt = ref("");
const formAcceptanceStatus = ref<AcceptanceStatus>("pending");
const formAcceptanceChecklist = ref<ChecklistDraft[]>([]);
const formEvidence = ref<EvidenceDraft[]>([]);
const formReworkItems = ref<ChecklistDraft[]>([]);

function cloneChecklist(items?: ChecklistItem[]): ChecklistDraft[] {
  return (items ?? []).map((item) => ({ id: item.id || uuid(), title: item.title, completed: item.completed }));
}

function cloneEvidence(items?: EvidenceItem[]): EvidenceDraft[] {
  return (items ?? []).map((item) => ({
    id: item.id || uuid(),
    title: item.title,
    content: item.content,
    type: item.type,
    createdAt: item.createdAt || new Date().toISOString(),
  }));
}

function sanitizeChecklist(items: ChecklistDraft[]): ChecklistDraft[] {
  return items.map((item) => ({ ...item, title: item.title.trim() })).filter((item) => item.title.length > 0);
}

function sanitizeEvidence(items: EvidenceDraft[]): EvidenceDraft[] {
  return items
    .map((item) => ({ ...item, title: item.title.trim(), content: item.content.trim() }))
    .filter((item) => item.title.length > 0 || item.content.length > 0)
    .map((item) => ({
      ...item,
      title: item.title || getEvidenceTypeLabel(item.type),
      createdAt: item.createdAt || new Date().toISOString(),
    }));
}

function resetForm() {
  formTitle.value = "";
  formDescription.value = "";
  formDeliverable.value = "";
  formClient.value = "";
  formStatus.value = "draft";
  formPlannedAt.value = "";
  formDeliveredAt.value = "";
  formAcceptanceStatus.value = "pending";
  formAcceptanceChecklist.value = [];
  formEvidence.value = [];
  formReworkItems.value = [];
}

function openAddDialog() {
  isEdit.value = false;
  editId.value = "";
  resetForm();
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
  formPlannedAt.value = serve.plannedAt || "";
  formDeliveredAt.value = serve.deliveredAt || "";
  formAcceptanceStatus.value = serve.acceptanceStatus || "pending";
  formAcceptanceChecklist.value = cloneChecklist(serve.acceptanceChecklist);
  formEvidence.value = cloneEvidence(serve.evidence);
  formReworkItems.value = cloneChecklist(serve.reworkItems);
  showDialog.value = true;
}

function addChecklistItem() {
  formAcceptanceChecklist.value.push({ id: uuid(), title: "", completed: false });
}

function removeChecklistItem(id: string) {
  formAcceptanceChecklist.value = formAcceptanceChecklist.value.filter((item) => item.id !== id);
}

function addEvidenceItem() {
  formEvidence.value.push({ id: uuid(), title: "", content: "", type: "text", createdAt: new Date().toISOString() });
}

function removeEvidenceItem(id: string) {
  formEvidence.value = formEvidence.value.filter((item) => item.id !== id);
}

function addReworkItem() {
  formReworkItems.value.push({ id: uuid(), title: "", completed: false });
}

function removeReworkItem(id: string) {
  formReworkItems.value = formReworkItems.value.filter((item) => item.id !== id);
}

function submitForm() {
  if (!formTitle.value.trim()) return;

  const acceptanceChecklist = sanitizeChecklist(formAcceptanceChecklist.value);
  const evidence = sanitizeEvidence(formEvidence.value);
  const reworkItems = sanitizeChecklist(formReworkItems.value);

  if (isEdit.value) {
    const existing = taskStore.serves.find((s) => s.id === editId.value);
    if (existing) {
      taskStore.updateServe({
        ...existing,
        title: formTitle.value.trim(),
        description: formDescription.value.trim(),
        deliverable: formDeliverable.value.trim(),
        client: formClient.value.trim(),
        status: formStatus.value,
        plannedAt: formPlannedAt.value || undefined,
        deliveredAt: formDeliveredAt.value || undefined,
        acceptanceStatus: formAcceptanceStatus.value,
        acceptanceChecklist,
        evidence,
        reworkItems,
      });
    }
  } else {
    taskStore.addServe(formTitle.value.trim(), formDescription.value.trim(), formDeliverable.value.trim(), formClient.value.trim(), formStatus.value, formDeliveredAt.value || undefined, formAcceptanceStatus.value, formPlannedAt.value || undefined, acceptanceChecklist, evidence, reworkItems);
  }
  showDialog.value = false;
}

function deleteServe(id: string) {
  if (confirm("确定要删除这个交付计划吗？")) {
    taskStore.deleteServe(id);
  }
}

function getCompletedCount(items?: ChecklistItem[]) {
  return (items ?? []).filter((item) => item.completed).length;
}

function getChecklistSummary(items?: ChecklistItem[]) {
  const total = items?.length ?? 0;
  if (total === 0) return "未配置";
  return `${getCompletedCount(items)}/${total}`;
}

function formatDate(date?: string) {
  return date || "未填写";
}

function getStatusBadge(status: ServeStatus) {
  switch (status) {
    case "accepted":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "changes_requested":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "delivered":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "active":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "draft":
      return "bg-slate-500/10 text-slate-500 border-slate-500/20";
  }
}

function getStatusLabel(status: ServeStatus) {
  switch (status) {
    case "accepted":
      return "验收完成";
    case "changes_requested":
      return "返工调整";
    case "delivered":
      return "已交付待验收";
    case "active":
      return "交付推进中";
    case "draft":
      return "计划草案";
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
      return "需返工";
    case "pending":
      return "待验收";
  }
}

function getEvidenceTypeLabel(type: EvidenceType) {
  switch (type) {
    case "link":
      return "链接";
    case "version":
      return "版本";
    case "text":
      return "文本";
  }
}
</script>

<template>
  <div class="flex-1 min-w-0 overflow-y-auto bg-background/50 p-6 flex flex-col gap-6">
    <div class="flex flex-col gap-4 p-5 rounded-xl border bg-muted/10 backdrop-blur-md">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold flex items-center gap-2">
            <Handshake class="h-5 w-5 text-amber-500" />
            S - SERVE 交付计划与验收
          </h2>
          <p class="text-xs text-muted-foreground mt-1">把服务价值前置为可计划、可举证、可验收的交付闭环，提前定义需求方、交付物、验收清单与返工记录。</p>
        </div>
        <button class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1 shrink-0" @click="openAddDialog">
          <Plus class="h-4 w-4" />
          新建交付计划
        </button>
      </div>
    </div>

    <div v-if="projectServes.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div v-for="serve in projectServes" :key="serve.id" class="group p-5 rounded-xl border bg-background/40 hover:bg-muted/10 transition-all border-border/80 flex flex-col gap-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full border shrink-0" :class="getStatusBadge(serve.status)">
                {{ getStatusLabel(serve.status) }}
              </span>
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full border shrink-0" :class="getAcceptanceBadge(serve.acceptanceStatus)">
                {{ getAcceptanceLabel(serve.acceptanceStatus) }}
              </span>
            </div>
            <h3 class="font-medium text-base truncate mt-2">{{ serve.title }}</h3>
            <p v-if="serve.description" class="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2">
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

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-auto border-t border-border/40 pt-3 text-xs">
          <div class="flex items-start gap-2.5 bg-muted/20 p-2.5 rounded-lg border border-border/20">
            <Users class="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div class="min-w-0">
              <div class="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">服务对象 / 需求方</div>
              <div class="font-medium text-foreground truncate mt-0.5">{{ serve.client || "未定义对象" }}</div>
            </div>
          </div>

          <div class="flex items-start gap-2.5 bg-muted/20 p-2.5 rounded-lg border border-border/20">
            <FileCheck class="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div class="min-w-0">
              <div class="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">核心交付物 / 产出物</div>
              <div class="font-medium text-foreground truncate mt-0.5">{{ serve.deliverable || "未定义交付物" }}</div>
            </div>
          </div>

          <div class="flex items-start gap-2.5 bg-muted/20 p-2.5 rounded-lg border border-border/20">
            <CalendarDays class="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div class="min-w-0">
              <div class="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">计划 / 实际交付</div>
              <div class="font-medium text-foreground truncate mt-0.5">{{ formatDate(serve.plannedAt) }} / {{ formatDate(serve.deliveredAt) }}</div>
            </div>
          </div>

          <div class="flex items-start gap-2.5 bg-muted/20 p-2.5 rounded-lg border border-border/20">
            <ClipboardCheck class="h-4 w-4 text-cyan-500 shrink-0 mt-0.5" />
            <div class="min-w-0">
              <div class="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">验收清单完成度</div>
              <div class="font-medium text-foreground truncate mt-0.5">{{ getChecklistSummary(serve.acceptanceChecklist) }}</div>
            </div>
          </div>

          <div class="flex items-start gap-2.5 bg-muted/20 p-2.5 rounded-lg border border-border/20">
            <Paperclip class="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
            <div class="min-w-0">
              <div class="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">交付证据</div>
              <div class="font-medium text-foreground truncate mt-0.5">{{ serve.evidence?.length ?? 0 }} 条</div>
            </div>
          </div>

          <div class="flex items-start gap-2.5 bg-muted/20 p-2.5 rounded-lg border border-border/20">
            <RotateCcw class="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div class="min-w-0">
              <div class="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">返工项</div>
              <div class="font-medium text-foreground truncate mt-0.5">{{ getChecklistSummary(serve.reworkItems) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 flex flex-col items-center justify-center gap-3 p-12 text-center rounded-xl border border-dashed border-border/80 bg-background/20">
      <div class="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground">
        <Handshake class="h-6 w-6" />
      </div>
      <div>
        <h3 class="font-medium text-sm">暂未建立交付计划</h3>
        <p class="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">S - SERVE 交付计划与验收用于提前锁定服务对象、交付时间、验收清单、证据和返工闭环。</p>
      </div>
      <button class="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md gap-1 mt-2" @click="openAddDialog">
        <Plus class="h-4 w-4" />
        规划第一项交付
      </button>
    </div>

    <div v-if="showDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div class="w-full max-w-[720px] rounded-xl border bg-background p-6 shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95 duration-200">
        <button class="absolute top-4 right-4 h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground" @click="showDialog = false">
          <X class="h-4 w-4" />
        </button>

        <h3 class="text-base font-semibold">{{ isEdit ? "编辑交付计划与验收" : "新建交付计划与验收" }}</h3>

        <div class="flex flex-col gap-4 overflow-y-auto max-h-[68vh] pr-1">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1.5 md:col-span-2">
              <label class="text-xs font-medium text-muted-foreground">交付计划名称</label>
              <input
                v-model="formTitle"
                type="text"
                placeholder="例如：数据可视化大屏 v1 验收交付"
                class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div class="space-y-1.5 md:col-span-2">
              <label class="text-xs font-medium text-muted-foreground">交付背景 / 成果说明</label>
              <textarea
                v-model="formDescription"
                placeholder="说明此项交付解决了服务对象的哪些问题、验收关注点是什么..."
                rows="3"
                class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">服务对象 / 需求方</label>
              <input v-model="formClient" type="text" placeholder="例如：运营团队、首批公测用户" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">核心交付物 / 产出物</label>
              <input v-model="formDeliverable" type="text" placeholder="例如：发布包、操作手册、验收报告" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">计划交付日期</label>
              <input v-model="formPlannedAt" type="date" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">实际交付日期</label>
              <input v-model="formDeliveredAt" type="date" class="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">交付状态</label>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
              <button
                v-for="s in serveStatuses"
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
            <label class="text-xs font-medium text-muted-foreground">验收状态</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="s in acceptanceStatuses"
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

          <section class="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h4 class="text-sm font-medium">验收清单</h4>
                <p class="text-[11px] text-muted-foreground mt-0.5">逐项定义需求方认可交付的标准。</p>
              </div>
              <button type="button" class="h-8 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors" @click="addChecklistItem">添加清单</button>
            </div>
            <div v-if="formAcceptanceChecklist.length === 0" class="rounded-md border border-dashed border-border/50 p-3 text-xs text-muted-foreground text-center">暂无验收清单</div>
            <div v-for="item in formAcceptanceChecklist" :key="item.id" class="flex items-center gap-2">
              <input v-model="item.completed" type="checkbox" class="h-4 w-4 rounded border-input" />
              <input v-model="item.title" type="text" placeholder="例如：核心流程可完成闭环操作" class="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              <button type="button" class="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click="removeChecklistItem(item.id)">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </section>

          <section class="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h4 class="text-sm font-medium">交付证据</h4>
                <p class="text-[11px] text-muted-foreground mt-0.5">记录文本说明、链接或版本号，支撑交付验收。</p>
              </div>
              <button type="button" class="h-8 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors" @click="addEvidenceItem">添加证据</button>
            </div>
            <div v-if="formEvidence.length === 0" class="rounded-md border border-dashed border-border/50 p-3 text-xs text-muted-foreground text-center">暂无交付证据</div>
            <div v-for="item in formEvidence" :key="item.id" class="grid grid-cols-1 md:grid-cols-[120px_1fr_1.4fr_32px] gap-2 items-center">
              <select v-model="item.type" class="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option v-for="type in evidenceTypes" :key="type" :value="type">{{ getEvidenceTypeLabel(type) }}</option>
              </select>
              <input v-model="item.title" type="text" placeholder="证据标题" class="h-8 rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              <input v-model="item.content" type="text" placeholder="证据内容、URL 或版本号" class="h-8 rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              <button type="button" class="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click="removeEvidenceItem(item.id)">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </section>

          <section class="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h4 class="text-sm font-medium">返工项</h4>
                <p class="text-[11px] text-muted-foreground mt-0.5">记录验收未通过时需要补齐或修正的事项。</p>
              </div>
              <button type="button" class="h-8 rounded-md border px-3 text-xs font-medium hover:bg-muted transition-colors" @click="addReworkItem">添加返工项</button>
            </div>
            <div v-if="formReworkItems.length === 0" class="rounded-md border border-dashed border-border/50 p-3 text-xs text-muted-foreground text-center">暂无返工项</div>
            <div v-for="item in formReworkItems" :key="item.id" class="flex items-center gap-2">
              <input v-model="item.completed" type="checkbox" class="h-4 w-4 rounded border-input" />
              <input v-model="item.title" type="text" placeholder="例如：补充导出失败时的错误提示" class="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              <button type="button" class="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" @click="removeReworkItem(item.id)">
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </section>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3 border-border/40">
          <button class="h-9 inline-flex items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted transition-colors" @click="showDialog = false">取消</button>
          <button class="h-9 inline-flex items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/95 transition-all shadow-md" :disabled="!formTitle.trim()" @click="submitForm">保存交付计划</button>
        </div>
      </div>
    </div>
  </div>
</template>
