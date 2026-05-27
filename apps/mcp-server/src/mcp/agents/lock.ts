import type { AgentRole, LockScope } from "@quillby/core";

interface LockEntry {
  agent: AgentRole;
  acquiredAt: number;
  ttl: number;
}

const locks = new Map<string, LockEntry>();

function lockKey(scope: LockScope, resourceId: string): string {
  return `${scope}:${resourceId}`;
}

export function acquireLock(scope: LockScope, resourceId: string, agent: AgentRole, ttl = 120_000): boolean {
  releaseStaleLocks();
  const key = lockKey(scope, resourceId);
  const existing = locks.get(key);
  const now = Date.now();

  if (existing && now - existing.acquiredAt < existing.ttl) {
    return false;
  }

  locks.set(key, { agent, acquiredAt: now, ttl });
  return true;
}

export function releaseLock(scope: LockScope, resourceId: string, agent: AgentRole): void {
  const key = lockKey(scope, resourceId);
  const existing = locks.get(key);
  if (existing && existing.agent === agent) {
    locks.delete(key);
  }
}

export function getLock(scope: LockScope, resourceId: string): LockEntry | null {
  const key = lockKey(scope, resourceId);
  const entry = locks.get(key);
  if (!entry) return null;

  if (Date.now() - entry.acquiredAt >= entry.ttl) {
    locks.delete(key);
    return null;
  }

  return entry;
}

export function releaseStaleLocks(): number {
  const now = Date.now();
  let count = 0;
  for (const [key, entry] of locks) {
    if (now - entry.acquiredAt >= entry.ttl) {
      locks.delete(key);
      count++;
    }
  }
  return count;
}
