import { defineStore } from "pinia";
import { ref, watch, computed } from "vue";
import { uuid } from "@/lib/utils";
import { parseCharterToTarget, syncTargetsToLocal, syncActionsToLocal, syncServesToLocal, syncKeepsToLocal, initializeProjectFolders } from "@/lib/taskFileSync";
import { normalizeAction, normalizeKeep, normalizeServe, normalizeTarget, type AcceptanceStatus, type ChecklistItem, type EvidenceItem, type KeepType, type ServeStatus, type TaskProjectSnapshot } from "@/lib/taskPlanning";

type ChecklistItemInput = { id?: string; title: string; completed: boolean };
type EvidenceItemInput = Omit<EvidenceItem, "id" | "createdAt"> & { id?: string; createdAt?: string };

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  localPath?: string;
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
  status: "todo" | "in_progress" | "done" | "discarded";
  priority: "P0" | "P1" | "P2" | "P3";
  dueDate?: string;
  createdAt: string;
  serveId?: string;
  blocked?: boolean;
  blockerReason?: string;
  evidence?: string;
  supersededById?: string;
  discardedReason?: string;
  devItems?: ChecklistItem[];
  testItems?: ChecklistItem[];
  outputItems?: ChecklistItem[];
  targetId?: string;
  milestoneId?: string;
}

export interface Serve {
  id: string;
  projectId: string;
  title: string;
  description: string;
  deliverable: string;
  client: string;
  status: ServeStatus;
  plannedAt?: string;
  deliveredAt?: string;
  acceptanceStatus: AcceptanceStatus;
  acceptanceChecklist?: ChecklistItem[];
  evidence?: EvidenceItem[];
  reworkItems?: ChecklistItem[];
  createdAt: string;
}

export interface Keep {
  id: string;
  projectId: string;
  name: string;
  type: KeepType;
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
  const serves = ref<Serve[]>([]);
  const keeps = ref<Keep[]>([]);

  const activeProject = computed(() => projects.value.find((p) => p.id === activeProjectId.value));

  async function triggerLocalSync() {
    const proj = activeProject.value;
    if (!proj || !proj.localPath) return;

    try {
      const projTargets = targets.value.filter((t) => t.projectId === proj.id);
      const projActions = actions.value.filter((a) => a.projectId === proj.id);
      const projServes = serves.value.filter((s) => s.projectId === proj.id);
      const projKeeps = keeps.value.filter((k) => k.projectId === proj.id);

      await syncTargetsToLocal(proj.localPath, projTargets);
      await syncActionsToLocal(proj.localPath, projActions);
      await syncServesToLocal(proj.localPath, projServes);
      await syncKeepsToLocal(proj.localPath, projKeeps);
    } catch (e) {
      console.error("[TASK] local sync failed", e);
    }
  }

