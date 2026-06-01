import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProviderRouter } from "@quillby/providers";
import type { DeploymentMode } from "@quillby/config";

export interface ToolContext {
  server: McpServer;
  storage: ToolStorage;
  deploymentMode: DeploymentMode;
  providerRouter: ProviderRouter;
  sample: (prompt: string, maxTokens?: number) => Promise<string | null>;
}

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
  loadSources(): Promise<string[]>;
  appendSources(urls: string[]): Promise<{ added: number; skipped: number }>;
  updateWorkspaceMetadata(meta: Record<string, unknown>): Promise<{ id: string; [key: string]: unknown }>;
  latestHarvestExists(): Promise<boolean>;
  loadLatestHarvest(): Promise<Record<string, unknown> | null>;
  saveHarvestOutput(cards: unknown[], seenUrls: Set<string>): Promise<string>;
  saveSeenUrls(urls: Set<string>): Promise<void>;
  getSeenUrls(): Promise<Set<string>>;
  saveDraft(content: string, platform: string, cardId?: number): Promise<string>;
  listDrafts(): Promise<unknown[]>;
  saveCurationState(state: Record<string, "shortlisted" | "skipped">): Promise<void>;
  appendTypedMemory(type: string, entries: string[], maxItems?: number): Promise<void>;
  getPlan(): Promise<string>;
}

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};
