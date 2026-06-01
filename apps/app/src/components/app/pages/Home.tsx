import { Navigate, Link } from "react-router-dom";
import { Skeleton } from "@heroui/react";
import { useSession } from "../auth";
import { getConnection } from "../api";

const DEPLOY_MODE = (import.meta.env.VITE_QUILLBY_DEPLOYMENT_MODE ?? "").trim().toLowerCase();

export function Home() {
  const conn = getConnection();
  if (conn) return <Navigate to="/dashboard" replace />;
  if (DEPLOY_MODE === "self-hosted") return <Navigate to="/connect/self-hosted" replace />;
  if (DEPLOY_MODE === "cloud") return <CloudHome />;
  return <DevPicker />;
}

function CloudHome() {
  const session = useSession();
  if (session.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Skeleton className="h-8 w-48 rounded-lg" />
      </div>
    );
  }
  if (session.data) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/cloud" replace />;
}

function DevPicker() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-accent/8 via-transparent to-accent/4 blur-3xl" />

      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-10">
          <img src="/quillby-logo.png" alt="Quillby" className="w-9 h-9 object-contain" />
          <span className="text-xl font-bold tracking-tight text-foreground">
            Quillby
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5 tracking-tight text-foreground">
          How are you running it?
        </h1>

        <p className="text-lg leading-relaxed mb-1 text-muted">
          <Link to="/cloud" className="text-accent font-semibold underline underline-offset-2 decoration-accent/45">
            Quillby Cloud
          </Link>
          {" "}&mdash; sign in with your email.
        </p>
        <p className="text-lg leading-relaxed text-muted">
          <Link to="/connect/self-hosted" className="text-accent font-semibold underline underline-offset-2 decoration-accent/45">
            Self-hosted
          </Link>
          {" "}&mdash; connect with your server URL.
        </p>
      </div>
    </div>
  );
}
