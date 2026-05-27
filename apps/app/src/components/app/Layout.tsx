import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Button,
  Spinner,
  Alert,
  Dropdown,
  Avatar,
  Tabs,
} from "@heroui/react";
import { signOut, useSession } from "./auth";
import { clearConnection, getConnection } from "./api";
import { useWorkspace } from "./WorkspaceContext";

const DEPLOY_MODE = (import.meta.env.VITE_QUILLBY_DEPLOYMENT_MODE ?? "").trim().toLowerCase();

interface LayoutProps {
  children: React.ReactNode;
  activeWorkspace?: string;
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const conn = getConnection();

  function disconnectSelfHosted() {
    clearConnection();
    navigate("/");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 h-16 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="flex items-center gap-8">
          <a href="/" className="flex items-center gap-2.5 no-underline">
            <img
              src="/quillby-logo.png"
              alt="Quillby"
              className="w-[30px] h-[30px] object-contain"
            />
            <span className="text-[1.2rem] font-bold tracking-tight text-foreground font-display">
              Quillby
            </span>
          </a>
          <Tabs
            variant="secondary"
            selectedKey={location.pathname}
            onSelectionChange={(key) => navigate(String(key))}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="App navigation">
                <Tabs.Tab id="/dashboard">Home<Tabs.Indicator /></Tabs.Tab>
                <Tabs.Tab id="/cards">Cards<Tabs.Indicator /></Tabs.Tab>
                <Tabs.Tab id="/drafts">Drafts<Tabs.Indicator /></Tabs.Tab>
                <Tabs.Tab id="/jobs">Jobs<Tabs.Indicator /></Tabs.Tab>
                <Tabs.Tab id="/assets">Assets<Tabs.Indicator /></Tabs.Tab>
                <Tabs.Tab id="/feeds">Feeds<Tabs.Indicator /></Tabs.Tab>
                <Tabs.Tab id="/memory">Memory<Tabs.Indicator /></Tabs.Tab>
                <Tabs.Tab id="/profile">Profile<Tabs.Indicator /></Tabs.Tab>
                <Tabs.Tab id="/settings">Settings<Tabs.Indicator /></Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>

        <div className="flex items-center gap-3">
          <WorkspaceSwitcher />
          {conn ? (
            <>
              <span className="text-xs font-mono hidden sm:block text-muted">
                {conn.serverUrl.replace(/^https?:\/\//, "")}
              </span>
              <Button variant="ghost" size="sm" onPress={disconnectSelfHosted}>
                Disconnect
              </Button>
            </>
          ) : DEPLOY_MODE !== "self-hosted" ? (
            <CloudUserPill />
          ) : null}
        </div>
      </nav>

      <main className="flex-1 px-6 py-10 w-full">
        {children}
      </main>
    </div>
  );
}

// ─── Workspace switcher ──────────────────────────────────────────────────────

function WorkspaceSwitcher() {
  const { workspaces, activeWsId, switchWorkspace } = useWorkspace();
  const [selecting, setSelecting] = React.useState(false);

  const active = workspaces.find((w) => w.id === activeWsId);
  if (!workspaces.length) return null;

  async function handleSelect(key: string) {
    if (key === activeWsId) return;
    setSelecting(true);
    try {
      await switchWorkspace(key);
    } catch (err) {
      console.error("Workspace switch failed:", err);
    } finally {
      setSelecting(false);
    }
  }

  return (
    <Dropdown>
      <Dropdown.Trigger className="flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1 text-xs font-mono border border-border bg-surface text-foreground cursor-default outline-none focus-visible:ring-2 ring-accent hover:bg-surface-secondary transition-colors">
        <span className="max-w-32 truncate">{active?.name ?? "Workspace"}</span>
        {selecting ? (
          <Spinner className="w-3 h-3" />
        ) : (
          <svg className="w-3 h-3 shrink-0 opacity-50" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu onAction={(key) => void handleSelect(String(key))}>
          {workspaces.map((ws) => (
            <Dropdown.Item
              key={ws.id}
              id={ws.id}
              className={ws.isActive ? "text-accent font-medium" : ""}
            >
              {ws.name}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

// ─── Cloud user pill ──────────────────────────────────────────────────────────

function CloudUserPill() {
  const navigate = useNavigate();
  const session = useSession();

  if (!session.data) return null;

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  const user = session.data.user;
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();
  const displayName = user.name ?? user.email;

  return (
    <Dropdown>
      <Dropdown.Trigger className="flex items-center gap-2 rounded-full pl-2 pr-3 py-1 text-sm font-medium border border-border bg-surface text-foreground cursor-default outline-none focus-visible:ring-2 ring-accent hover:bg-surface-secondary">
        <Avatar size="sm" className="w-5 h-5 shrink-0">
          <Avatar.Fallback className="text-xs font-bold">
            {initials}
          </Avatar.Fallback>
        </Avatar>
        <span className="hidden sm:block max-w-[10rem] overflow-hidden text-ellipsis whitespace-nowrap">
          {displayName}
        </span>
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <div className="px-3 py-2 text-xs text-muted border-b border-border mb-1">
          {user.email}
        </div>
        <Dropdown.Menu
          onAction={(key) => {
            if (key === "settings") navigate("/settings");
            if (key === "signout") void handleSignOut();
          }}
        >
          <Dropdown.Item id="settings">Account settings</Dropdown.Item>
          <Dropdown.Item id="signout" className="text-danger">
            Sign out
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

// ─── Reusable primitives (re-exported for pages that still import from Layout) ─

export function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-3xl font-bold text-foreground font-display tracking-tight leading-[1.1]">
      {children}
    </h1>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[0.68rem] tracking-[0.14em] uppercase text-accent">
      <span className="inline-block w-4 h-px bg-accent/60 shrink-0" />
      {children}
    </div>
  );
}



export function ErrorBanner({ message }: { message: string }) {
  return (
    <Alert status="danger" className="mb-4">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <span className="text-3xl select-none opacity-40">✦</span>
      <p className="text-lg font-bold text-foreground font-display tracking-tight">
        {title}
      </p>
      {body && (
        <p className="text-sm leading-relaxed text-muted max-w-xs">{body}</p>
      )}
    </div>
  );
}
