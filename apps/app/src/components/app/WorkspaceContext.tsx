import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { listWorkspaces, selectWorkspace, type Workspace } from "./api";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWsId: string | undefined;
  switchWorkspace: (id: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaces: [],
  activeWsId: undefined,
  switchWorkspace: async () => {},
});

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const ws = await listWorkspaces();
      setWorkspaces(ws);
      const active = ws.find((w) => w.isActive);
      if (active) setActiveWsId(active.id);
    } catch {
      // unauthenticated or network error — silent
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function switchWorkspace(id: string) {
    await selectWorkspace(id);
    setWorkspaces((prev) => prev.map((w) => ({ ...w, isActive: w.id === id })));
    setActiveWsId(id);
  }

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWsId, switchWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
