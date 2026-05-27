import { Navigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useSession } from "../auth";
import { getConnection } from "../api";
import { Spinner } from "@heroui/react";

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
        <Spinner size="lg" />
      </div>
    );
  }
  if (session.data) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/cloud" replace />;
}

function DevPicker() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-accent/8 via-transparent to-accent/4 blur-3xl" />

      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-10">
          <img src="/quillby-logo.png" alt="Quillby" className="w-9 h-9 object-contain" />
          <span className="font-display text-[1.35rem] font-bold tracking-tight text-foreground">
            Quillby
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold leading-[1.08] mb-5 font-display tracking-tighter text-foreground">
          How are you running it?
        </h1>

        <p className="text-xl leading-relaxed mb-1 font-display text-muted">
          <Link
            to="/cloud"
            className="text-accent font-semibold underline underline-offset-3 decoration-accent/45"
          >
            Quillby Cloud
          </Link>
          {" "}— sign in with your email.
        </p>
        <p className="text-xl leading-relaxed font-display text-muted">
          <Link
            to="/connect/self-hosted"
            className="text-accent font-semibold underline underline-offset-3 decoration-accent/45"
          >
            Self-hosted
          </Link>
          {" "}— connect with your server URL.
        </p>
      </div>
    </div>
  );
}
