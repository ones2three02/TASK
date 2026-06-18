import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { uuid } from "@/lib/utils";
import { normalizeAction, normalizeKeep, normalizeServe, normalizeTarget, type AcceptanceStatus, type ChecklistItem, type EvidenceItem, type KeepType, type ServeStatus, type TaskProjectSnapshot } from "@/lib/taskPlanning";

type ChecklistItemInput = { id?: string; title: string; completed: boolean };
type EvidenceItemInput = Omit<EvidenceItem, "id" | "createdAt"> & { id?: string; createdAt?: string };
type LegacyServeStatus = Extract<ServeStatus, "draft" | "active" | "delivered">;
type LegacyKeepType = Extract<KeepType, "document" | "link" | "archive">;
type LifecycleServe = Serve<ServeStatus>;
type LifecycleKeep = Keep<KeepType>;
type UiCompatibleServe = Serve<LegacyServeStatus>;
type UiCompatibleKeep = Keep<LegacyKeepType>;

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface Target {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: "pending" | "completed";
  createdAt: string;
  milestones: ChecklistItem[];
  scope?: string;
  outOfScope?: string;
  successCriteria?: ChecklistItem[];
  risks?: ChecklistItem[];
}

export interface Action {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate?: string;
  createdAt: string;
  serveId?: string;
  blocked?: boolean;
  blockerReason?: string;
  evidence?: string;
}

export interface Serve<TStatus extends ServeStatus = LegacyServeStatus> {
  id: string;
  projectId: string;
  title: string;
  description: string;
  deliverable: string;
  client: string;
  status: TStatus;
  plannedAt?: string;
  deliveredAt?: string;
  acceptanceStatus: AcceptanceStatus;
  acceptanceChecklist?: ChecklistItem[];
  evidence?: EvidenceItem[];
  reworkItems?: ChecklistItem[];
  createdAt: string;
}

export interface Keep<TType extends KeepType = LegacyKeepType> {
  id: string;
  projectId: string;
  name: string;
  type: TType;
  content: string;
  createdAt: string;
  relatedServeId?: string;
  relatedActionId?: string;
}

