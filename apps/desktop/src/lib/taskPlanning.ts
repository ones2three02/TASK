import { uuid } from "@/lib/utils";

export type TaskActionStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type ServeStatus = "draft" | "delivered" | "active";
export type AcceptanceStatus = "pending" | "accepted" | "changes_requested";
export type KeepType = "document" | "link" | "archive";

export interface TaskProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface TaskTarget {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: "pending" | "completed";
  createdAt: string;
  milestones: { id: string; title: string; completed: boolean }[];
}

export interface TaskAction {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskActionStatus;
  priority: TaskPriority;
  dueDate?: string;
  createdAt: string;
}

export interface TaskServe {
  id: string;
  projectId: string;
  title: string;
  description: string;
  deliverable: string;
  client: string;
  status: ServeStatus;
  deliveredAt?: string;
  acceptanceStatus: AcceptanceStatus;
  createdAt: string;
}

export interface TaskKeep {
  id: string;
  projectId: string;
  name: string;
  type: KeepType;
  content: string;
  createdAt: string;
}

export interface TaskProjectSnapshot {
  version: 1;
  exportedAt: string;
  project: TaskProject;
  targets: TaskTarget[];
  actions: TaskAction[];
  serves: TaskServe[];
  keeps: TaskKeep[];
}

export function calculateTargetProgress(targets: TaskTarget[]) {
  let totalMilestones = 0;
  let completedMilestones = 0;

  for (const target of targets) {
    if (target.milestones.length === 0) {
      totalMilestones += 1;
      if (target.status === "completed") completedMilestones += 1;
      continue;
    }
    totalMilestones += target.milestones.length;
    completedMilestones += target.milestones.filter((milestone) => milestone.completed).length;
  }

  return {
    total: targets.length,
    completed: targets.filter((target) => target.status === "completed").length,
    totalMilestones,
    completedMilestones,
    percent: totalMilestones === 0 ? 0 : Math.round((completedMilestones / totalMilestones) * 100),
  };
}

export function calculateActionStats(actions: TaskAction[], today = new Date().toISOString().slice(0, 10)) {
  const unfinishedActions = actions.filter((action) => action.status !== "done");
  const overdueActions = unfinishedActions.filter((action) => !!action.dueDate && action.dueDate < today);

  return {
    total: actions.length,
    todo: actions.filter((action) => action.status === "todo").length,
    inProgress: actions.filter((action) => action.status === "in_progress").length,
    done: actions.filter((action) => action.status === "done").length,
    overdue: overdueActions.length,
    highPriority: actions.filter((action) => action.priority === "high").length,
    mediumPriority: actions.filter((action) => action.priority === "medium").length,
    lowPriority: actions.filter((action) => action.priority === "low").length,
    percent: actions.length === 0 ? 0 : Math.round((actions.filter((action) => action.status === "done").length / actions.length) * 100),
  };
}

export function calculateServeStats(serves: TaskServe[]) {
  const delivered = serves.filter((serve) => serve.status === "delivered" || serve.status === "active").length;
  const accepted = serves.filter((serve) => serve.acceptanceStatus === "accepted").length;

  return {
    total: serves.length,
    delivered,
    accepted,
    pendingAcceptance: serves.filter((serve) => serve.acceptanceStatus === "pending").length,
    changesRequested: serves.filter((serve) => serve.acceptanceStatus === "changes_requested").length,
    percent: serves.length === 0 ? 0 : Math.round((delivered / serves.length) * 100),
  };
}

export function calculateKeepStats(keeps: TaskKeep[]) {
  return {
    total: keeps.length,
    documents: keeps.filter((keep) => keep.type === "document").length,
    links: keeps.filter((keep) => keep.type === "link").length,
    archives: keeps.filter((keep) => keep.type === "archive").length,
    percent: keeps.length > 0 ? 100 : 0,
  };
}

export function calculateProjectOverview(project: TaskProject, targets: TaskTarget[], actions: TaskAction[], serves: TaskServe[], keeps: TaskKeep[], today?: string) {
  const targetProgress = calculateTargetProgress(targets);
  const actionStats = calculateActionStats(actions, today);
  const serveStats = calculateServeStats(serves);
  const keepStats = calculateKeepStats(keeps);
  const overallPercent = Math.round(targetProgress.percent * 0.3 + actionStats.percent * 0.35 + serveStats.percent * 0.2 + keepStats.percent * 0.15);

  const overview = {
    project,
    targetProgress,
    actionStats,
    serveStats,
    keepStats,
    overallPercent,
    recommendation: {
      stage: "target" as "dashboard" | "target" | "action" | "serve" | "keep",
      message: "",
    },
  };

  overview.recommendation = getNextProjectRecommendation(overview);
  return overview;
}