  async function syncFromLocalFiles(project: Project) {
    if (!project.localPath) return;
    try {
      const fs = await import("@tauri-apps/plugin-fs").catch(() => null);
      if (!fs) return;

      const charterPath = `${project.localPath}/1_TARGET/charter.md`;
      if (await fs.exists(charterPath)) {
        const charterContent = await fs.readTextFile(charterPath);
        const parsedTargets = parseCharterToTarget(charterContent, project.id);
        if (parsedTargets.length > 0) {
          targets.value = [...targets.value.filter((t) => t.projectId !== project.id), ...parsedTargets];
          saveTargets();
        }
      }

      const kanbanPath = `${project.localPath}/2_ACTION/kanban.json`;
      if (await fs.exists(kanbanPath)) {
        const kanbanContent = await fs.readTextFile(kanbanPath);
        const parsedActions: Action[] = JSON.parse(kanbanContent);
        if (Array.isArray(parsedActions)) {
          actions.value = [...actions.value.filter((a) => a.projectId !== project.id), ...parsedActions.map((a) => ({ ...a, projectId: project.id }))];
          saveActions();
        }
      }

      // 3. Sync keeps (documents) from 4_KEEP/knowledge
      const keepFolder = `${project.localPath}/4_KEEP/knowledge`;
      if (await fs.exists(keepFolder)) {
        const entries = await fs.readDir(keepFolder);
        const parsedKeeps: Keep[] = [];
        for (const entry of entries) {
          if (entry.name.endsWith(".md")) {
            const keepName = entry.name.replace(/\.md$/, "").replace(/_/g, " ");
            try {
              const keepContent = await fs.readTextFile(`${keepFolder}/${entry.name}`);
              const cleanContent = keepContent.replace(/^#\s*.*?\n/, "").trim(); // Remove leading title
              parsedKeeps.push({
                id: uuid(),
                projectId: project.id,
                name: keepName,
                type: "document",
                content: cleanContent,
                createdAt: new Date().toISOString(),
              });
            } catch (err) {
              console.error(`[TASK] failed to read keep file ${entry.name}`, err);
            }
          }
        }
        if (parsedKeeps.length > 0) {
          keeps.value = [...keeps.value.filter((k) => k.projectId !== project.id), ...parsedKeeps];
          saveKeeps();
        }
      }
    } catch (e) {
      console.error("[TASK] syncFromLocalFiles failed", e);
    }
  }

  // Load state from localStorage
  function loadAll() {
    try {
      projects.value = JSON.parse(localStorage.getItem("task-projects") || "[]");
      activeProjectId.value = localStorage.getItem("task-active-project-id") || "";
      targets.value = JSON.parse(localStorage.getItem("task-targets") || "[]").map(normalizeTarget);
      actions.value = JSON.parse(localStorage.getItem("task-actions") || "[]").map(normalizeAction);
      serves.value = JSON.parse(localStorage.getItem("task-serves") || "[]").map(normalizeServe);
      keeps.value = JSON.parse(localStorage.getItem("task-keeps") || "[]").map(normalizeKeep);

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

      // Sync active project files
      projects.value.forEach((proj) => {
        if (proj.localPath) {
          void syncFromLocalFiles(proj);
        }
      });
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
    void triggerLocalSync();
  }

  function saveActions() {
    localStorage.setItem("task-actions", JSON.stringify(actions.value));
    void triggerLocalSync();
  }

  function saveServes() {
    localStorage.setItem("task-serves", JSON.stringify(serves.value));
    void triggerLocalSync();
  }

  function saveKeeps() {
    localStorage.setItem("task-keeps", JSON.stringify(keeps.value));
    void triggerLocalSync();
  }

  // Projects CRUD
  function addProject(name: string, description: string, localPath?: string) {
    const proj: Project = {
      id: uuid(),
      name,
      description,
      createdAt: new Date().toISOString(),
      localPath,
    };
    projects.value.push(proj);
    activeProjectId.value = proj.id;
    saveProjects();

    if (localPath) {
      void initializeProjectFolders(localPath);
    }

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
    serves.value.push(...normalizedSnapshot.serves);
    keeps.value.push(...normalizedSnapshot.keeps);
    activeProjectId.value = snapshot.project.id;

    saveProjects();
    saveTargets();
    saveActions();
    saveServes();
    saveKeeps();
  }

  // Targets CRUD
  function addTarget(title: string, description: string, milestones: ChecklistItemInput[] = [], scope = "", outOfScope = "", successCriteria: ChecklistItemInput[] = [], risks: ChecklistItemInput[] = []) {
    const existing = targets.value.find((t) => t.projectId === activeProjectId.value);
    if (existing) {
      console.warn("[TASK] Target already exists for this project");
      return existing;
    }
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

  function syncTargetStateToActions(oldTarget: Target, newTarget: Target) {
    newTarget.milestones.forEach((m) => {
      const oldM = oldTarget.milestones.find((o) => o.id === m.id);
      if (oldM && oldM.completed !== m.completed) {
        const targetStatus = m.completed ? "done" : "todo";

        let matchedAction = actions.value.find((a) => a.targetId === newTarget.id && a.milestoneId === m.id);

        if (!matchedAction) {
          const actionTitle = `[🎯${newTarget.title}] ${m.title}`;
          matchedAction = actions.value.find((a) => a.projectId === newTarget.projectId && a.title.trim() === actionTitle);
        }

        if (matchedAction) {
          if (matchedAction.status !== targetStatus) {
            matchedAction.status = targetStatus;
            saveActions();
          }
        }
      }
    });
  }

  function updateTarget(updated: Target) {
    const index = targets.value.findIndex((t) => t.id === updated.id);
    if (index !== -1) {
      const oldTarget = targets.value[index];
      targets.value[index] = { ...updated };
      saveTargets();

      let actionsChanged = false;
      if (oldTarget.title !== updated.title) {
        actions.value.forEach((a) => {
          if (a.targetId === updated.id) {
            const oldPrefix = `[🎯${oldTarget.title}]`;
            const newPrefix = `[🎯${updated.title}]`;
            if (a.title.startsWith(oldPrefix)) {
              a.title = a.title.replace(oldPrefix, newPrefix);
              actionsChanged = true;
            }
          }
        });
      }

      updated.milestones.forEach((m) => {
        const oldM = oldTarget.milestones.find((o) => o.id === m.id);
        if (oldM && oldM.title !== m.title) {
          actions.value.forEach((a) => {
            if (a.targetId === updated.id && a.milestoneId === m.id) {
              const oldMilestoneTitle = oldM.title;
              const newMilestoneTitle = m.title;
              if (a.title.includes(oldMilestoneTitle)) {
                a.title = a.title.replace(oldMilestoneTitle, newMilestoneTitle);
                actionsChanged = true;
              }
            }
          });
        }
      });

      if (actionsChanged) {
        saveActions();
      }

      syncTargetStateToActions(oldTarget, updated);
    }
  }

  function deleteTarget(id: string) {
    targets.value = targets.value.filter((t) => t.id !== id);
    saveTargets();
  }

  // Actions CRUD
  function addAction(
    title: string,
    description: string,
    priority: "P0" | "P1" | "P2" | "P3" = "P2",
    dueDate?: string,
    status: "todo" | "in_progress" | "done" | "discarded" = "todo",
    serveId?: string,
    blocked = false,
    blockerReason = "",
    evidence = "",
    supersededById?: string,
    discardedReason?: string,
    devItems: ChecklistItemInput[] = [],
    testItems: ChecklistItemInput[] = [],
    outputItems: ChecklistItemInput[] = [],
    targetId?: string,
    milestoneId?: string,
  ) {
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
      supersededById,
      discardedReason,
      devItems: devItems.map((item) => ({ id: item.id || uuid(), title: item.title, completed: item.completed })),
      testItems: testItems.map((item) => ({ id: item.id || uuid(), title: item.title, completed: item.completed })),
      outputItems: outputItems.map((item) => ({ id: item.id || uuid(), title: item.title, completed: item.completed })),
      targetId,
      milestoneId,
    });
    actions.value.push(action);
    saveActions();
    return action;
  }

  function syncActionStateToTAndS(action: Action) {
    const isCompleted = action.status === "done";
    const title = action.title.trim();

    // 1. Sync to Target milestone (Prefer ID binding, fallback to Title regex)
    if (action.targetId && action.milestoneId) {
      const matchedTarget = targets.value.find((t) => t.id === action.targetId);
      if (matchedTarget) {
        const milestone = matchedTarget.milestones.find((m) => m.id === action.milestoneId);
        if (milestone && milestone.completed !== isCompleted) {
          milestone.completed = isCompleted;
          const allDone = matchedTarget.milestones.every((m) => m.completed);
          matchedTarget.status = allDone ? "completed" : "pending";
          saveTargets();
        }
      }
    } else {
      const targetMatch = title.match(/^\[🎯(.*?)\]\s*(.*)$/);
      if (targetMatch) {
        const targetTitle = targetMatch[1].trim();
        const milestoneTitle = targetMatch[2].trim();

        const matchedTarget = targets.value.find((t) => t.projectId === action.projectId && t.title.trim() === targetTitle);
        if (matchedTarget) {
          const milestone = matchedTarget.milestones.find((m) => m.title.trim() === milestoneTitle);
          if (milestone && milestone.completed !== isCompleted) {
            milestone.completed = isCompleted;
            const allDone = matchedTarget.milestones.every((m) => m.completed);
            matchedTarget.status = allDone ? "completed" : "pending";
            saveTargets();
          }
        }
      }
    }

    // 2. Sync to Serve checklist item
    const serveMatch = title.match(/^\[📦交付:(.*?)\]\s*(.*)$/);
    if (serveMatch) {
      const serveTitle = serveMatch[1].trim();
      const itemTitle = serveMatch[2].trim();

      const matchedServe = serves.value.find((s) => s.projectId === action.projectId && s.title.trim() === serveTitle);
      if (matchedServe) {
        const checklistItem = matchedServe.acceptanceChecklist?.find((c) => c.title.trim() === itemTitle);
        if (checklistItem && checklistItem.completed !== isCompleted) {
          checklistItem.completed = isCompleted;
          const allDone = matchedServe.acceptanceChecklist?.every((c) => c.completed) ?? false;
          if (allDone && matchedServe.status !== "delivered") {
            matchedServe.status = "delivered";
            matchedServe.acceptanceStatus = "accepted";
          } else if (!allDone) {
            matchedServe.status = "active";
            matchedServe.acceptanceStatus = "pending";
          }
          saveServes();
        }
      }
    }
  }

  function updateAction(updated: Action) {
    const index = actions.value.findIndex((a) => a.id === updated.id);
    if (index !== -1) {
      const oldAction = actions.value[index];
      actions.value[index] = { ...updated };
      saveActions();
      if (oldAction.status !== updated.status) {
        syncActionStateToTAndS(updated);
      }
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
    serves.value.push(serve);
    saveServes();
    return serve;
  }

  function syncServeStateToActions(oldServe: Serve, newServe: Serve) {
    if (!newServe.acceptanceChecklist) return;
    newServe.acceptanceChecklist.forEach((item) => {
      const oldItem = oldServe.acceptanceChecklist?.find((o) => o.id === item.id);
      if (oldItem && oldItem.completed !== item.completed) {
        const actionTitle = `[📦交付:${newServe.title}] ${item.title}`;
        const matchedAction = actions.value.find((a) => a.projectId === newServe.projectId && a.title.trim() === actionTitle);
        if (matchedAction) {
          const targetStatus = item.completed ? "done" : "todo";
          if (matchedAction.status !== targetStatus) {
            matchedAction.status = targetStatus;
            saveActions();
          }
        }
      }
    });
  }

  function updateServe(updated: Serve) {
    const index = serves.value.findIndex((s) => s.id === updated.id);
    if (index !== -1) {
      const oldServe = serves.value[index];
      serves.value[index] = { ...updated };
      saveServes();
      syncServeStateToActions(oldServe, updated);
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
    keeps.value.push(keep);
    saveKeeps();
    return keep;
  }

  function updateKeep(updated: Keep) {
    const index = keeps.value.findIndex((k) => k.id === updated.id);
    if (index !== -1) {
      keeps.value[index] = { ...updated };
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
