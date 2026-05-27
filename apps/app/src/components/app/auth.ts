import { useEffect, useState } from "react";

const DEFAULT_API_BASE_URL = import.meta.env.VITE_QUILLBY_API_BASE_URL ?? "http://localhost:3000";

export function getDefaultApiBaseUrl(): string {
  return DEFAULT_API_BASE_URL.replace(/\/$/, "");
}

export interface AppSession {
  session: {
    id: string;
    userId: string;
    expiresAt?: string;
  };
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
}

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getDefaultApiBaseUrl()}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      message = data.message ?? data.error ?? message;
    } catch {
      // Keep the default status-based error.
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export async function getSession(): Promise<AppSession | null> {
  return await authFetch<AppSession | null>("/api/auth/get-session");
}

export async function signInEmail(email: string, password: string): Promise<void> {
  await authFetch("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function signUpEmail(name: string, email: string, password: string): Promise<void> {
  await authFetch("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export async function signOut(): Promise<void> {
  await authFetch("/api/auth/sign-out", {
    method: "POST",
  });
}

export async function updateUser(name: string): Promise<void> {
  await authFetch("/api/auth/update-user", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string, revokeOtherSessions = false): Promise<void> {
  await authFetch("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions }),
  });
}

export async function deleteAccount(password?: string): Promise<void> {
  await authFetch("/api/auth/delete-user", {
    method: "POST",
    body: JSON.stringify(password ? { password } : {}),
  });
}

export interface ActiveSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  current?: boolean;
}

export async function listSessions(): Promise<ActiveSession[]> {
  const result = await authFetch<{ sessions: ActiveSession[] }>("/api/auth/list-sessions");
  return result.sessions ?? [];
}

export async function revokeSession(sessionId: string): Promise<void> {
  await authFetch("/api/auth/revoke-session", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function revokeOtherSessions(): Promise<void> {
  await authFetch("/api/auth/revoke-other-sessions", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function forgetPassword(email: string): Promise<void> {
  await authFetch("/api/auth/forget-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(newPassword: string, token: string): Promise<void> {
  await authFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ newPassword, token }),
  });
}

export async function verifyEmail(token: string): Promise<void> {
  await authFetch("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function useSession() {
  const [data, setData] = useState<AppSession | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  async function refresh() {
    setIsPending(true);
    try {
      const session = await getSession();
      setData(session);
      setError(null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err : new Error("Failed to load session"));
    } finally {
      setIsPending(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { data, isPending, error, refresh };
}
