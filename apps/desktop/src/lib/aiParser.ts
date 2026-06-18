import type { AiConfig } from "@/stores/settingsStore";
import { aiComplete } from "@/lib/api";

export interface ParsedRequirementResult {
  targets: {
    title: string;
    description: string;
    milestones: string[];
  }[];
  actions: {
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
  }[];
}

export interface RequirementReferenceDocument {
  name: string;
  content: string;
}

const SYSTEM_PROMPT = `你是一个专业的软件工程架构师和敏捷项目管理专家。
你的任务是将用户的“项目需求文档”或“想法描述”，分解为适合项目启动的核心“目标 (T - Targets)”和具体的“行动 (A - Actions)”。

请严格遵循以下规则输出：
1. 必须输出且仅输出一个合法的 JSON 对象，不要有任何 Markdown 包裹 (不要使用 \`\`\`json 标记)，不要有任何前言、后记或解释。
2. 目标 (Targets) 指明了项目的核心方向（北极星指标），每个目标必须包含它的 title (目标名称)、description (目标背景说明) 以及 2-3 个核心里程碑 milestones (字符串数组，表明实现该目标的具体关键步骤或指标)。
3. 行动 (Actions) 是具体的待办任务或具体行动计划，每个行动必须包含它的 title (任务名称)、description (具体任务细节) 以及优先级 priority (必须是 "high"、"medium"、"low" 之一)。
4. JSON 的格式必须严格为：
{
  "targets": [
    {
      "title": "目标名称",
      "description": "目标描述",
      "milestones": ["里程碑A", "里程碑B"]
    }
  ],
  "actions": [
    {
      "title": "行动名称",
      "description": "行动细节描述",
      "priority": "high" | "medium" | "low"
    }
  ]
}

硬性要求：
- JSON 属性名和字符串值必须使用英文双引号。
- 字符串内部不能出现未转义的换行、制表符或控制字符。
- 不要输出注释、Markdown、自然语言解释或多余字段。`;

const JSON_REPAIR_PROMPT = `你是 JSON 修复器。用户会提供一个模型返回的错误 JSON 文本。
请只返回修复后的严格 JSON 对象，不要输出 Markdown、解释或额外文字。
修复后的结构必须包含 targets 和 actions 两个数组，并符合原始 TASK 需求拆解结构。`;

const MAX_PREVIEW_LENGTH = 500;
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);

export async function parseRequirementWithAi(config: AiConfig, requirementText: string, referenceDocuments: RequirementReferenceDocument[] = []): Promise<ParsedRequirementResult> {
  const textContent = await aiComplete({
    config,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildRequirementPrompt(requirementText, referenceDocuments) }],
    temperature: 0.1,
  });

  try {
    return cleanAndParseRequirementJson(textContent);
  } catch (error) {
    const repairedContent = await aiComplete({
      config,
      systemPrompt: JSON_REPAIR_PROMPT,
      messages: [
        {
          role: "user",
          content: `请修复以下 JSON，并保持 TASK 需求拆解结构：\n\n${textContent}`,
        },
      ],
      temperature: 0,
    });

    try {
      return cleanAndParseRequirementJson(repairedContent);
    } catch {
      throw error;
    }
  }
}

export function buildRequirementPrompt(requirementText: string, referenceDocuments: RequirementReferenceDocument[] = []): string {
  const references = referenceDocuments
    .filter((document) => document.content.trim())
    .map((document, index) => `【参考文档 ${index + 1}：${document.name}】\n${document.content.trim()}`)
    .join("\n\n");

  if (!references) {
    return `这是需求文档内容，请开始进行目标与任务拆解:\n${requirementText}`;
  }

  return `请先理解以下参考资料，再结合用户需求进行目标与任务拆解。

${references}

【用户需求】
${requirementText}`;
}

export function cleanAndParseRequirementJson(rawText: string): ParsedRequirementResult {
  const cleaned = extractJsonCandidate(rawText);

  try {
    return normalizeParsedRequirement(JSON.parse(cleaned));
  } catch (error) {
    console.error("AI response failed to parse as JSON. Raw text:", rawText);
    const preview = cleaned.slice(0, MAX_PREVIEW_LENGTH);
    throw new Error(`解析 AI 响应失败：返回数据不是合法的 JSON。错误原因: ${error instanceof Error ? error.message : String(error)}。响应片段: ${preview}`);
  }
}

