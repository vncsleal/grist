import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProviderRouter } from "@quillby/providers";

export interface ToolStorage {
  getCurrentWorkspaceId(): Promise<string>;
  listWorkspaces(): Promise<{ id: string; name: string; current?: boolean }[]>;
  createWorkspace(opts: { id?: string; name: string; description?: string; makeCurrent?: boolean }): Promise<{ id: string; name: string }>;
  setCurrentWorkspace(id: string): Promise<{ id: string; name: string }>;
  getCurrentWorkspace(): Promise<{ id: string; name: string; [key: string]: unknown }>;
  withWorkspace(id: string): Promise<ToolStorage>;
  contextExists(): Promise<boolean>;
  loadContext(): Promise<Record<string, unknown> | null>;
  saveContext(ctx: Record<string, unknown>): Promise<void>;
  loadTypedMemory(): Promise<Record<string, unknown> | null>;
  loadSources(): Promise<unknown[]>;
  updateWorkspaceMetadata(meta: Record<string, unknown>): Promise<{ id: string; [key: string]: unknown }>;
}

import type { DeploymentMode } from "@quillby/config";

export interface ToolContext {
  server: McpServer;
  storage: ToolStorage;
  deploymentMode: DeploymentMode;
  providerRouter: ProviderRouter;
}

export type ToolResult = {
  content: { type: "text"; text: string; annotations?: Record<string, unknown>; _meta?: Record<string, unknown> }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};
