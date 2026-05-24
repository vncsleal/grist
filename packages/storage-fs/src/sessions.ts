import * as fs from "fs";
import * as path from "path";
import {
  SessionSchema,
  type Session,
} from "@quillby/content";
import { getCurrentWorkspaceId, getWorkspacePaths } from "@quillby/workspace";

function sessionsDir(workspaceId?: string): string {
  const wsId = workspaceId ?? getCurrentWorkspaceId();
  return getWorkspacePaths(wsId).sessionsDir;
}

function sessionFilePath(sessionId: string, workspaceId?: string): string {
  return path.join(sessionsDir(workspaceId), `${sessionId}.json`);
}

function readSessions(workspaceId?: string): Session[] {
  const dir = sessionsDir(workspaceId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return SessionSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
      } catch {
        // Corrupted session file — skip it
        return null;
      }
    })
    .filter((s): s is Session => s !== null);
}

export function createSession(session: Session, workspaceId?: string): void {
  const file = sessionFilePath(session.id, workspaceId);
  fs.writeFileSync(file, JSON.stringify(SessionSchema.parse(session), null, 2));
}

export function loadSession(sessionId: string, workspaceId?: string): Session | null {
  const file = sessionFilePath(sessionId, workspaceId);
  if (!fs.existsSync(file)) return null;
  try {
    return SessionSchema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    // Corrupted session file — return null
    return null;
  }
}

export function listSessions(workspaceId?: string): Session[] {
  return readSessions(workspaceId);
}

export function updateSession(sessionId: string, patch: Partial<Session>, workspaceId?: string): void {
  const existing = loadSession(sessionId, workspaceId);
  if (!existing) throw new Error(`Session "${sessionId}" not found.`);
  const updated = SessionSchema.parse({
    ...existing,
    ...patch,
    lastActivityAt: new Date().toISOString(),
  });
  createSession(updated, workspaceId);
}

export function closeSession(sessionId: string, workspaceId?: string): void {
  const existing = loadSession(sessionId, workspaceId);
  if (!existing) throw new Error(`Session "${sessionId}" not found.`);
  const now = new Date().toISOString();
  const closed = SessionSchema.parse({
    ...existing,
    state: "closing",
    closedAt: now,
    lastActivityAt: now,
  });
  createSession(closed, workspaceId);
}

export function findStaleSessions(olderThanMs: number, workspaceId?: string): Session[] {
  const cutoff = Date.now() - olderThanMs;
  return readSessions(workspaceId).filter((s) => {
    if (s.state === "closing" && s.closedAt) return false;
    const lastActivity = new Date(s.lastActivityAt).getTime();
    return lastActivity < cutoff;
  });
}
