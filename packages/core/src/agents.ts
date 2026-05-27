import { z } from "zod";

export const AgentRoleSchema = z.enum(["researcher", "writer", "strategist", "analyst"]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentToolAccessSchema = z.object({
  readTools: z.array(z.string()).describe("Tool names this agent can read (list, view, get, load)"),
  writeTools: z.array(z.string()).describe("Tool names this agent can create, update, delete"),
  systemTools: z.array(z.string()).optional().describe("Tool names allowed only for system-level operations"),
});
export type AgentToolAccess = z.infer<typeof AgentToolAccessSchema>;

export const AgentCapabilitySchema = z.object({
  canSample: z.boolean().default(false).describe("Can call host LLM via MCP Sampling"),
  canElicit: z.boolean().default(false).describe("Can request user input via forms"),
  canReadResources: z.boolean().default(true).optional(),
  maxToolsPerCall: z.number().default(1).describe("Max tools a single agent_delegate can invoke").optional(),
});
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentDefinitionSchema = z.object({
  role: AgentRoleSchema,
  label: z.string(),
  description: z.string(),
  tools: AgentToolAccessSchema,
  capabilities: AgentCapabilitySchema,
  contextPrompt: z.string().describe("System prompt injected into Sampling calls"),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const HandoffStateSchema = z.object({
  fromAgent: AgentRoleSchema,
  toAgent: AgentRoleSchema,
  workspaceId: z.string(),
  contextSnapshot: z.record(z.string(), z.unknown()).describe("Arbitrary state transferred between agents"),
  handoffReason: z.string().describe("Why the handoff was requested"),
  timestamp: z.string(),
});
export type HandoffState = z.infer<typeof HandoffStateSchema>;

export const AgentContextSchema = z.object({
  agent: AgentRoleSchema,
  workspaceId: z.string(),
  userId: z.string().optional(),
  memory: z.record(z.string(), z.array(z.string())).optional(),
  handoffChain: z.array(HandoffStateSchema).optional().default([]),
});
export type AgentContext = z.infer<typeof AgentContextSchema>;

export const LockScopeSchema = z.enum(["workspace", "card", "draft", "memory", "plan"]);
export type LockScope = z.infer<typeof LockScopeSchema>;

export const ResourceLockSchema = z.object({
  scope: LockScopeSchema,
  resourceId: z.string(),
  agent: AgentRoleSchema,
  acquiredAt: z.string(),
  ttl: z.number().default(120_000).describe("Lock TTL in milliseconds"),
});
export type ResourceLock = z.infer<typeof ResourceLockSchema>;
