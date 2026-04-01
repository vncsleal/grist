import React, { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { getConnection } from "./api";
import { Connect } from "./pages/Connect";
import { Workspaces } from "./pages/Workspaces";
import { Cards } from "./pages/Cards";
import { Drafts } from "./pages/Drafts";

/** Redirect to /connect if there is no saved connection. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const conn = getConnection();
  if (!conn) {
    return <Navigate to="/connect" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export function App() {
  // Redirect away from /connect once connected
  useEffect(() => {
    // nothing — routing handles this reactively
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/connect" element={<Connect />} />
        <Route
          path="/workspaces"
          element={
            <RequireAuth>
              <Workspaces />
            </RequireAuth>
          }
        />
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
        {/* Default: go to workspaces if connected, else connect */}
        <Route path="*" element={<Navigate to="/workspaces" replace />} />
      </Routes>
    </HashRouter>
  );
}