export const useTaskStore = defineStore("task", () => {
  const projects = ref<Project[]>([]);
  const activeProjectId = ref<string>("");
  const targets = ref<Target[]>([]);
  const actions = ref<Action[]>([]);
  const serves = ref<UiCompatibleServe[]>([]);
  const keeps = ref<UiCompatibleKeep[]>([]);

  // Load state from localStorage
  function loadAll() {
    try {
      projects.value = JSON.parse(localStorage.getItem("task-projects") || "[]");
      activeProjectId.value = localStorage.getItem("task-active-project-id") || "";
      targets.value = JSON.parse(localStorage.getItem("task-targets") || "[]").map(normalizeTarget);
      actions.value = JSON.parse(localStorage.getItem("task-actions") || "[]").map(normalizeAction);
      serves.value = JSON.parse(localStorage.getItem("task-serves") || "[]").map(normalizeServe) as UiCompatibleServe[];
      keeps.value = JSON.parse(localStorage.getItem("task-keeps") || "[]").map(normalizeKeep) as UiCompatibleKeep[];

      // Initialize a default project if none exists
      if (projects.value.length === 0) {
        const defaultProj: Project = {
          id: uuid(),
          name: "默认项目",
          description: "这是一个为您自动创建的默认 TASK 项目。在这里您可以管理项目的目标 (T)、行动 (A)、服务 (S) 和留存 (K)。",
          createdAt: new Date().toISOString(),
        };
        projects.value.push(defaultProj);
        activeProjectId.value = defaultProj.id;
        saveProjects();
      }

      if (!activeProjectId.value && projects.value.length > 0) {
        activeProjectId.value = projects.value[0].id;
        localStorage.setItem("task-active-project-id", activeProjectId.value);
      }
    } catch (e) {
      console.error("Failed to load tasks", e);
    }
  }

  function saveProjects() {
    localStorage.setItem("task-projects", JSON.stringify(projects.value));
    localStorage.setItem("task-active-project-id", activeProjectId.value);
  }

  function saveTargets() {
    localStorage.setItem("task-targets", JSON.stringify(targets.value));
  }

  function saveActions() {
    localStorage.setItem("task-actions", JSON.stringify(actions.value));
  }

  function saveServes() {
    localStorage.setItem("task-serves", JSON.stringify(serves.value));
  }

  function saveKeeps() {
    localStorage.setItem("task-keeps", JSON.stringify(keeps.value));
  }

  // Projects CRUD
  function addProject(name: string, description: string) {
    const proj: Project = {
      id: uuid(),
      name,
      description,
      createdAt: new Date().toISOString(),
    };
    projects.value.push(proj);
    activeProjectId.value = proj.id;
    saveProjects();
    return proj;
  }

  function deleteProject(id: string) {
    projects.value = projects.value.filter((p) => p.id !== id);
    targets.value = targets.value.filter((t) => t.projectId !== id);
    actions.value = actions.value.filter((a) => a.projectId !== id);
    serves.value = serves.value.filter((s) => s.projectId !== id);
    keeps.value = keeps.value.filter((k) => k.projectId !== id);

    saveProjects();
    saveTargets();
    saveActions();
    saveServes();
    saveKeeps();

    if (activeProjectId.value === id) {
      activeProjectId.value = projects.value[0]?.id || "";
      localStorage.setItem("task-active-project-id", activeProjectId.value);
    }
  }

  function addProjectSnapshot(snapshot: TaskProjectSnapshot) {
    const normalizedSnapshot = {
      ...snapshot,
      targets: snapshot.targets.map(normalizeTarget),
      actions: snapshot.actions.map(normalizeAction),
      serves: snapshot.serves.map(normalizeServe),
      keeps: snapshot.keeps.map(normalizeKeep),
    };

    projects.value.push(normalizedSnapshot.project);
    targets.value.push(...normalizedSnapshot.targets);
    actions.value.push(...normalizedSnapshot.actions);
    serves.value.push(...(normalizedSnapshot.serves as UiCompatibleServe[]));
    keeps.value.push(...(normalizedSnapshot.keeps as UiCompatibleKeep[]));
    activeProjectId.value = snapshot.project.id;

    saveProjects();
    saveTargets();
    saveActions();
    saveServes();
    saveKeeps();
  }

  // Targets CRUD
  function addTarget(title: string, description: string, milestones: ChecklistItemInput[] = [], scope = "", outOfScope = "", successCriteria: ChecklistItemInput[] = [], risks: ChecklistItemInput[] = []) {
    const target = normalizeTarget({
      id: uuid(),
      projectId: activeProjectId.value,
      title,
      description,
      status: "pending",
      createdAt: new Date().toISOString(),
      milestones: milestones.map((m) => ({ id: m.id || uuid(), title: m.title, completed: m.completed })),
      scope,
      outOfScope,
      successCriteria: successCriteria.map((item) => ({ id: item.id || uuid(), title: item.title, completed: item.completed })),
      risks: risks.map((item) => ({ id: item.id || uuid(), title: item.title, completed: item.completed })),
    });
    targets.value.push(target);
    saveTargets();
    return target;
  }

  function updateTarget(updated: Target) {
    const index = targets.value.findIndex((t) => t.id === updated.id);
    if (index !== -1) {
      targets.value[index] = { ...updated };
      saveTargets();
    }
  }

  function deleteTarget(id: string) {
    targets.value = targets.value.filter((t) => t.id !== id);
    saveTargets();
  }

  // Actions CRUD
  function addAction(title: string, description: string, priority: "low" | "medium" | "high" = "medium", dueDate?: string, status: "todo" | "in_progress" | "done" = "todo", serveId?: string, blocked = false, blockerReason = "", evidence = "") {
    const action = normalizeAction({
      id: uuid(),
      projectId: activeProjectId.value,
      title,
      description,
      status,
      priority,
      dueDate,
      createdAt: new Date().toISOString(),
      serveId,
      blocked,
      blockerReason,
      evidence,
    });
    actions.value.push(action);
    saveActions();
    return action;
  }

  function updateAction(updated: Action) {
    const index = actions.value.findIndex((a) => a.id === updated.id);
    if (index !== -1) {
      actions.value[index] = { ...updated };
      saveActions();
    }
  }

  function deleteAction(id: string) {
    actions.value = actions.value.filter((a) => a.id !== id);
    saveActions();
  }

  // Serves CRUD
  function addServe(
    title: string,
    description: string,
    deliverable: string,
    client: string,
    status: ServeStatus = "draft",
    deliveredAt?: string,
    acceptanceStatus: AcceptanceStatus = "pending",
    plannedAt = "",
    acceptanceChecklist: ChecklistItemInput[] = [],
    evidence: EvidenceItemInput[] = [],
    reworkItems: ChecklistItemInput[] = [],
  ) {
    const serve = normalizeServe({
      id: uuid(),
      projectId: activeProjectId.value,
      title,
      description,
      deliverable,
      client,
      status,
      plannedAt,
      deliveredAt,
      acceptanceStatus,
      acceptanceChecklist: acceptanceChecklist.map((item) => ({ id: item.id || uuid(), title: item.title, completed: item.completed })),
      evidence: evidence.map((item) => ({
        id: item.id || uuid(),
        title: item.title,
        content: item.content,
        type: item.type,
        createdAt: item.createdAt || new Date().toISOString(),
      })),
      reworkItems: reworkItems.map((item) => ({ id: item.id || uuid(), title: item.title, completed: item.completed })),
      createdAt: new Date().toISOString(),
    });
    serves.value.push(serve as UiCompatibleServe);
    saveServes();
    return serve;
  }

  function updateServe(updated: LifecycleServe) {
    const index = serves.value.findIndex((s) => s.id === updated.id);
    if (index !== -1) {
      serves.value[index] = { ...updated } as UiCompatibleServe;
      saveServes();
    }
  }

  function deleteServe(id: string) {
    serves.value = serves.value.filter((s) => s.id !== id);
    saveServes();
  }

  // Keeps CRUD
  function addKeep(name: string, type: KeepType, content: string, relatedServeId?: string, relatedActionId?: string) {
    const keep = normalizeKeep({
      id: uuid(),
      projectId: activeProjectId.value,
      name,
      type,
      content,
      createdAt: new Date().toISOString(),
      relatedServeId,
      relatedActionId,
    });
    keeps.value.push(keep as UiCompatibleKeep);
    saveKeeps();
    return keep;
  }

  function updateKeep(updated: LifecycleKeep) {
    const index = keeps.value.findIndex((k) => k.id === updated.id);
    if (index !== -1) {
      keeps.value[index] = { ...updated } as UiCompatibleKeep;
      saveKeeps();
    }
  }

  function deleteKeep(id: string) {
    keeps.value = keeps.value.filter((k) => k.id !== id);
    saveKeeps();
  }

  // Sync active project selection changes
  watch(activeProjectId, (newVal) => {
    localStorage.setItem("task-active-project-id", newVal);
  });

  return {
    projects,
    activeProjectId,
    targets,
    actions,
    serves,
    keeps,
    loadAll,
    addProject,
    addProjectSnapshot,
    deleteProject,
    addTarget,
    updateTarget,
    deleteTarget,
    addAction,
    updateAction,
    deleteAction,
    addServe,
    updateServe,
    deleteServe,
    addKeep,
    updateKeep,
    deleteKeep,
  };
});
