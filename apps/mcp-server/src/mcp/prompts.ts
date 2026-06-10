import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import type { WorkspaceStorage } from "@quillby/core";
import { contextToPromptText, ONBOARDING_PROMPT } from "../agents/onboard.js";

export const PROMPTS: Prompt[] = [
  {
    name: "onboarding",
    description: "Guide the user through initial Quillby setup — collect their content profile (role, topics, voice, audience, goals, platforms) and save it to the active workspace.",
  },
  {
    name: "session_start",
    description: "Open Quillby the Claude-native way — loads workspace context, memory, feeds, briefing, and drafts, then establishes the behavior contract for a productive writing session.",
  },
  {
    name: "briefing",
    description: "How Claude should create and update the Quillby Briefing artifact — a structured daily or weekly intelligence brief that synthesizes harvest highlights, trend analysis, and content recommendations.",
  },
  {
    name: "story",
    description: "How Claude should open and update a Quillby Story artifact — a long-form content piece with headline, hook, body sections, and platform-specific adaptations.",
  },
  {
    name: "voice_system",
    description: "How Claude should open and update the Quillby Voice System artifact — the canonical reference for the user's writing voice, style rules, do-not-say items, and audience insights.",
  },
  {
    name: "projects_playbook",
    description: "How to align Quillby workspaces, Claude Projects, and native Artifacts — a reference for structuring your workflow across all three layers.",
  },
];

