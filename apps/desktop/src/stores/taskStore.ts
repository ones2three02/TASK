import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { uuid } from "@/lib/utils";

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
  milestones: { id: string; title: string; completed: boolean }[];
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
}

export interface Serve {
  id: string;
  projectId: string;
  title: string;
  description: string;
  deliverable: string;
  client: string;
  status: "draft" | "delivered" | "active";
  createdAt: string;
}

export interface Keep {
  id: string;
  projectId: string;
  name: string;
  type: "document" | "link" | "archive";
  content: string;
  createdAt: string;
}

export const useTaskStore = defineStore("task", () => {
  const projects = ref<Project[]>([]);
  const activeProjectId = ref<string>("");
  const targets = ref<Target[]>([]);
  const actions = ref<Action[]>([]);
  const serves = ref<Serve[]>([]);
  const keeps = ref<Keep[]>([]);

  // Load state from localStorage
  function loadAll() {
    try {
      projects.value = JSON.parse(localStorage.getItem("task-projects") || "[]");
      activeProjectId.value = localStorage.getItem("task-active-project-id") || "";
      targets.value = JSON.parse(localStorage.getItem("task-targets") || "[]");
      actions.value = JSON.parse(localStorage.getItem("task-actions") || "[]");
      serves.value = JSON.parse(localStorage.getItem("task-serves") || "[]");
      keeps.value = JSON.parse(localStorage.getItem("task-keeps") || "[]");

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

  // Targets CRUD
  function addTarget(title: string, description: string, milestones: { title: string; completed: boolean }[] = []) {
    const target: Target = {
      id: uuid(),
      projectId: activeProjectId.value,
      title,
      description,
      status: "pending",
      createdAt: new Date().toISOString(),
      milestones: milestones.map((m) => ({ id: uuid(), title: m.title, completed: m.completed })),
    };
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
  function addAction(title: string, description: string, priority: "low" | "medium" | "high" = "medium", dueDate?: string) {
    const action: Action = {
      id: uuid(),
      projectId: activeProjectId.value,
      title,
      description,
      status: "todo",
      priority,
      dueDate,
      createdAt: new Date().toISOString(),
    };
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
  function addServe(title: string, description: string, deliverable: string, client: string, status: "draft" | "delivered" | "active" = "draft") {
    const serve: Serve = {
      id: uuid(),
      projectId: activeProjectId.value,
      title,
      description,
      deliverable,
      client,
      status,
      createdAt: new Date().toISOString(),
    };
    serves.value.push(serve);
    saveServes();
    return serve;
  }

  function updateServe(updated: Serve) {
    const index = serves.value.findIndex((s) => s.id === updated.id);
    if (index !== -1) {
      serves.value[index] = { ...updated };
      saveServes();
    }
  }

  function deleteServe(id: string) {
    serves.value = serves.value.filter((s) => s.id !== id);
    saveServes();
  }

  // Keeps CRUD
  function addKeep(name: string, type: "document" | "link" | "archive", content: string) {
    const keep: Keep = {
      id: uuid(),
      projectId: activeProjectId.value,
      name,
      type,
      content,
      createdAt: new Date().toISOString(),
    };
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
