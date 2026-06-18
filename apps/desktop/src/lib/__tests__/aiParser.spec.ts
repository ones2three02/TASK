import { describe, expect, it } from "vitest";
import { cleanAndParseRequirementJson } from "@/lib/aiParser";

describe("aiParser", () => {
  it("parses strict TASK JSON from a fenced model response", () => {
    const result = cleanAndParseRequirementJson(`
\`\`\`json
{
  "targets": [
    {
      "title": "上线 TASK 项目规划",
      "description": "建立目标、行动、交付、沉淀四层闭环。",
      "scope": "个人项目规划",
      "outOfScope": "财务系统改造",
      "successCriteria": ["形成可执行看板"],
      "risks": ["需求边界变化"],
      "milestones": ["完成项目章程", "完成交付验收"]
    }
  ],
  "actions": [
    {
      "title": "梳理需求",
      "description": "整理参考文档并拆分行动。",
      "priority": "high",
      "serveTitle": "项目规划方案",
      "dueDate": ""
    }
  ],
  "serves": [
    {
      "title": "项目规划方案",
      "description": "输出可交付规划。",
      "deliverable": "TASK 四层计划",
      "client": "项目负责人",
      "plannedAt": "",
      "acceptanceChecklist": ["目标清晰", "交付物明确"]
    }
  ],
  "keeps": [
    {
      "name": "需求依据",
      "type": "document",
      "content": "参考文档摘要",
      "relatedServeTitle": "项目规划方案"
    }
  ]
}
\`\`\`
`);

    expect(result.targets[0]?.title).toBe("上线 TASK 项目规划");
    expect(result.actions[0]?.priority).toBe("high");
    expect(result.serves[0]?.acceptanceChecklist).toContain("交付物明确");
    expect(result.keeps[0]?.type).toBe("document");
  });

  it("reports a clear truncated-response hint for incomplete JSON", () => {
    expect(() => cleanAndParseRequirementJson('{"targets":[{"title":"目标"')).toThrow(/响应疑似被模型截断/);
  });
});