function extractJsonCandidate(rawText: string): string {
  let cleaned = rawText.trim();
  // Remove think/thinking tags and their contents
  cleaned = cleaned.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "").trim();

  const fencedJson = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedJson?.[1]) {
    cleaned = fencedJson[1].trim();
  }

  if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    return cleaned;
  }

  const extracted = extractFirstBalancedJsonObject(cleaned);
  return extracted ?? cleaned;
}

function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function normalizeParsedRequirement(value: unknown): ParsedRequirementResult {
  if (!isRecord(value) || !Array.isArray(value.targets) || !Array.isArray(value.actions)) {
    throw new Error("JSON 结构不符合要求，必须包含 targets 和 actions 数组。");
  }

  return {
    targets: value.targets.map((target, index) => normalizeTarget(target, index)),
    actions: value.actions.map((action, index) => normalizeAction(action, index)),
  };
}

function normalizeTarget(target: unknown, index: number): ParsedRequirementResult["targets"][number] {
  if (!isRecord(target)) {
    throw new Error(`第 ${index + 1} 个 target 不是对象。`);
  }

  return {
    title: readRequiredString(target, "title", `第 ${index + 1} 个 target`),
    description: readRequiredString(target, "description", `第 ${index + 1} 个 target`),
    milestones: Array.isArray(target.milestones) ? target.milestones.map((milestone) => String(milestone)).filter(Boolean) : [],
  };
}

function normalizeAction(action: unknown, index: number): ParsedRequirementResult["actions"][number] {
  if (!isRecord(action)) {
    throw new Error(`第 ${index + 1} 个 action 不是对象。`);
  }

  const priority = typeof action.priority === "string" && VALID_PRIORITIES.has(action.priority) ? action.priority : "medium";

  return {
    title: readRequiredString(action, "title", `第 ${index + 1} 个 action`),
    description: readRequiredString(action, "description", `第 ${index + 1} 个 action`),
    priority: priority as "high" | "medium" | "low",
  };
}

function readRequiredString(record: Record<string, unknown>, key: string, scope: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${scope} 缺少 ${key} 字符串。`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// AI auto-suggestion helper to generate Serve and Keep summaries
export async function suggestServeKeepWithAi(
  config: AiConfig,
  projectInfo: { name: string; description: string },
  completedActions: { title: string; description: string }[],
): Promise<{ serve: { title: string; client: string; deliverable: string; description: string }; keep: { name: string; type: "document" | "link"; content: string }[] }> {
  const autoPrompt = `你是一个专业的项目经理和知识管理者。
当前项目「${projectInfo.name}」（项目背景：${projectInfo.description}）已经顺利完成了所有子任务的开发与交付。
以下是已完成的行动任务列表：
${completedActions.map((a, i) => `${i + 1}. ${a.title} - ${a.description || ""}`).join("\n")}

根据已完成的任务列表，你的工作是为用户自动草拟：
1. S (Serve - 服务与交付价值)：明确该项目做完后服务了谁（需求方）、交付了什么核心软件或模块成果，以及带来的最终服务价值说明。
2. K (Keep - 资产留存）：建议用户沉淀归档 2 个最重要的资产条目（例如：文档备忘或代码库外链）。

请输出且仅输出一个合法的 JSON，不要使用 Markdown 包裹。JSON 结构必须严格为：
{
  "serve": {
    "title": "交付服务总结名称",
    "client": "服务对象/需求方",
    "deliverable": "核心交付物成果",
    "description": "此次交付的价值总结（20-50字，通顺专业）"
  },
  "keep": [
    {
      "name": "资产名称 (例如：代码库地址/用户使用指南)",
      "type": "document" 或 "link",
      "content": "归档的具体提示内容，如 link 类型建议提供链接占位符如 'github.com/your-org/repo'"
    }
  ]
}`;

  const textContent = await aiComplete({
    config,
    systemPrompt: "你是一个专业的敏捷收口专家，必须严格按要求返回 JSON 结构。",
    messages: [{ role: "user", content: autoPrompt }],
    temperature: 0.1,
  });

  let cleaned = textContent.trim();
  // Remove think/thinking tags and their contents
  cleaned = cleaned.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "").trim();

  if (cleaned.startsWith("```json")) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.substring(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.substring(0, cleaned.length - 3);
  cleaned = cleaned.trim();

  return JSON.parse(cleaned);
}
