import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ProviderRouter } from "@quillby/providers";

export interface ToolStorage {
  getCurrentWorkspaceId(): Promise<string>;
  listWorkspaces(): Promise<{ id: string; name: string; current?: boolean }[]>;
  createWorkspace(opts: { id?: string; name: string; description?: string; makeCurrent?: boolean }): Promise<{ id: string; name: string }>;
  setCurrentWorkspace(id: string): Promise<{ id: string; name: string }>;
  getCurrentWorkspace(): Promise<Record<string, unknown>>;
  withWorkspace(id: string): Promise<ToolStorage>;
  loadContext(): Promise<Record<string, unknown> | null>;
  saveContext(ctx: Record<string, unknown>): Promise<void>;
  loadTypedMemory(): Promise<Record<string, unknown> | null>;
  loadSources(): Promise<unknown[]>;
  updateWorkspaceMetadata(meta: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ToolContext {
  server: McpServer;
  storage: ToolStorage;
  deploymentMode: string;
  providerRouter: ProviderRouter;
}

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export interface ToolModule {
  toolDefinitions: Partial<Tool>[];
  handleTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
