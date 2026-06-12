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
}`;

export async function parseRequirementWithAi(config: AiConfig, requirementText: string): Promise<ParsedRequirementResult> {
  const textContent = await aiComplete({
    config,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `这是需求文档内容，请开始进行目标与任务拆解:\n${requirementText}` }],
    temperature: 0.1,
  });

  return cleanAndParseJson(textContent);
}

// Cleans JSON markdown syntax wrapped by LLMs (e.g. ```json ... ```)
function cleanAndParseJson(rawText: string): ParsedRequirementResult {
  let cleaned = rawText.trim();

  // Remove think/thinking tags and their contents
  cleaned = cleaned.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "").trim();

  // Remove markdown code blocks if present
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }

  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.targets || !parsed.actions) {
      throw new Error("Parsed JSON structure does not match target/actions scheme.");
    }
    return parsed as ParsedRequirementResult;
  } catch (error) {
    console.error("AI response failed to parse as JSON. Raw text:", rawText);
    throw new Error(`解析 AI 响应失败：返回数据不是合法的 JSON。错误原因: ${error}`);
  }
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
