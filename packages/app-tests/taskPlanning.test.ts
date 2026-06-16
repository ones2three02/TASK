import { test } from "vitest";
import assert from "node:assert/strict";
import {
  buildProjectRetrospective,
  calculateActionStats,
  calculateProjectOverview,
  calculateTargetProgress,
  exportProjectSnapshot,
  normalizeImportedProjectSnapshot,
} from "../../apps/desktop/src/lib/taskPlanning.ts";

const project = {
  id: "project-1",
  name: "TASK 优化",
  description: "完善项目规划闭环",
  createdAt: "2026-06-01T00:00:00.000Z",
};

const targets = [
  {
    id: "target-1",
    projectId: "project-1",
    title: "完成闭环规划",
    description: "让项目从目标到归档可追踪",
    status: "pending" as const,
    createdAt: "2026-06-01T00:00:00.000Z",
    milestones: [
      { id: "m-1", title: "目标设计", completed: true },
      { id: "m-2", title: "行动拆解", completed: false },
    ],
  },
  {
    id: "target-2",
    projectId: "project-1",
    title: "完成发布准备",
    description: "补齐文档和验证",
    status: "completed" as const,
    createdAt: "2026-06-02T00:00:00.000Z",
    milestones: [],
  },
];

const actions = [
  {
    id: "action-1",
    projectId: "project-1",
    title: "补充 Dashboard",
    description: "增加项目总览",
    status: "done" as const,
    priority: "high" as const,
    dueDate: "2026-06-10",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "action-2",
    projectId: "project-1",
    title: "更新 README",
    description: "同步产品说明",
    status: "todo" as const,
    priority: "medium" as const,
    dueDate: "2026-06-12",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "action-3",
    projectId: "project-1",
    title: "准备演示",
    description: "",
    status: "in_progress" as const,
    priority: "low" as const,
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

const serves = [
  {
    id: "serve-1",
    projectId: "project-1",
    title: "项目规划工具交付",
    description: "可用于工作项目规划",
    deliverable: "TASK 闭环增强版",
    client: "个人项目负责人",
    status: "delivered" as const,
    deliveredAt: "2026-06-15",
    acceptanceStatus: "accepted" as const,
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

const keeps = [
  {
    id: "keep-1",
    projectId: "project-1",
    name: "复盘文档",
    type: "document" as const,
    content: "记录项目经验",
    createdAt: "2026-06-16T00:00:00.000Z",
  },
];

test("calculates target progress from milestones and target status", () => {
  const progress = calculateTargetProgress(targets);

  assert.equal(progress.total, 2);
  assert.equal(progress.completed, 1);
  assert.equal(progress.totalMilestones, 3);
  assert.equal(progress.completedMilestones, 2);
  assert.equal(progress.percent, 67);
});

test("calculates action stats including overdue unfinished actions", () => {
  const stats = calculateActionStats(actions, "2026-06-16");

  assert.equal(stats.total, 3);
  assert.equal(stats.done, 1);
  assert.equal(stats.inProgress, 1);
  assert.equal(stats.todo, 1);
  assert.equal(stats.overdue, 1);
  assert.equal(stats.highPriority, 1);
  assert.equal(stats.percent, 33);
});

test("recommends creating actions when targets exist without actions", () => {
  const overview = calculateProjectOverview(project, targets, [], [], [], "2026-06-16");

  assert.equal(overview.recommendation.stage, "action");
  assert.match(overview.recommendation.message, /拆解/);
});

test("builds a retrospective document containing all TASK sections", () => {
  const retrospective = buildProjectRetrospective(project, targets, actions, serves, keeps);

  assert.match(retrospective, /# 项目复盘 - TASK 优化/);
  assert.match(retrospective, /## Target 目标达成/);
  assert.match(retrospective, /## Action 行动结果/);
  assert.match(retrospective, /## Serve 交付价值/);
  assert.match(retrospective, /## Keep 资产沉淀/);
});

test("exports and normalizes project snapshots without reusing imported ids", () => {
  const snapshot = exportProjectSnapshot(project, targets, actions, serves, keeps);
  const ids = ["new-project", "new-target", "new-m1", "new-m2", "new-target-2", "new-action", "new-action-2", "new-action-3", "new-serve", "new-keep"];
  const normalized = normalizeImportedProjectSnapshot(snapshot, () => ids.shift() ?? "fallback-id");

  assert.equal(normalized.project.id, "new-project");
  assert.notEqual(normalized.project.id, project.id);
  assert.equal(normalized.targets[0].projectId, "new-project");
  assert.equal(normalized.targets[0].id, "new-target");
  assert.equal(normalized.targets[0].milestones[0].id, "new-m1");
  assert.equal(normalized.actions[0].projectId, "new-project");
  assert.equal(normalized.serves[0].acceptanceStatus, "accepted");
  assert.equal(normalized.keeps[0].projectId, "new-project");
});
