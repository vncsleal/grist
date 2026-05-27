import React, { Component, lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Button, Alert } from "@heroui/react";
import { useSession } from "./auth";
import { getConnection } from "./api";
import { WorkspaceProvider } from "./WorkspaceContext";
import { PageSkeleton } from "./primitives";

function lazyNamed<T extends string>(
  importFn: () => Promise<Record<T, React.ComponentType>>,
  name: T,
) {
  return lazy(() => importFn().then((m) => {
    const comp = m[name];
    if (!comp) throw new Error(`Page component "${name}" not found in lazy import`);
    return { default: comp };
  }));
}

const Home = lazyNamed(() => import("./pages/Home"), "Home");
const Cloud = lazyNamed(() => import("./pages/Cloud"), "Cloud");
const Dashboard = lazyNamed(() => import("./pages/Dashboard"), "Dashboard");
const Connect = lazyNamed(() => import("./pages/Connect"), "Connect");
const Cards = lazyNamed(() => import("./pages/Cards"), "Cards");
const Drafts = lazyNamed(() => import("./pages/Drafts"), "Drafts");
const Jobs = lazyNamed(() => import("./pages/Jobs"), "Jobs");
const Assets = lazyNamed(() => import("./pages/Assets"), "Assets");
const Settings = lazyNamed(() => import("./pages/Settings"), "Settings");
const Profile = lazyNamed(() => import("./pages/Profile"), "Profile");
const Memory = lazyNamed(() => import("./pages/Memory"), "Memory");
const Feeds = lazyNamed(() => import("./pages/Feeds"), "Feeds");

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  handleRetry = () => {
    this.setState({ error: null });
  };
  render() {
    if (this.state.error) {
      const isChunkError = this.state.error.message?.includes("dynamically imported");
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-(--background)">
          <div className="flex flex-col items-center gap-4 max-w-lg w-full">
            <Alert status="danger" className="w-full">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {isChunkError ? "Failed to load page" : "App Error"}
                </Alert.Title>
                <Alert.Description>
                  {isChunkError
                    ? "A network error occurred while loading this page."
                    : this.state.error.message}
                </Alert.Description>
              </Alert.Content>
            </Alert>
            <Button variant="ghost" onPress={this.handleRetry}>
              Try Again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const DEPLOY_MODE = (import.meta.env.VITE_QUILLBY_DEPLOYMENT_MODE ?? "").trim().toLowerCase();

function CloudRequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const session = useSession();

  if (session.isPending) return <PageSkeleton />;
  if (!session.data) return <Navigate to="/" state={{ from: location }} replace />;
  return <>{children}</>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const conn = getConnection();

  if (conn) {
    return <>{children}</>;
  }

  if (DEPLOY_MODE === "self-hosted") {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <CloudRequireAuth>{children}</CloudRequireAuth>;
}

function LazyPage({ component: Component }: { component: React.LazyExoticComponent<React.ComponentType> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Component />
    </Suspense>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <WorkspaceProvider>
        <Routes>
          <Route path="/" element={<LazyPage component={Home} />} />
          {DEPLOY_MODE !== "self-hosted" && <Route path="/cloud" element={<LazyPage component={Cloud} />} />}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <LazyPage component={Dashboard} />
              </RequireAuth>
            }
          />
          {DEPLOY_MODE !== "cloud" && <Route path="/connect" element={<Navigate to="/connect/self-hosted" replace />} />}
          {DEPLOY_MODE !== "cloud" && <Route path="/connect/self-hosted" element={<LazyPage component={Connect} />} />}
          <Route
            path="/cards"
            element={
              <RequireAuth>
                <LazyPage component={Cards} />
              </RequireAuth>
            }
          />
          <Route
            path="/drafts"
            element={
              <RequireAuth>
                <LazyPage component={Drafts} />
              </RequireAuth>
            }
          />
          <Route
            path="/jobs"
            element={
              <RequireAuth>
                <LazyPage component={Jobs} />
              </RequireAuth>
            }
          />
          <Route
            path="/assets"
            element={
              <RequireAuth>
                <LazyPage component={Assets} />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <LazyPage component={Profile} />
              </RequireAuth>
            }
          />
          <Route
            path="/memory"
            element={
              <RequireAuth>
                <LazyPage component={Memory} />
              </RequireAuth>
            }
          />
          <Route
            path="/feeds"
            element={
              <RequireAuth>
                <LazyPage component={Feeds} />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <LazyPage component={Settings} />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </WorkspaceProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
