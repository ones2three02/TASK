import { test } from "vitest";
import assert from "node:assert/strict";
import { buildRequirementPrompt, cleanAndParseRequirementJson } from "../../apps/desktop/src/lib/aiParser.ts";

test("parses requirement JSON wrapped in markdown fences", () => {
  const result = cleanAndParseRequirementJson(`\`\`\`json
{
  "targets": [
    {
      "title": "同步飞书多维表格",
      "description": "将内部系统人员与工资信息同步到飞书。",
      "milestones": ["确认字段映射", "完成同步任务"]
    }
  ],
  "actions": [
    {
      "title": "梳理人员字段",
      "description": "明确人员基础信息字段、来源表和同步频率。",
      "priority": "high"
    }
  ]
}
\`\`\``);

  assert.equal(result.targets[0].title, "同步飞书多维表格");
  assert.deepEqual(result.targets[0].successCriteria, []);
  assert.equal(result.actions[0].priority, "high");
  assert.deepEqual(result.serves, []);
  assert.deepEqual(result.keeps, []);
});

test("extracts the first balanced JSON object from model chatter", () => {
  const result = cleanAndParseRequirementJson(`下面是拆解结果：
{
  "targets": [{"title": "建立同步闭环", "description": "保障数据准确同步。", "milestones": ["字段映射", "权限校验"]}],
  "actions": [{"title": "确认飞书 API 权限", "description": "申请并验证多维表格写入权限。", "priority": "medium"}]
}
以上内容供参考。`);

  assert.equal(result.targets.length, 1);
  assert.equal(result.actions[0].title, "确认飞书 API 权限");
});

test("parses full TASK four-layer requirement planning output", () => {
  const result = cleanAndParseRequirementJson(`{
  "targets": [{
    "title": "建立同步交付闭环",
    "description": "把内部系统数据可靠同步到飞书。",
    "scope": "人员和工资信息同步",
    "outOfScope": "不做审批流",
    "successCriteria": ["同步结果可验收", "异常可追踪"],
    "risks": ["飞书权限审批可能延迟"],
    "milestones": ["字段映射", "联调验证"]
  }],
  "actions": [{
    "title": "确认飞书 API 权限",
    "description": "申请并验证多维表格写入权限。",
    "priority": "medium",
    "serveTitle": "飞书同步方案交付",
    "dueDate": "2026-06-30"
  }],
  "serves": [{
    "title": "飞书同步方案交付",
    "description": "交付可执行的数据同步方案。",
    "deliverable": "同步脚本和字段映射文档",
    "client": "人事团队",
    "plannedAt": "2026-07-05",
    "acceptanceChecklist": ["人员字段同步准确", "工资字段权限受控"]
  }],
  "keeps": [{
    "name": "字段映射说明",
    "type": "evidence",
    "content": "飞书表字段与内部系统字段映射记录",
    "relatedServeTitle": "飞书同步方案交付"
  }]
}`);

  assert.equal(result.targets[0].scope, "人员和工资信息同步");
  assert.equal(result.targets[0].successCriteria.length, 2);
  assert.equal(result.actions[0].serveTitle, "飞书同步方案交付");
  assert.equal(result.serves[0].acceptanceChecklist.length, 2);
  assert.equal(result.keeps[0].type, "evidence");
});

test("reports a readable preview when requirement JSON is invalid", () => {
  assert.throws(
    () => cleanAndParseRequirementJson(`{"targets":[{"title":"坏 JSON" "description":"缺少逗号"}],"actions":[]}`),
    /解析 AI 响应失败.*响应片段/s,
  );
});

test("builds requirement prompt with reference documents before user request", () => {
  const prompt = buildRequirementPrompt("同步人员信息和工资信息", [
    {
      name: "飞书同步手册.md",
      content: "多维表格需要先创建 app token 和 table id。",
    },
  ]);

  assert.match(prompt, /【参考文档 1：飞书同步手册\.md】/);
  assert.match(prompt, /多维表格需要先创建 app token 和 table id/);
  assert.match(prompt, /【用户需求】\n同步人员信息和工资信息/);
});

test("builds requirement prompt for full TASK four-layer planning", () => {
  const prompt = buildRequirementPrompt("规划一个内部工具");

  assert.match(prompt, /目标、行动、交付和沉淀/);
  assert.match(prompt, /规划一个内部工具/);
});
