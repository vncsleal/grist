import * as fs from "fs";
import * as path from "path";
import { CONFIG, ensureDir } from "../config.js";
import { UserContextSchema, type UserContext, UserMemorySchema, type UserMemory } from "../types.js";

const CONTEXT_FILE = CONFIG.FILES.CONTEXT;
const MEMORY_FILE = CONFIG.FILES.MEMORY;

export function contextExists(): boolean {
  return fs.existsSync(CONTEXT_FILE);
}

export function loadContext(): UserContext | null {
  if (!fs.existsSync(CONTEXT_FILE)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(CONTEXT_FILE, "utf-8"));
    return UserContextSchema.parse(raw);
  } catch {
    return null;
  }
}

export function saveContext(ctx: UserContext): void {
  ensureDir(path.dirname(CONTEXT_FILE));
  const validated = UserContextSchema.parse(ctx);
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(validated, null, 2));
}

export function memoryExists(): boolean {
  return fs.existsSync(MEMORY_FILE);
}

export function loadMemory(): UserMemory {
  if (!fs.existsSync(MEMORY_FILE)) return UserMemorySchema.parse({});
  try {
    const raw = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
    return UserMemorySchema.parse(raw);
  } catch {
    return UserMemorySchema.parse({});
  }
}

export function saveMemory(mem: UserMemory): void {
  ensureDir(path.dirname(MEMORY_FILE));
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(UserMemorySchema.parse(mem), null, 2));
}

export function appendVoiceExample(text: string): void {
  const mem = loadMemory();
  const examples = [text, ...mem.voiceExamples].slice(0, 10);
  saveMemory({ ...mem, voiceExamples: examples });
}

/**
 * Render the user context as a concise text block for LLM system prompts.
 */
export function contextToPromptText(ctx: UserContext, memory?: UserMemory): string {
  const lines = [
    ctx.name ? `Name: ${ctx.name}` : null,
    `Role: ${ctx.role}`,
    `Industry: ${ctx.industry}`,
    `Topics: ${ctx.topics.join(", ")}`,
    `Voice: ${ctx.voice}`,
    `Audience: ${ctx.audienceDescription}`,
    `Goals: ${ctx.contentGoals.join(", ")}`,
    ctx.excludeTopics?.length ? `Avoid: ${ctx.excludeTopics.join(", ")}` : null,
    `Platforms: ${ctx.platforms.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const examples =
    memory?.voiceExamples?.length
      ? `\n\nVoice examples:\n${memory.voiceExamples.map((e, i) => `[${i + 1}] ${e}`).join("\n\n")}`
      : "";

  return lines + examples;
}

/** The onboarding prompt text — used as an MCP prompt. */
export const ONBOARDING_PROMPT = `You are helping a new Quillby user set up their content intelligence profile.

Ask the following questions conversationally — you don't need to number them or ask them all at once. Use natural follow-up based on their answers.

Questions to cover:
1. What is your name and professional role?
2. What industry or niche are you in?
3. What topics are you most passionate about writing on? (aim for 3–8 topics)
4. How would you describe your writing voice and style? (e.g., "direct, no-fluff, analytical" or "warm, story-driven, practitioner-focused")
5. Who is your target audience?
6. What are your content goals? (e.g., thought leadership, personal brand, lead generation, community building)
7. Are there any topics you want to avoid in your content?
8. Which platforms do you publish on? (LinkedIn, X/Twitter, blog, newsletter, Medium, etc.)
Once you have their answers, call the \`quillby_set_context\` tool with the structured data. After saving, let them know their profile is ready and suggest:
- Running \`quillby_add_feeds\` to add relevant RSS sources.
- Using \`quillby_remember\` to add example posts that define their voice — these accumulate in memory and improve every post Quillby generates.`;
