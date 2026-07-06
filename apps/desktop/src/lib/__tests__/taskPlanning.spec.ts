import { describe, expect, it } from "vitest";
import { buildQualityGateAutofillPlan, calculateProjectOverview, calculateQualityGates, type TaskAction, type TaskKeep, type TaskProject, type TaskServe, type TaskTarget } from "@/lib/taskPlanning";

const baseTarget: TaskTarget = {
  id: "target-1",
  projectId: "project-1",
  title: "企业级 TASK 闭环",
  description: "让项目从目标到存档完整闭环。",
  status: "pending",
  createdAt: "2026-07-07T00:00:00.000Z",
  milestones: [{ id: "milestone-1", title: "完成规划", completed: false }],
  successCriteria: [{ id: "criteria-1", title: "有明确验收标准", completed: false }],
};

const baseAction: TaskAction = {
  id: "action-1",
  projectId: "project-1",
  title: "实现质量门",
  description: "补齐 T/A/S/K 质量门。",
  status: "todo",
  priority: "P1",
  createdAt: "2026-07-07T00:00:00.000Z",
  targetId: "target-1",
  milestoneId: "milestone-1",
  serveId: "serve-1",
};

const baseServe: TaskServe = {
  id: "serve-1",
  projectId: "project-1",
  title: "企业级能力交付",
  description: "交付一套可验证的闭环能力。",
  deliverable: "质量门规则与测试",
  client: "项目负责人",
  status: "active",
  acceptanceStatus: "pending",
  acceptanceChecklist: [{ id: "acceptance-1", title: "规则可见且可验证", completed: false }],
  createdAt: "2026-07-07T00:00:00.000Z",
};

const baseProject: TaskProject = {
  id: "project-1",
  name: "TASK 企业级闭环",
  description: "持续优化到企业级标准。",
  createdAt: "2026-07-07T00:00:00.000Z",
};

function gateIds(targets: TaskTarget[] = [baseTarget], actions: TaskAction[] = [baseAction], serves: TaskServe[] = [baseServe], keeps: TaskKeep[] = []) {
  return calculateQualityGates(targets, actions, serves, keeps).map((gate) => gate.id);
}

describe("taskPlanning quality gates", () => {
  it("flags targets without explicit scope and risk register", () => {
    expect(gateIds()).toContain("target-scope-boundary");
    expect(gateIds()).toContain("target-risk-register");
  });

  it("flags active actions without execution, test, and output checklists", () => {
    expect(gateIds()).toContain("action-missing-dev-checklist");
    expect(gateIds()).toContain("action-missing-test-checklist");
    expect(gateIds()).toContain("action-missing-output-checklist");
  });

  it("flags completed actions without evidence", () => {
    expect(gateIds([baseTarget], [{ ...baseAction, status: "done" }], [baseServe], [])).toContain("action-done-without-evidence");
  });

  it("flags accepted deliverables without evidence and missing related Keep assets", () => {
    const acceptedServe: TaskServe = {
      ...baseServe,
      status: "accepted",
      acceptanceStatus: "accepted",
      acceptanceChecklist: baseServe.acceptanceChecklist?.map((item) => ({ ...item, completed: true })),
    };

    expect(gateIds([baseTarget], [baseAction], [acceptedServe], [])).toContain("serve-accepted-without-evidence");
    expect(gateIds([baseTarget], [baseAction], [acceptedServe], [])).toContain("keep-missing-serve-asset");
  });

  it("flags completed projects without retrospective Keep asset", () => {
    const completedTarget: TaskTarget = {
      ...baseTarget,
      status: "completed",
      scope: "只覆盖 TASK 项目规划能力",
      outOfScope: "不做云协作",
      milestones: baseTarget.milestones.map((item) => ({ ...item, completed: true })),
      risks: [{ id: "risk-1", title: "发布链路不稳定", completed: true }],
    };
    const completedAction: TaskAction = {
      ...baseAction,
      status: "done",
      evidence: "测试通过并已推送",
      devItems: [{ id: "dev-1", title: "完成实现", completed: true }],
      testItems: [{ id: "test-1", title: "补充测试", completed: true }],
      outputItems: [{ id: "output-1", title: "提交代码", completed: true }],
    };
    const acceptedServe: TaskServe = {
      ...baseServe,
      status: "accepted",
      acceptanceStatus: "accepted",
      acceptanceChecklist: baseServe.acceptanceChecklist?.map((item) => ({ ...item, completed: true })),
      evidence: [{ id: "evidence-1", title: "验收记录", content: "已验收", type: "text", createdAt: "2026-07-07T00:00:00.000Z" }],
    };
    const evidenceKeep: TaskKeep = {
      id: "keep-1",
      projectId: "project-1",
      name: "验收证据",
      type: "evidence",
      content: "验收截图与链接",
      relatedServeId: "serve-1",
      createdAt: "2026-07-07T00:00:00.000Z",
    };

    expect(gateIds([completedTarget], [completedAction], [acceptedServe], [evidenceKeep])).toContain("keep-missing-retrospective");
  });

  it("summarizes quality gates into an enterprise governance score", () => {
    const overview = calculateProjectOverview(baseProject, [baseTarget], [baseAction], [baseServe], []);

    expect(overview.qualityGateSummary.total).toBeGreaterThan(0);
    expect(overview.qualityGateSummary.bySeverity.warning).toBeGreaterThan(0);
    expect(overview.qualityGateSummary.score).toBeLessThan(100);
    expect(overview.qualityGateSummary.label).toMatch(/需治理|高风险/);
  });

  it("builds a safe autofill plan for templateable quality gates only", () => {
    const completedTarget: TaskTarget = {
      ...baseTarget,
      status: "completed",
      milestones: baseTarget.milestones.map((item) => ({ ...item, completed: true })),
    };
    const completedAction: TaskAction = {
      ...baseAction,
      status: "done",
    };
    const acceptedServe: TaskServe = {
      ...baseServe,
      status: "accepted",
      acceptanceStatus: "accepted",
      acceptanceChecklist: baseServe.acceptanceChecklist?.map((item) => ({ ...item, completed: true })),
    };

    const plan = buildQualityGateAutofillPlan(baseProject, [completedTarget], [completedAction], [acceptedServe], []);

    expect(plan.targets[0]?.scope).toContain("本项目聚焦");
    expect(plan.targets[0]?.outOfScope).toContain("暂不包含");
    expect(plan.targets[0]?.risks?.length).toBeGreaterThan(0);
    expect(plan.actions[0]?.devItems?.length).toBeGreaterThan(0);
    expect(plan.actions[0]?.testItems?.length).toBeGreaterThan(0);
    expect(plan.actions[0]?.outputItems?.length).toBeGreaterThan(0);
    expect(plan.actions[0]?.evidence).toBeFalsy();
    expect(plan.serves[0]?.evidence).toHaveLength(0);
    expect(plan.keeps[0]?.type).toBe("retrospective");
  });
});
