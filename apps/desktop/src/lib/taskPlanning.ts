import { uuid } from "@/lib/utils";

export type TaskActionStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type ServeStatus = "draft" | "active" | "delivered" | "accepted" | "changes_requested";
export type AcceptanceStatus = "pending" | "accepted" | "changes_requested";
export type KeepType = "document" | "link" | "archive" | "evidence" | "version" | "retrospective";
export type TaskQualityGateSeverity = "info" | "warning" | "danger";
export type TaskQualityGateStage = "target" | "action" | "serve" | "keep";
export type EvidenceType = "text" | "link" | "version";

export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface EvidenceItem {
  id: string;
  title: string;
  content: string;
  type: EvidenceType;
  createdAt: string;
}

export interface TaskQualityGate {
  id: string;
  stage: TaskQualityGateStage;
  severity: TaskQualityGateSeverity;
  title: string;
  message: string;
  count: number;
  relatedIds: string[];
}

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
  scope?: string;
  outOfScope?: string;
  successCriteria?: ChecklistItem[];
  risks?: ChecklistItem[];
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
  serveId?: string;
  blocked?: boolean;
  blockerReason?: string;
  evidence?: string;
}

export interface TaskServe {
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

export interface TaskKeep {
  id: string;
  projectId: string;
  name: string;
  type: KeepType;
  content: string;
  createdAt: string;
  relatedServeId?: string;
  relatedActionId?: string;
}

type LegacyStoreServe = Omit<TaskServe, "status"> & { status: "draft" | "active" | "delivered" };
type LegacyStoreKeep = Omit<TaskKeep, "type"> & { type: "document" | "link" | "archive" };
type TaskSnapshotServes = TaskServe[] & Iterable<LegacyStoreServe>;
type TaskSnapshotKeeps = TaskKeep[] & Iterable<LegacyStoreKeep>;

export interface TaskProjectSnapshot {
  version: 1 | 2;
  exportedAt: string;
  project: TaskProject;
  targets: TaskTarget[];
  actions: TaskAction[];
  serves: TaskSnapshotServes;
  keeps: TaskSnapshotKeeps;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function normalizeEvidenceType(value: unknown, fallback: EvidenceType = "text"): EvidenceType {
  return value === "text" || value === "link" || value === "version" ? value : fallback;
}

function normalizeChecklistItems(value: unknown, idFactory?: () => string): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") {
      return { id: idFactory?.() ?? uuid(), title: item, completed: false };
    }

    const checklistItem = item && typeof item === "object" ? (item as Partial<ChecklistItem>) : {};
    return {
      id: idFactory?.() ?? normalizeOptionalString(checklistItem.id) ?? uuid(),
      title: normalizeOptionalString(checklistItem.title) ?? "未命名检查项",
      completed: checklistItem.completed === true,
    };
  });
}

function normalizeEvidenceItems(value: unknown, idFactory?: () => string): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const createdAt = new Date().toISOString();
    if (typeof item === "string") {
      return { id: idFactory?.() ?? uuid(), title: item, content: item, type: "text", createdAt };
    }

    const evidenceItem = item && typeof item === "object" ? (item as Partial<EvidenceItem> & { url?: unknown }) : {};
    const legacyUrl = normalizeOptionalString(evidenceItem.url);
    const content = normalizeOptionalString(evidenceItem.content) ?? legacyUrl ?? "";
    return {
      id: idFactory?.() ?? normalizeOptionalString(evidenceItem.id) ?? uuid(),
      title: normalizeOptionalString(evidenceItem.title) ?? (content || "未命名证据"),
      content,
      type: normalizeEvidenceType(evidenceItem.type, legacyUrl ? "link" : "text"),
      createdAt: normalizeOptionalString(evidenceItem.createdAt) ?? createdAt,
    };
  });
}

function normalizeActionEvidence(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return normalizeEvidenceItems(value)
    .map((item) => item.content || item.title)
    .filter((item) => item.trim().length > 0)
    .join("\n");
}

function normalizeMilestones(value: unknown, idFactory?: () => string) {
  if (!Array.isArray(value)) return [];
  return value.map((milestone) => {
    const normalizedMilestone = milestone && typeof milestone === "object" ? (milestone as { id?: unknown; title?: unknown; completed?: unknown }) : {};
    return {
      id: idFactory?.() ?? normalizeOptionalString(normalizedMilestone.id) ?? uuid(),
      title: normalizeOptionalString(normalizedMilestone.title) ?? "未命名里程碑",
      completed: normalizedMilestone.completed === true,
    };
  });
}

