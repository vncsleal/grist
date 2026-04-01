// ─────────────────────────────────────────────────────────────────────────────
// Quillby MCP App — browser-side API client
//
// All calls go through the Streamable HTTP MCP transport (POST /mcp).
// Connection settings (serverUrl + apiKey) are persisted in localStorage.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "quillby_connection";

export interface Connection {
  serverUrl: string; // e.g. "https://quillby.cloud" or "http://localhost:3000"
  apiKey: string;
}

export function getConnection(): Connection | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Connection;
  } catch {
    return null;
  }
}

export function saveConnection(conn: Connection): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
}

export function clearConnection(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core MCP call — handles both application/json and text/event-stream responses
// ─────────────────────────────────────────────────────────────────────────────

let _idSeq = 0;

async function callTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const conn = getConnection();
  if (!conn) throw new Error("Not connected");

  const id = ++_idSeq;
  const res = await fetch(`${conn.serverUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${conn.apiKey}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!res.ok && res.status !== 200) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data = (await res.json()) as JsonRpcResponse;
    return extractToolResult(data);
  }

  // SSE stream — read all events, return first result
  const text = await res.text();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      const json = trimmed.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const data = JSON.parse(json) as JsonRpcResponse;
        if ("result" in data || "error" in data) {
          return extractToolResult(data);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  throw new Error("No result received from server");
}

interface JsonRpcResponse {
  result?: { content?: Array<{ type: string; text?: string }> };
  error?: { message: string; code?: number };
}

function extractToolResult(data: JsonRpcResponse): unknown {
  if (data.error) throw new Error(data.error.message ?? "Tool call failed");
  const text = data.result?.content?.find((c) => c.type === "text")?.text;
  if (text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  createdAt?: string;
  isActive?: boolean;
}

export interface Card {
  id: string;
  title: string;
  source?: string;
  url?: string;
  score?: number;
  summary?: string;
  curationStatus?: "pending" | "approved" | "rejected" | "flagged";
  createdAt?: string;
  workspaceId?: string;
}

export interface Draft {
  id: string;
  format?: string;
  title?: string;
  content?: string;
  createdAt?: string;
  workspaceId?: string;
}

export interface PlanInfo {
  plan: string;
  mode: string;
  planEnforcementEnabled: boolean;
  limits?: Record<string, unknown>;
  billingPortalUrl?: string;
}

export async function ping(): Promise<string> {
  const conn = getConnection();
  if (!conn) throw new Error("Not connected");
  const res = await fetch(`${conn.serverUrl}/health`, {
    headers: { Authorization: `Bearer ${conn.apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { status: string; version?: string };
  return data.version ?? data.status;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const result = (await callTool("quillby_list_workspaces")) as {
    workspaces?: Workspace[];
  };
  return result?.workspaces ?? [];
}

export async function selectWorkspace(workspaceId: string): Promise<void> {
  await callTool("quillby_select_workspace", { workspaceId });
}

export async function listCards(
  workspaceId?: string,
  status?: string
): Promise<Card[]> {
  const args: Record<string, unknown> = {};
  if (workspaceId) args.workspaceId = workspaceId;
  if (status && status !== "all") args.status = status;
  const result = (await callTool("quillby_list_cards", args)) as {
    cards?: Card[];
  };
  return result?.cards ?? [];
}

export async function curateCard(
  cardId: string,
  status: "approved" | "rejected" | "flagged",
  workspaceId?: string
): Promise<void> {
  const args: Record<string, unknown> = { cardId, status };
  if (workspaceId) args.workspaceId = workspaceId;
  await callTool("quillby_curate_card", args);
}

export async function listDrafts(workspaceId?: string): Promise<Draft[]> {
  const args: Record<string, unknown> = {};
  if (workspaceId) args.workspaceId = workspaceId;
  const result = (await callTool("quillby_list_drafts", args)) as {
    drafts?: Draft[];
  };
  return result?.drafts ?? [];
}

export async function getPlan(): Promise<PlanInfo> {
  const result = await callTool("quillby_get_plan");
  return result as PlanInfo;
}
