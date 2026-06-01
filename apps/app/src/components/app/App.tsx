import React, { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
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
const Connectors = lazyNamed(() => import("./pages/Connectors"), "Connectors");
const ForgotPassword = lazyNamed(() => import("./pages/ForgotPassword"), "ForgotPassword");
const ResetPassword = lazyNamed(() => import("./pages/ResetPassword"), "ResetPassword");
const VerifyEmail = lazyNamed(() => import("./pages/VerifyEmail"), "VerifyEmail");

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
    <ErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

export function App() {
  return (
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
        <Route
          path="/connectors"
          element={
            <RequireAuth>
              <LazyPage component={Connectors} />
            </RequireAuth>
          }
        />
        {DEPLOY_MODE !== "self-hosted" && <Route path="/forgot-password" element={<LazyPage component={ForgotPassword} />} />}
        {DEPLOY_MODE !== "self-hosted" && <Route path="/reset-password" element={<LazyPage component={ResetPassword} />} />}
        {DEPLOY_MODE !== "self-hosted" && <Route path="/verify-email" element={<LazyPage component={VerifyEmail} />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </WorkspaceProvider>
    </HashRouter>
  );
}