export function normalizeTarget(target: TaskTarget): TaskTarget {
  return {
    ...target,
    milestones: normalizeMilestones(target.milestones),
    scope: normalizeOptionalString(target.scope),
    outOfScope: normalizeOptionalString(target.outOfScope),
    successCriteria: normalizeChecklistItems(target.successCriteria),
    risks: normalizeChecklistItems(target.risks),
  };
}

export function normalizeAction(action: TaskAction): TaskAction {
  return {
    ...action,
    serveId: normalizeOptionalString(action.serveId),
    blocked: action.blocked === true,
    blockerReason: normalizeOptionalString(action.blockerReason),
    evidence: normalizeActionEvidence(action.evidence),
  };
}

export function normalizeServe(serve: TaskServe): TaskServe {
  return {
    ...serve,
    plannedAt: normalizeOptionalString(serve.plannedAt),
    deliveredAt: normalizeOptionalString(serve.deliveredAt),
    acceptanceStatus: serve.acceptanceStatus ?? "pending",
    acceptanceChecklist: normalizeChecklistItems(serve.acceptanceChecklist),
    evidence: normalizeEvidenceItems(serve.evidence),
    reworkItems: normalizeChecklistItems(serve.reworkItems),
  };
}

export function normalizeKeep(keep: TaskKeep): TaskKeep {
  return {
    ...keep,
    relatedServeId: normalizeOptionalString(keep.relatedServeId),
    relatedActionId: normalizeOptionalString(keep.relatedActionId),
  };
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
  const deliveredStatuses: ServeStatus[] = ["active", "delivered", "accepted", "changes_requested"];
  const delivered = serves.filter((serve) => deliveredStatuses.includes(serve.status) || serve.acceptanceStatus === "accepted").length;
  const accepted = serves.filter((serve) => serve.status === "accepted" || serve.acceptanceStatus === "accepted").length;

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
    evidence: keeps.filter((keep) => keep.type === "evidence").length,
    versions: keeps.filter((keep) => keep.type === "version").length,
    retrospectives: keeps.filter((keep) => keep.type === "retrospective").length,
    percent: keeps.length > 0 ? 100 : 0,
  };
}

function createQualityGate(id: string, stage: TaskQualityGateStage, severity: TaskQualityGateSeverity, title: string, message: string, relatedIds: string[]): TaskQualityGate {
  return {
    id,
    stage,
    severity,
    title,
    message,
    count: relatedIds.length,
    relatedIds,
  };
}

export function calculateQualityGates(targets: TaskTarget[], actions: TaskAction[], serves: TaskServe[], keeps: TaskKeep[]): TaskQualityGate[] {
  const normalizedTargets = targets.map(normalizeTarget);
  const normalizedActions = actions.map(normalizeAction);
  const normalizedServes = serves.map(normalizeServe);
  const normalizedKeeps = keeps.map(normalizeKeep);
  const gates: TaskQualityGate[] = [];

  const targetsMissingSuccessCriteria = normalizedTargets.filter((target) => (target.successCriteria?.length ?? 0) === 0);
  if (targetsMissingSuccessCriteria.length > 0) {
    gates.push(
      createQualityGate(
        "target-success-criteria",
        "target",
        "warning",
        "目标缺少成功标准",
        "建议为 Target 补充可验收的成功标准，避免目标完成口径不一致。",
        targetsMissingSuccessCriteria.map((target) => target.id),
      ),
    );
  }

  const unlinkedActions = normalizedServes.length > 0 ? normalizedActions.filter((action) => !action.serveId) : [];
  if (unlinkedActions.length > 0) {
    gates.push(
      createQualityGate(
        "action-unlinked-serve",
        "action",
        "info",
        "行动未关联交付项",
        "已有 Serve 时，建议将相关 Action 关联到交付项，便于追踪执行到验收的链路。",
        unlinkedActions.map((action) => action.id),
      ),
    );
  }

  const blockedActions = normalizedActions.filter((action) => action.blocked);
  if (blockedActions.length > 0) {
    gates.push(
      createQualityGate(
        "action-blocked",
        "action",
        "danger",
        "行动存在阻塞",
        "存在被标记为阻塞的 Action，建议优先处理阻塞原因。",
        blockedActions.map((action) => action.id),
      ),
    );
  }

  const servesMissingChecklist = normalizedServes.filter((serve) => (serve.acceptanceChecklist?.length ?? 0) === 0);
  if (servesMissingChecklist.length > 0) {
    gates.push(
      createQualityGate(
        "serve-acceptance-checklist",
        "serve",
        "warning",
        "交付项缺少验收清单",
        "建议为 Serve 补充验收清单，明确交付是否可被接受。",
        servesMissingChecklist.map((serve) => serve.id),
      ),
    );
  }

  const pendingAcceptanceServes = normalizedServes.filter((serve) => serve.status === "delivered" && serve.acceptanceStatus !== "accepted");
  if (pendingAcceptanceServes.length > 0) {
    gates.push(
      createQualityGate(
        "serve-pending-acceptance",
        "serve",
        "warning",
        "交付项待验收",
        "存在已交付但尚未验收通过的 Serve，建议推进验收或记录返工项。",
        pendingAcceptanceServes.map((serve) => serve.id),
      ),
    );
  }

  const acceptedServes = normalizedServes.filter((serve) => serve.status === "accepted" || serve.acceptanceStatus === "accepted");
  if (acceptedServes.length > 0 && normalizedKeeps.length === 0) {
    gates.push(
      createQualityGate(
        "keep-missing-after-serve",
        "keep",
        "info",
        "验收后缺少沉淀",
        "已有验收通过的 Serve，但尚未沉淀 Keep，建议补充证据、版本或复盘资产。",
        acceptedServes.map((serve) => serve.id),
      ),
    );
  }

  return gates;
}

