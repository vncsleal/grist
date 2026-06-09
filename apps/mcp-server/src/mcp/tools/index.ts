import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProviderRouter } from "@quillby/providers";
import type { DeploymentMode } from "@quillby/config";
import type { SampleResult } from "../server.js";
import type { WorkspaceStorage, JobStorage, PlanStorage, SessionStore, CampaignStore } from "@quillby/workspace";

export type { SampleResult };

export type FullStorage = WorkspaceStorage & JobStorage & PlanStorage & SessionStore & CampaignStore;

export function resolveWorkspaceStorage(storage: FullStorage, args: { workspaceId?: string }): Promise<FullStorage> {
  return args.workspaceId ? storage.withWorkspace(args.workspaceId) : Promise.resolve(storage);
}

export interface ToolContext {
  server: McpServer;
  storage: FullStorage;
  deploymentMode: DeploymentMode;
  providerRouter: ProviderRouter;
  sample: (prompt: string, maxTokens?: number) => Promise<SampleResult>;
}

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};
