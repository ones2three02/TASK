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
  assert.equal(result.actions[0].priority, "high");
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
