import React, { Component } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Spinner, Alert } from "@heroui/react";
import { useSession } from "./auth";
import { getConnection } from "./api";
import { WorkspaceProvider } from "./WorkspaceContext";
import { Home } from "./pages/Home";
import { Cloud } from "./pages/Cloud";
import { Dashboard } from "./pages/Dashboard";
import { Connect } from "./pages/Connect";
import { Cards } from "./pages/Cards";
import { Drafts } from "./pages/Drafts";
import { Jobs } from "./pages/Jobs";
import { Assets } from "./pages/Assets";
import { Settings } from "./pages/Settings";
import { Profile } from "./pages/Profile";
import { Memory } from "./pages/Memory";
import { Feeds } from "./pages/Feeds";

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
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-(--background)">
          <Alert status="danger" className="max-w-lg w-full">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>App Error</Alert.Title>
              <Alert.Description>
                <pre className="text-xs whitespace-pre-wrap mt-1">{this.state.error.message}</pre>
              </Alert.Description>
            </Alert.Content>
          </Alert>
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

  if (session.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-(--background)">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!session.data) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }
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

export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <WorkspaceProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          {DEPLOY_MODE !== "self-hosted" && <Route path="/cloud" element={<Cloud />} />}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          {DEPLOY_MODE !== "cloud" && <Route path="/connect" element={<Navigate to="/connect/self-hosted" replace />} />}
          {DEPLOY_MODE !== "cloud" && <Route path="/connect/self-hosted" element={<Connect />} />}
          <Route
            path="/cards"
            element={
              <RequireAuth>
                <Cards />
              </RequireAuth>
            }
          />
          <Route
            path="/drafts"
            element={
              <RequireAuth>
                <Drafts />
              </RequireAuth>
            }
          />
          <Route
            path="/jobs"
            element={
              <RequireAuth>
                <Jobs />
              </RequireAuth>
            }
          />
          <Route
            path="/assets"
            element={
              <RequireAuth>
                <Assets />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/memory"
            element={
              <RequireAuth>
                <Memory />
              </RequireAuth>
            }
          />
          <Route
            path="/feeds"
            element={
              <RequireAuth>
                <Feeds />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
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
