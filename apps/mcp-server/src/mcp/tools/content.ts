import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext, ToolStorage } from "./index.js";

export const CONTENT_TOOL_NAMES = new Set([
  "onboard",
  "daily_brief",
  "open_briefing",
  "save_cards",
  "list_cards",
  "get_card",
  "curate_card",
  "save_draft",
  "list_drafts",
  "generate_post",
  "remember",
  "get_memory",
]);

export const contentToolDefinitions: Tool[] = [
  {
    name: "onboard",
    description:
      "Interactive onboarding via MCP Elicitation. Asks 3 inline questions and saves your content creator profile. Falls back to text instructions if the client does not support Elicitation.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "daily_brief",
    description:
      "Generate a fresh Quillby Briefing by fetching feeds, scoring headlines semantically, deep-reading top articles, and producing ranked cards via Sampling. Call this only when the Briefing is stale, missing, or the user explicitly asks for a refresh. To open an existing saved Briefing instantly, use open_briefing instead. Requires Sampling.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        topN: { type: "number", description: "How many top-scored articles to deep-read and card. Default: 10." },
      },
    },
  },
  {
    name: "open_briefing",
    description:
      "Open the most recent Quillby Briefing instantly from saved workspace state — no network calls, no Sampling. Always call this first when the user opens Quillby or asks to see their brief. Falls back with a clear message if no Briefing has been generated yet.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
      },
    },
  },
  {
    name: "save_cards",
    description:
      "Save analyzed structure cards. Quillby persists them.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              source: { type: "string" },
              link: { type: "string" },
              thesis: { type: "string" },
              relevanceScore: { type: "number" },
              relevanceReason: { type: "string" },
              keyInsights: { type: "array", items: { type: "string" } },
              insightOptions: { type: "array", items: { type: "string" } },
              takeOptions: { type: "array", items: { type: "string" } },
              angleOptions: { type: "array", items: { type: "string" } },
              hookOptions: { type: "array", items: { type: "string" } },
              wireframeOptions: { type: "array", items: { type: "string" } },
              trendTags: { type: "array", items: { type: "string" } },
              transposabilityHint: { type: "string" },
            },
            required: ["title", "source", "link", "thesis"],
          },
        },
      },
    },
  },
  {
    name: "list_cards",
    description:
      "List saved story candidates from the latest harvest. Best used behind the scenes when Claude is opening or updating a Story artifact.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
        limit: { type: "number", description: "Max cards to return." },
        minScore: { type: "number", description: "Filter cards at or above this relevance score (0\u201310)." },
      },
    },
  },
  {
    name: "get_card",
    description:
      "Get full details for one saved story candidate by ID. Best used behind the scenes when Claude is opening or updating a Story artifact.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
        cardId: { type: "number" },
      },
      required: ["cardId"],
    },
  },
  {
    name: "curate_card",
    description:
      "Mark a story card as shortlisted, skipped, or clear its status. Use this to build the drafting queue from the Briefing. Shortlisted = queued for drafting; skipped = not useful this cycle; clear = remove any status.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
        cardId: { type: "number", description: "Structure card ID to curate." },
        action: { type: "string", enum: ["shortlist", "skip", "clear"], description: "shortlist = queue for drafting; skip = skip this cycle; clear = remove status." },
      },
      required: ["cardId", "action"],
    },
  },
  {
    name: "save_draft",
    description:
      "Persist a finished draft post to workspace storage. Call after generate_post or whenever the user approves a draft to keep.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
        content: { type: "string" },
        platform: { type: "string", description: "linkedin, x, instagram, threads, blog, newsletter, medium" },
        cardId: { type: "number" },
        addToVoiceExamples: { type: "boolean", description: "If true, saves this draft as a voice example in memory." },
      },
      required: ["content", "platform"],
    },
  },
  {
    name: "list_drafts",
    description:
      "List saved draft posts for the current workspace, most recent first.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
      },
    },
  },
  {
    name: "generate_post",
    description:
      "Generate a finished post via MCP Sampling and save it as a draft. Loads the card, user profile, platform guide, and voice examples \u2014 writes the post, saves it. One call: write + save. If no cardId is given, auto-selects the top shortlisted or highest-scored card. If no platform is given, defaults to the user\u2019s first saved platform. Requires Sampling.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "number", description: "Structure card ID to base the post on. Omit to auto-select the top shortlisted or highest-scored card." },
        platform: { type: "string", description: "linkedin, x, instagram, threads, blog, newsletter, medium. Omit to use the user\u2019s default platform from their profile." },
        angle: { type: "string", description: "Specific angle or take to use. If omitted, uses the card\u2019s top angle option." },
      },
    },
  },
  {
    name: "remember",
    description:
      "Add structured memory to the current workspace. Supports voice examples, editorial memory buckets, and one-time visual/voice/face setup for generation. Only store identity profiles (voice/face) when the subject has explicitly consented.",
    annotations: { readOnlyHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
        entries: { type: "array", items: { type: "string" }, description: "Memory entries to add." },
        memoryType: { type: "string", enum: ["voice_examples", "style_rules", "audience_insights", "do_not_say", "successful_posts", "campaign_context", "source_preferences", "visual_style", "voice_profile", "face_profile"], description: "voice_examples, style_rules, audience_insights, do_not_say, successful_posts, campaign_context, source_preferences, visual_style (one-time image style setup), voice_profile (one-time audio voice setup), face_profile (one-time face/appearance setup for image/video likeness)" },
      },
      required: ["entries"],
    },
  },
  {
    name: "get_memory",
    description:
      "Read typed memory from the current workspace. Claude should use this behind the scenes when opening or updating the Voice System artifact.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
        memoryType: { type: "string", enum: ["voice_examples", "style_rules", "audience_insights", "do_not_say", "successful_posts", "campaign_context", "source_preferences", "visual_style", "voice_profile", "face_profile"] },
      },
    },
  },
];

export async function handleContentTool(
  _name: string,
  _args: Record<string, unknown>,
  _context: ToolContext,
  _storage: ToolStorage,
  _resolveStorage: () => Promise<ToolStorage>,
  _sample: (server: ToolContext["server"], prompt: string, maxTokens?: number) => Promise<string | null>,
  _server: ToolContext["server"],
  _userContext: Record<string, unknown> | null,
  _deploymentMode: string,
): Promise<{ content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }> {
  throw new Error(`Content tool ${_name} not yet extracted`);
}