export function calculateProjectOverview(project: TaskProject, targets: TaskTarget[], actions: TaskAction[], serves: TaskServe[], keeps: TaskKeep[], today?: string) {
  const targetProgress = calculateTargetProgress(targets);
  const actionStats = calculateActionStats(actions, today);
  const serveStats = calculateServeStats(serves);
  const keepStats = calculateKeepStats(keeps);
  const qualityGates = calculateQualityGates(targets, actions, serves, keeps);
  const overallPercent = Math.round(targetProgress.percent * 0.3 + actionStats.percent * 0.35 + serveStats.percent * 0.2 + keepStats.percent * 0.15);

  const overview = {
    project,
    targetProgress,
    actionStats,
    serveStats,
    keepStats,
    qualityGates,
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
    version: 2,
    exportedAt: new Date().toISOString(),
    project,
    targets: targets.map(normalizeTarget),
    actions: actions.map(normalizeAction),
    serves: serves.map(normalizeServe) as TaskProjectSnapshot["serves"],
    keeps: keeps.map(normalizeKeep) as TaskProjectSnapshot["keeps"],
  };
}

export function normalizeImportedProjectSnapshot(snapshot: unknown, idFactory: () => string = uuid): TaskProjectSnapshot {
  if (!isSnapshotLike(snapshot)) {
    throw new Error("导入文件不是合法的 TASK 项目快照。");
  }

  const projectId = idFactory();

  const normalizedProject: TaskProject = {
    ...snapshot.project,
    id: projectId,
    name: `${snapshot.project.name}（导入）`,
    createdAt: new Date().toISOString(),
  };

  const normalizedTargets = snapshot.targets.map((target) => {
    const targetId = idFactory();
    return normalizeTarget({
      ...target,
      id: targetId,
      projectId,
      milestones: normalizeMilestones(target.milestones, idFactory),
      successCriteria: normalizeChecklistItems(target.successCriteria, idFactory),
      risks: normalizeChecklistItems(target.risks, idFactory),
    });
  });

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    project: normalizedProject,
    targets: normalizedTargets,
    actions: snapshot.actions.map((action) =>
      normalizeAction({
        ...action,
        id: idFactory(),
        projectId,
        evidence: normalizeActionEvidence(action.evidence),
      }),
    ),
    serves: snapshot.serves.map((serve) =>
      normalizeServe({
        ...serve,
        id: idFactory(),
        projectId,
        acceptanceStatus: serve.acceptanceStatus ?? "pending",
        acceptanceChecklist: normalizeChecklistItems(serve.acceptanceChecklist, idFactory),
        evidence: normalizeEvidenceItems(serve.evidence, idFactory),
        reworkItems: normalizeChecklistItems(serve.reworkItems, idFactory),
      }),
    ) as TaskProjectSnapshot["serves"],
    keeps: snapshot.keeps.map((keep) => normalizeKeep({ ...keep, id: idFactory(), projectId })) as TaskProjectSnapshot["keeps"],
  };
}

function isSnapshotLike(value: unknown): value is TaskProjectSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<TaskProjectSnapshot>;
  return !!snapshot.project && Array.isArray(snapshot.targets) && Array.isArray(snapshot.actions) && Array.isArray(snapshot.serves) && Array.isArray(snapshot.keeps);
}
