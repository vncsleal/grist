import type { AgentDefinition, AgentRole } from "@quillby/core";

export const AGENTS: AgentDefinition[] = [
  {
    role: "researcher",
    label: "@researcher",
    description: "Discovers content, reads articles, analyzes feeds and sources. Handles feed management, article enrichment, and card curation.",
    tools: {
      readTools: [
        "discover_feeds", "list_feeds", "read_article",
        "list_cards", "get_card",
        "get_memory", "get_context", "get_workspace",
        "list_workspaces",
      ],
      writeTools: [
        "add_feeds",
        "save_cards", "curate_card",
        "remember",
        "set_context",
      ],
    },
    capabilities: { canSample: true, canElicit: false },
    contextPrompt: `You are @researcher, a research specialist agent. Your job is to discover relevant content, analyze articles, and prepare structured cards.
Focus on factual accuracy, source credibility, and comprehensive coverage.
When you find something relevant, save it as a card using save_cards.
When asked to curate, mark cards as shortlisted or skipped using curate_card.`,
  },
  {
    role: "writer",
    label: "@writer",
    description: "Composes drafts, generates social posts, writes in the user's voice. Handles draft creation and post generation.",
    tools: {
      readTools: [
        "list_cards", "get_card", "list_drafts",
        "get_memory", "get_context",
      ],
      writeTools: [
        "save_draft",
        "generate_post",
        "remember",
      ],
    },
    capabilities: { canSample: true, canElicit: false },
    contextPrompt: `You are @writer, a content writer agent. Your job is to create compelling drafts and social posts in the user's voice.
Use memory (@get_memory) for voice and style guidance.
Generate drafts based on cards using save_draft.
Use generate_post for platform-specific posts (LinkedIn, X, etc.).
Always match the user's tone — reference voiceExamples and styleRules from memory.`,
  },
  {
    role: "strategist",
    label: "@strategist",
    description: "Plans content calendars, manages editorial strategy, sets goals. Handles content planning and task management.",
    tools: {
      readTools: [
        "list_cards", "get_card",
        "get_memory", "get_context",
        "plan_list", "plan_today",
        "task_list", "list_workspaces",
      ],
      writeTools: [
        "plan_create", "task_create", "task_move",
        "remember",
        "set_context",
      ],
    },
    capabilities: { canSample: true, canElicit: true },
    contextPrompt: `You are @strategist, a content strategy agent. Your job is to plan content calendars, manage editorial workflows, and track progress.
Create plans and tasks using plan_create and task_create.
Prioritize based on deadlines and content goals from memory.
Use elicitation to ask the user about their content priorities when needed.
Review today's queue with plan_today and adjust as needed.`,
  },
  {
    role: "analyst",
    label: "@analyst",
    description: "Reviews content performance, analyzes memory patterns, provides insights. Handles data analysis and recommendations.",
    tools: {
      readTools: [
        "list_cards", "get_card", "list_drafts",
        "get_memory", "get_context",
        "list_jobs", "get_job",
        "plan_list",
      ],
      writeTools: [
        "remember",
      ],
    },
    capabilities: { canSample: true, canElicit: false },
    contextPrompt: `You are @analyst, an analysis agent. Your job is to review content performance, identify patterns, and provide actionable insights.
Analyze memory patterns to spot gaps in coverage or tone drift.
Review completed drafts and their performance indicators.
Provide data-driven recommendations to @strategist and @writer.
Do NOT create or modify content directly — your role is advisory.`,
  },
];

export function getAgentByRole(role: AgentRole): AgentDefinition | undefined {
  return AGENTS.find((a) => a.role === role);
}

export function getAgentByLabel(label: string): AgentDefinition | undefined {
  return AGENTS.find((a) => a.label === label);
}
