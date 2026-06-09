import { z } from "zod";
import type { ToolContext, ToolResult } from "./index.js";
import { ONBOARDING_PROMPT } from "../../agents/onboard.js";
import { UserContextSchema } from "../../types.js";
import { PKG } from "../shared.js";

const ServerSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("info") }),
  z.object({ action: z.literal("onboard") }),
  z.object({ action: z.literal("get_plan") }),
  z.object({ action: z.literal("get_pricing") }),
  z.object({ action: z.literal("manage_billing"), billingAction: z.enum(["upgrade", "downgrade", "manage"]) }),
]);

export const tool = {
  name: "server" as const,
  description: "Server info, onboarding, billing — get server metadata, run 3-step onboarding, check plan/pricing, manage billing.",
  inputSchema: ServerSchema,
};

export async function handleTool(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = ServerSchema.parse(raw);

  switch (parsed.action) {
    case "info": {
      return {
        content: [{ type: "text", text: `Quillby MCP Server ${PKG.version} — mode: ${ctx.deploymentMode}, uptime: ${Math.floor(process.uptime())}s` }],
        structuredContent: {
          name: "quillby-mcp",
          version: PKG.version,
          deploymentMode: ctx.deploymentMode,
          uptime: Math.floor(process.uptime()),
          node: process.version,
          platform: process.platform,
        },
      };
    }

    case "onboard": {
      const srv = ctx.server.server as unknown as {
        getClientCapabilities(): { elicitation?: { form?: unknown } };
        elicitInput(params: Record<string, unknown>): Promise<{ action: string; content?: unknown }>;
      };
      const caps = srv.getClientCapabilities();
      if (!caps?.elicitation?.form) {
        return {
          content: [{ type: "text", text: ONBOARDING_PROMPT }],
          structuredContent: { elicitationAvailable: false, message: ONBOARDING_PROMPT },
        };
      }

      const s1 = await srv.elicitInput({
        message: "Let's set up your Quillby profile. Step 1 of 3: who are you?",
        requestedSchema: {
          type: "object",
          properties: {
            name: { type: "string" as const, title: "Your name", description: "Optional — used to personalize prompts" },
            role: { type: "string" as const, title: "Your role", description: "e.g. founder, marketer, software engineer, researcher" },
            industry: { type: "string" as const, title: "Industry or niche", description: "e.g. SaaS, healthcare, fintech, creator economy" },
          },
          required: ["role", "industry"],
        },
      });
      if (s1.action !== "accept" || !s1.content) {
        return { content: [{ type: "text", text: "Onboarding cancelled." }], structuredContent: { cancelled: true, message: "Onboarding cancelled." } };
      }

      const s2 = await srv.elicitInput({
        message: "Step 2 of 3: what do you write about, and who reads it?",
        requestedSchema: {
          type: "object",
          properties: {
            topics: { type: "string" as const, title: "Topics to cover", description: "Comma-separated: e.g. AI, developer tools, startup fundraising" },
            audienceDescription: { type: "string" as const, title: "Your audience", description: "e.g. senior engineers at B2B SaaS companies" },
            contentGoals: { type: "string" as const, title: "Content goals", description: "Comma-separated: e.g. build authority, grow newsletter, drive inbound leads" },
          },
          required: ["topics", "audienceDescription", "contentGoals"],
        },
      });
      if (s2.action !== "accept" || !s2.content) {
        return { content: [{ type: "text", text: "Onboarding cancelled." }], structuredContent: { cancelled: true, message: "Onboarding cancelled." } };
      }

      const s3 = await srv.elicitInput({
        message: "Step 3 of 3: how do you write, and where do you publish?",
        requestedSchema: {
          type: "object",
          properties: {
            voice: { type: "string" as const, title: "Writing voice", description: "e.g. direct and analytical, no corporate speak, sardonic, data-heavy" },
            platforms: {
              type: "array" as const,
              title: "Publishing platforms",
              description: "Select all platforms you use",
              items: { type: "string" as const, enum: ["linkedin", "x", "blog", "newsletter", "medium", "instagram", "threads"] },
            },
            excludeTopics: { type: "string" as const, title: "Topics to avoid (optional)", description: "Comma-separated topics Quillby should filter out" },
          },
          required: ["voice", "platforms"],
        },
      });
      if (s3.action !== "accept" || !s3.content) {
        return { content: [{ type: "text", text: "Onboarding cancelled." }], structuredContent: { cancelled: true, message: "Onboarding cancelled." } };
      }

      const splitCSV = (v: unknown): string[] =>
        typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const toStrArr = (v: unknown): string[] =>
        Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : splitCSV(v);

      const onboardCtx = UserContextSchema.parse({
        name: s1.content.name || undefined,
        role: s1.content.role,
        industry: s1.content.industry,
        topics: splitCSV(s2.content.topics),
        audienceDescription: s2.content.audienceDescription,
        contentGoals: splitCSV(s2.content.contentGoals),
        voice: s3.content.voice,
        platforms: toStrArr(s3.content.platforms),
        excludeTopics: s3.content.excludeTopics ? splitCSV(s3.content.excludeTopics) : [],
      });
      await ctx.storage.saveContext(onboardCtx);

      const onboardWs = await ctx.storage.getCurrentWorkspace();
      const summary = `Workspace: ${onboardWs.name}\n\nRole: ${onboardCtx.role} in ${onboardCtx.industry}\nTopics: ${onboardCtx.topics.join(", ")}\nPlatforms: ${onboardCtx.platforms.join(", ")}\nVoice: ${onboardCtx.voice}\n\nNext: call discover_feeds to set up your RSS sources.`;
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { saved: true, profile: onboardCtx },
      };
    }

    case "get_plan": {
      const billing = await import("../../billing.js");
      if (!billing.isCloudMode()) {
        return { content: [{ type: "text", text: "Plan management is only available in cloud mode." }], structuredContent: { error: "not_cloud_mode" } };
      }
      const plan = await ctx.storage.getPlan();
      const limits = billing.getPlanLimits(plan);
      return {
        content: [{ type: "text", text: `Plan: ${plan}. Limits: ${limits ? Object.entries(limits).map(([k, v]) => `${k}: ${v}`).join(", ") : "N/A"}. Enforcement: ${billing.isPlanEnforcementEnabled() ? "enabled" : "disabled"}.` }],
        structuredContent: { plan, limits, enforcementEnabled: billing.isPlanEnforcementEnabled() },
      };
    }

    case "get_pricing": {
      const billing = await import("../../billing.js");
      if (!billing.isCloudMode()) {
        return { content: [{ type: "text", text: "Pricing is only available in cloud mode." }], structuredContent: { error: "not_cloud_mode" } };
      }
      const plans = [
        { name: "free", price: "$0/mo", description: "Get started with basic content tools", limits: billing.getPlanLimits("free") },
        { name: "pro", price: "$29/mo", description: "Unlimited workspaces, drafts, and AI generation credits", limits: billing.getPlanLimits("pro") },
      ];
      return {
        content: [{ type: "text", text: `Available plans:\n${plans.map(p => `  ${p.name}: ${p.price} — ${p.description}`).join("\n")}` }],
        structuredContent: { plans },
      };
    }

    case "manage_billing": {
      const billing = await import("../../billing.js");
      if (!billing.isCloudMode()) {
        return { content: [{ type: "text", text: "Billing is only available in cloud mode." }], structuredContent: { error: "not_cloud_mode" } };
      }
      const currentPlan = await ctx.storage.getPlan();
      const url = billing.getBillingActionUrl(parsed.billingAction, currentPlan);
      if (!url) {
        return {
          content: [{ type: "text", text: `Billing action "${parsed.billingAction}" is not configured. Ensure Stripe environment variables are set.` }],
          structuredContent: { error: "not_configured", action: parsed.billingAction },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `Billing action "${parsed.billingAction}" for plan "${currentPlan}". URL: ${url}.` }],
        structuredContent: { action: parsed.billingAction, url, plan: currentPlan },
      };
    }
  }
}
