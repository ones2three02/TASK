import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiComplete } from "@/lib/api";
import { cleanAndParseRequirementJson, parseRequirementWithAi } from "@/lib/aiParser";
import type { AiConfig } from "@/stores/settingsStore";

vi.mock("@/lib/api", () => ({
  aiComplete: vi.fn(),
}));

const aiCompleteMock = vi.mocked(aiComplete);

const aiConfig: AiConfig = {
  provider: "custom",
  apiKey: "test-key",
  authMethod: "api-key",
  endpoint: "https://example.test/v1/chat/completions",
  model: "test-model",
  apiStyle: "completions",
};

const validRequirementJson = JSON.stringify({
  targets: [
    {
      title: "上线 TASK 项目规划",
      description: "建立目标、行动、交付、沉淀四层闭环。",
      scope: "个人项目规划",
      outOfScope: "财务系统改造",
      successCriteria: ["形成可执行看板"],
      risks: ["需求边界变化"],
      milestones: ["完成项目章程", "完成交付验收"],
    },
  ],
  actions: [
    {
      title: "梳理需求",
      description: "整理参考文档并拆分行动。",
      priority: "high",
      serveTitle: "项目规划方案",
      dueDate: "",
    },
  ],
  serves: [
    {
      title: "项目规划方案",
      description: "输出可交付规划。",
      deliverable: "TASK 四层计划",
      client: "项目负责人",
      plannedAt: "",
      acceptanceChecklist: ["目标清晰", "交付物明确"],
    },
  ],
  keeps: [
    {
      name: "需求依据",
      type: "document",
      content: "参考文档摘要",
      relatedServeTitle: "项目规划方案",
    },
  ],
});

describe("aiParser", () => {
  beforeEach(() => {
    aiCompleteMock.mockReset();
  });

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

  it("retries with a compact prompt when the first AI response is truncated", async () => {
    aiCompleteMock.mockResolvedValueOnce('{"targets":[{"title":"目标"').mockResolvedValueOnce(validRequirementJson);

    const result = await parseRequirementWithAi(aiConfig, "分析下一文档", [
      {
        name: "guide.md",
        content: "这是一份需要作为项目规划依据的指导文档。",
      },
    ]);

    expect(result.targets[0]?.title).toBe("上线 TASK 项目规划");
    expect(aiCompleteMock).toHaveBeenCalledTimes(2);
    expect(aiCompleteMock.mock.calls[1]?.[0]?.systemPrompt).toContain("容错重试");
  });

  it("retries with compact references when the first AI request has a transport failure", async () => {
    aiCompleteMock.mockRejectedValueOnce(new Error("AI request failed: error sending request for url (https://api.minimaxi.com/v1/chat/completions)")).mockResolvedValueOnce(validRequirementJson);

    const result = await parseRequirementWithAi(aiConfig, "解析一下", [
      {
        name: "guide.md",
        content: "参考资料".repeat(5000),
      },
    ]);

    expect(result.targets[0]?.title).toBe("上线 TASK 项目规划");
    expect(aiCompleteMock).toHaveBeenCalledTimes(2);
    expect(aiCompleteMock.mock.calls[1]?.[0]?.maxTokens).toBe(4096);
    expect(aiCompleteMock.mock.calls[1]?.[0]?.messages[0]?.content).toContain("已只发送前");
  });

  it("turns repeated MiniMax transport failures into a readable diagnostic", async () => {
    aiCompleteMock.mockRejectedValue(new Error("AI request failed: error sending request for url (https://api.minimaxi.com/v1/chat/completions)"));

    await expect(parseRequirementWithAi(aiConfig, "解析一下", [{ name: "guide.md", content: "参考资料" }])).rejects.toThrow(/MiniMax 接口.*不可达/);
    expect(aiCompleteMock).toHaveBeenCalledTimes(2);
  });

  it("reports a clear empty-response hint when the AI service returns no content", () => {
    expect(() => cleanAndParseRequirementJson("")).toThrow(/AI 服务返回空内容/);
  });
});
