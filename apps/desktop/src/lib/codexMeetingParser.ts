import type { AiConfig } from "@/stores/settingsStore";
import { aiComplete } from "@/lib/api";

export interface ParsedMeetingResult {
  target?: {
    title: string;
    description: string;
    milestones: string[];
    scope: string;
    outOfScope: string;
    successCriteria: string[];
    risks: string[];
  };
  actions: {
    title: string;
    description: string;
    priority: "P0" | "P1" | "P2" | "P3";
    dueDate: string; // YYYY-MM-DD
    devItems?: string[];
    testItems?: string[];
    outputItems?: string[];
  }[];
  keep: {
    name: string;
    content: string; // Rich retrospective summaries formatted in Markdown
  };
}

const SYSTEM_PROMPT = `你是一个专业的敏捷项目管理专家与项目助理。
你的任务是阅读并分析用户提供的“项目会议纪要”、“录音转文字记录”或“速记草稿”。
你需要根据会议的讨论和决议，梳理出：
1. 本次会议确定的项目核心目标 (Target)；
2. 本次会议决议的后续具体行动任务 (Actions)；
3. 本次会议的简报与回顾文档 (Keep, 使用 Markdown 格式整理)。

请严格遵循以下规则输出：
1. 必须输出且仅输出一个合法的 JSON 对象，不要有任何 Markdown 包裹 (不要使用 \`\`\`json 标记)，不要有任何前言、后记或解释。
2. 目标 (target) 是项目的核心目标。如果会议中重新界定了项目方向，请生成它。字段包括：title、description、milestones (2-4个核心里程碑)、scope (项目范围)、outOfScope (排除在外的范围)、successCriteria (成功验收指标)、risks (识别的风险和假设)。
3. 行动 (actions) 是后续要执行的具体待办。每个行动必须包含：title、description、priority ("P0"|"P1"|"P2"|"P3")、dueDate ("YYYY-MM-DD"格式，如果不明确请根据会议时间预测或留空)、devItems (开发/实施步骤)、testItems (测试或验收关注点)、outputItems (产出物，例如配置文件、报告或代码模块)。
4. 归档简报 (keep) 是一份精炼的会议 retrospective 记录。name 通常是 "XXXX年XX月XX日 XXX会议纪要"，content 必须是详细的 Markdown 文本，包含：会议时间、参会人、主要讨论议题、核心决议以及后续任务总览。
5. JSON 结构必须严格为：
{
  "target": {
    "title": "项目目标名称",
    "description": "项目目标详细描述",
    "scope": "范围说明",
    "outOfScope": "排除范围",
    "successCriteria": ["指标1", "指标2"],
    "risks": ["风险项1"],
    "milestones": ["里程碑A", "里程碑B"]
  },
  "actions": [
    {
      "title": "行动任务名称",
      "description": "具体怎么做的描述",
      "priority": "P1",
      "dueDate": "YYYY-MM-DD",
      "devItems": ["步骤1", "步骤2"],
      "testItems": ["自测项1"],
      "outputItems": ["产出物1"]
    }
  ],
  "keep": {
    "name": "2026-06-27 项目方案启动会纪要",
    "content": "# 会议概要\\n- **时间**: 2026-06-27\\n- **参会人**: ...\\n...\\n# 核心决议\\n..."
  }
}

硬性要求：
- 属性名和字符串值必须使用英文双引号。
- 字符串内部的换行符必须双重转义为 \\n，不要使用真实的换行符，以防破坏 JSON 结构。
- 不要输出注释、Markdown 外套、自然语言解释或多余字段。`;

const JSON_REPAIR_PROMPT = `你是 JSON 修复器。用户会提供一个模型返回的错误 JSON 文本。
请只返回修复后的严格 JSON 对象，不要输出 Markdown 标记、解释或额外文字。
修复后的结构必须符合包含 target (可选), actions, keep 字段的会议决议规范。`;

export async function parseMeetingWithAi(config: AiConfig, meetingText: string): Promise<ParsedMeetingResult> {
  const userPrompt = `这里是本次项目会议的原始纪要/速记内容，请帮我整理项目目标和行动卡片：\n\n${meetingText}`;

  let rawResponse: string;
  try {
    rawResponse = await aiComplete({
      config,
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 4096,
      temperature: 0.1,
    });
  } catch (error) {
    throw new Error(`AI 请求失败，请检查设置: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    return cleanAndParseMeetingJson(rawResponse);
  } catch {
    // Attempt one repair
    try {
      const repairedResponse = await aiComplete({
        config,
        systemPrompt: JSON_REPAIR_PROMPT,
        messages: [{ role: "user", content: `请修复以下 JSON 结构：\n\n${rawResponse}` }],
        maxTokens: 4096,
        temperature: 0,
      });
      return cleanAndParseMeetingJson(repairedResponse);
    } catch {
      throw new Error("AI 返回的数据格式无法解析为 JSON，请重试或精简你的会议文本。");
    }
  }
}

function cleanAndParseMeetingJson(rawText: string): ParsedMeetingResult {
  let cleanText = rawText.trim();

  // Strip Markdown JSON formatting if exists
  if (cleanText.startsWith("```")) {
    const lines = cleanText.split("\n");
    if (lines[0].startsWith("```")) {
      lines.shift();
    }
    if (lines[lines.length - 1].startsWith("```")) {
      lines.pop();
    }
    cleanText = lines.join("\n").trim();
  }

  // Remove potential starting text like "Here is the JSON:"
  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanText = cleanText.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(cleanText);

  // Validate basic shape
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Parsed result is not an object");
  }

  if (!Array.isArray(parsed.actions)) {
    parsed.actions = [];
  }

  if (!parsed.keep || typeof parsed.keep !== "object") {
    parsed.keep = {
      name: `${new Date().toISOString().split("T")[0]} 会议纪要整理`,
      content: "# 会议记录\\n" + (cleanText.slice(0, 200) || ""),
    };
  }

  return parsed as ParsedMeetingResult;
}