export async function getPrompt(
  name: string,
  storage: WorkspaceStorage,
  _args?: Record<string, string>
): Promise<{ messages: { role: "user" | "assistant"; content: { type: "text"; text: string } }[] }> {
  const msg = (text: string) => ({
    messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
  });

  switch (name) {
    case "onboarding": {
      if (await storage.contextExists()) {
        const ctx = await storage.loadContext();
        const mem = await storage.loadTypedMemory();
        const profileText = ctx ? contextToPromptText(ctx, mem) : "No context loaded.";
        return msg(
          `The user already has a content profile saved for this workspace.\n\n${profileText}\n\nAsk the user if they want to update any of these details, or skip if everything looks correct.`
        );
      }
      return msg(ONBOARDING_PROMPT);
    }

    case "session_start": {
      const [ctx, mem, sources, drafts] = await Promise.all([
        storage.contextExists().then((e) => (e ? storage.loadContext() : null)),
        storage.loadTypedMemory(),
        storage.loadSources(),
        storage.listDrafts(),
      ]);

      const contextBlock = ctx
        ? contextToPromptText(ctx, mem)
        : "No content profile yet. Run the onboarding prompt to set one up.";

      const feedsBlock = sources.length > 0
        ? `Configured feeds (${sources.length}):\n${sources.slice(0, 10).map((s) => `  \u2022 ${s}`).join("\n")}${sources.length > 10 ? `\n  ... and ${sources.length - 10} more` : ""}`
        : "No RSS feeds configured yet.";

      const draftsBlock = drafts.length > 0
        ? `Active drafts (${drafts.length}):\n${drafts.slice(0, 5).map((d) => `  \u2022 [${d.platform}] ${d.preview}`).join("\n")}${drafts.length > 5 ? `\n  ... and ${drafts.length - 5} more` : ""}`
        : "No drafts yet.";

      return msg(
        `# Quillby Session\n\n## Workspace State\n\n${contextBlock}\n\n${feedsBlock}\n\n${draftsBlock}\n\n## Behavior Contract\n\n1. **Profile first.** Before generating any content, confirm you understand the user's voice, audience, and goals. Reference the workspace memory for style rules and voice examples.\n2. **Harvest-aware.** When the user has recent harvest cards, prioritize those as content springboards. Ask which cards to develop.\n3. **Drafts are working documents.** Load existing drafts before making changes. Never overwrite without showing the diff.\n4. **Proactive, not presumptuous.** Suggest directions but wait for confirmation before generating. Use sampling for tone checks.\n5. **Artifact discipline.** Use the Quillby Briefing, Story, and Voice System artifacts for long-form work. Keep artifacts updated; don't let them drift.\n6. **Memory accumulates.** After a session, suggest key takeaways for workspace memory (voice examples, style rules, audience insights, do-not-say items).`
      );
    }

    case "briefing": {
      return msg(
        `# Quillby Briefing\n\nOpen this as an Artifact and keep it updated during the session.\n\n## Summary\n\n**Date:** {auto}\n**Period:** Daily / Weekly\n**Topics:** {topics}\n\n## Harvest Highlights\n\n{Top cards from latest harvest, with thesis and source.}\n\n## Trend Signals\n\n{Notable patterns across articles — recurring themes, emerging angles, shifts in discourse.}\n\n## Content Opportunities\n\n{Recommended angles or posts based on harvest + memory. Prioritize by impact.}\n\n## Queue\n\n{Planned posts for this period. Mark [x] when published.}`
      );
    }

    case "story": {
      return msg(
        `# Quillby Story\n\nOpen this as an Artifact. Each story gets its own Artifact.\n\n## Headline\n\n{Hook + working title}\n\n## One-Liner\n\n{Single sentence: what is this about and why now?}\n\n## Structure\n\n- **Hook:** {Opener that stops the scroll}\n- **Context:** {Why this matters, what changed}\n- **Body:** {Core argument, insights, narrative flow. Use evidence from harvest.}\n- **Takeaway:** {What the reader should think or do next}\n\n## Platform Adaptations\n\n- **LinkedIn:** {Teaser, 1300 char max.}\n- **X/Twitter:** {Thread structure.}\n- **Newsletter:** {Longer form with sign-off.}\n\n## Status\n\n- [ ] Drafting\n- [ ] Reviewing\n- [ ] Scheduled\n- [ ] Published`
      );
    }

    case "voice_system": {
      return msg(
        `# Quillby Voice System\n\nOpen this as an Artifact. This is the canonical voice reference for this workspace. Update it whenever the user refines their voice.\n\n## Voice Profile\n\n{2–3 sentence summary of the user's writing voice}\n\n## Style Rules\n\n{Pair each rule with a before/after example.}\n\n## Vocabulary\n\n- **Prefer:** {words, phrases, metaphors}\n- **Avoid:** {overused terms, jargon}\n\n## Do Not Say\n\n{Topics, framings, or phrases to never use}\n\n## Audience Insights\n\n{What resonates, what falls flat, recurring feedback}\n\n## Voice Examples\n\n{Exemplar posts or passages that capture the voice. Label by platform.}`
      );
    }

    case "projects_playbook": {
      return msg(
        `# Quillby x Claude Projects Playbook\n\n## Three Layers\n\n1. **Quillby Workspace** — The data layer. Stores your profile, memory, feeds, harvest, drafts, and generated assets. One workspace per brand, project, or client.\n2. **Claude Project** — The context layer. A Claude Project wraps a Quillby workspace with shared instructions, knowledge files, and model configuration. Use the Project Instructions to link to the relevant Quillby resources (profile, memory, briefing) and set the behavior contract.\n3. **Artifacts** — The working layer. Briefings, stories, voice systems, and campaign documents live as Artifacts. Keep them updated; they are the source of truth for the current session.\n\n## Recommended Setup\n\n1. Create a Quillby workspace: \`workspace create name:"My Project"\`\n2. Onboard: \`prompt onboarding\`\n3. Add feeds: \`feeds add urls:["..."]\` or \`feeds discover\`\n4. Create a Claude Project for this workspace. In Project Instructions, reference the quillby:// context resources and attach the briefing Artifact.\n5. Run harvests, generate content, and update Artifacts within the Project.\n\n## Artifact Hygiene\n\n- Each briefing session gets a fresh Artifact.\n- Stories are per-piece Artifacts; close them when published.\n- The Voice System is a living Artifact — update it when the user refines their voice.\n- Archive completed Artifacts to keep the Project uncluttered.`
      );
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}