export function getNextProjectRecommendation(overview: { targetProgress: ReturnType<typeof calculateTargetProgress>; actionStats: ReturnType<typeof calculateActionStats>; serveStats: ReturnType<typeof calculateServeStats>; keepStats: ReturnType<typeof calculateKeepStats> }) {
  if (overview.targetProgress.total === 0) {
    return { stage: "target" as const, message: "先建立项目 Target，明确目标和里程碑。" };
  }
  if (overview.actionStats.total === 0) {
    return { stage: "action" as const, message: "已有目标，下一步建议拆解 Action 行动卡片。" };
  }
  if (overview.actionStats.total > 0 && overview.actionStats.done === overview.actionStats.total && overview.serveStats.total === 0) {
    return { stage: "serve" as const, message: "行动已完成，建议记录 Serve 交付对象、交付物和价值。" };
  }
  if (overview.serveStats.total > 0 && overview.keepStats.total === 0) {
    return { stage: "keep" as const, message: "已有交付记录，建议进入 Keep 沉淀复盘和项目资产。" };
  }
  if (overview.actionStats.overdue > 0) {
    return { stage: "action" as const, message: `当前有 ${overview.actionStats.overdue} 项行动已逾期，建议优先处理。` };
  }
  return { stage: "keep" as const, message: "项目闭环已基本完整，建议导出备份或补充复盘文档。" };
}

export function buildProjectRetrospective(project: TaskProject, targets: TaskTarget[], actions: TaskAction[], serves: TaskServe[], keeps: TaskKeep[]) {
  const targetProgress = calculateTargetProgress(targets);
  const actionStats = calculateActionStats(actions);
  const serveStats = calculateServeStats(serves);
  const keepStats = calculateKeepStats(keeps);

  return [
    `# 项目复盘 - ${project.name}`,
    "",
    "## 项目背景",
    project.description || "未填写项目背景。",
    "",
    "## Target 目标达成",
    `目标数量：${targetProgress.total}，里程碑完成：${targetProgress.completedMilestones}/${targetProgress.totalMilestones}，目标进度：${targetProgress.percent}%。`,
    ...targets.map((target) => `- ${target.title}：${target.status === "completed" ? "已达成" : "推进中"}`),
    "",
    "## Action 行动结果",
    `行动数量：${actionStats.total}，已完成：${actionStats.done}，进行中：${actionStats.inProgress}，待处理：${actionStats.todo}，逾期：${actionStats.overdue}。`,
    ...actions.map((action) => `- ${action.title}：${action.status} / ${action.priority}`),
    "",
    "## Serve 交付价值",
    `交付记录：${serveStats.total}，已交付：${serveStats.delivered}，已验收：${serveStats.accepted}。`,
    ...serves.map((serve) => `- ${serve.title}：服务对象 ${serve.client || "未填写"}，交付物 ${serve.deliverable || "未填写"}`),
    "",
    "## Keep 资产沉淀",
    `存档数量：${keepStats.total}，文档：${keepStats.documents}，链接：${keepStats.links}，归档包：${keepStats.archives}。`,
    ...keeps.map((keep) => `- ${keep.name}：${keep.type}`),
    "",
    "## 经验教训",
    "- 哪些目标定义足够清楚？",
    "- 哪些行动拆解可以更细？",
    "- 哪些交付验收标准需要提前定义？",
    "",
    "## 下一步建议",
    "- 补充缺失的交付验收记录。",
    "- 将关键文档、链接和版本资产继续沉淀到 Keep。",
  ].join("\n");
}

export function exportProjectSnapshot(project: TaskProject, targets: TaskTarget[], actions: TaskAction[], serves: TaskServe[], keeps: TaskKeep[]): TaskProjectSnapshot {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
    targets,
    actions,
    serves,
    keeps,
  };
}

export function normalizeImportedProjectSnapshot(snapshot: unknown, idFactory: () => string = uuid): TaskProjectSnapshot {
  if (!isSnapshotLike(snapshot)) {
    throw new Error("导入文件不是合法的 TASK 项目快照。");
  }

  const projectId = idFactory();
  const targetIdByOldId = new Map<string, string>();

  const normalizedProject: TaskProject = {
    ...snapshot.project,
    id: projectId,
    name: `${snapshot.project.name}（导入）`,
    createdAt: new Date().toISOString(),
  };

  const normalizedTargets = snapshot.targets.map((target) => {
    const targetId = idFactory();
    targetIdByOldId.set(target.id, targetId);
    return {
      ...target,
      id: targetId,
      projectId,
      milestones: target.milestones.map((milestone) => ({ ...milestone, id: idFactory() })),
    };
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    project: normalizedProject,
    targets: normalizedTargets,
    actions: snapshot.actions.map((action) => ({ ...action, id: idFactory(), projectId })),
    serves: snapshot.serves.map((serve) => ({
      ...serve,
      id: idFactory(),
      projectId,
      acceptanceStatus: serve.acceptanceStatus ?? "pending",
    })),
    keeps: snapshot.keeps.map((keep) => ({ ...keep, id: idFactory(), projectId })),
  };
}

function isSnapshotLike(value: unknown): value is TaskProjectSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<TaskProjectSnapshot>;
  return !!snapshot.project && Array.isArray(snapshot.targets) && Array.isArray(snapshot.actions) && Array.isArray(snapshot.serves) && Array.isArray(snapshot.keeps);
}
