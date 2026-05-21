import { Navigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useSession } from "../auth";
import { getConnection } from "../api";
import { Spinner } from "../Layout";

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
      <div className="min-h-screen flex items-center justify-center bg-(--background)">
        <Spinner size="lg" />
      </div>
    );
  }
  if (session.data) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/cloud" replace />;
}

function DevPicker() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--background)" }}>
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div style={{ position: "absolute", top: "-10%", right: "-5%", width: "55vw", height: "55vw", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklch, var(--accent) 10%, transparent) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: "10%", left: "-8%", width: "35vw", height: "35vw", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklch, var(--accent) 6%, transparent) 0%, transparent 70%)", filter: "blur(60px)" }} />
      </div>

      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-10">
          <img src="/quillby-logo.png" alt="Quillby" style={{ width: 36, height: 36, objectFit: "contain" }} />
          <span style={{ fontFamily: "var(--font-display, serif)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--foreground)" }}>
            Quillby
          </span>
        </div>

        <h1
          className="text-4xl sm:text-5xl font-bold leading-[1.08] mb-5"
          style={{ fontFamily: "var(--font-display, serif)", letterSpacing: "-0.035em", color: "var(--foreground)" }}
        >
          How are you running it?
        </h1>

        <p
          className="text-xl leading-relaxed mb-1"
          style={{ fontFamily: "var(--font-display, serif)", color: "var(--muted)" }}
        >
          <Link
            to="/cloud"
            className="no-underline"
            style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "underline", textDecorationColor: "color-mix(in oklch, var(--accent) 45%, transparent)", textUnderlineOffset: "3px" }}
          >
            Quillby Cloud
          </Link>
          {" "}— sign in with your email.
        </p>
        <p
          className="text-xl leading-relaxed"
          style={{ fontFamily: "var(--font-display, serif)", color: "var(--muted)" }}
        >
          <Link
            to="/connect/self-hosted"
            className="no-underline"
            style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "underline", textDecorationColor: "color-mix(in oklch, var(--accent) 45%, transparent)", textUnderlineOffset: "3px" }}
          >
            Self-hosted
          </Link>
          {" "}— connect with your server URL.
        </p>
      </div>
    </div>
  );
}
