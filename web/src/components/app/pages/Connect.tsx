import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveConnection, ping } from "../api";
import { Button, Spinner } from "../Layout";

export function Connect() {
  const navigate = useNavigate();
  const [serverUrl, setServerUrl] = useState("http://localhost:3000");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const url = serverUrl.replace(/\/$/, "");
      saveConnection({ serverUrl: url, apiKey });
      const version = await ping();
      setTested(true);
      // small delay so user sees confirmation
      setTimeout(() => navigate("/workspaces"), 600);
      void version;
    } catch (err) {
      setError((err as Error).message ?? "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "#0c0915" }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-10 text-center">
          <h1
            className="text-4xl font-bold mb-2"
            style={{ fontFamily: "var(--font-display, serif)", color: "#f0ecfa", letterSpacing: "-0.02em" }}
          >
            Quillby
          </h1>
          <p className="text-sm" style={{ color: "#9c8db5" }}>
            Connect to your Quillby server to manage cards and drafts.
          </p>
        </div>

        <form
          onSubmit={handleConnect}
          className="rounded-2xl p-8 flex flex-col gap-5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#9c8db5" }}>
              Server URL
            </label>
            <input
              required
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://..."
              className="rounded-lg px-4 py-2.5 text-sm outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#f0ecfa",
                fontFamily: "var(--font-mono, monospace)",
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#9c8db5" }}>
              API Key
            </label>
            <input
              required
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="qly_..."
              className="rounded-lg px-4 py-2.5 text-sm outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#f0ecfa",
                fontFamily: "var(--font-mono, monospace)",
              }}
            />
            <p className="text-xs" style={{ color: "rgba(156,141,181,0.6)" }}>
              Generate a key with{" "}
              <code style={{ fontFamily: "var(--font-mono, monospace)", color: "#c4b5fd" }}>
                npm run keys create &lt;userId&gt; &lt;label&gt;
              </code>
            </p>
          </div>

          {error && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}
            >
              {error}
            </div>
          )}

          {tested && !error && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", color: "#6ee7b7" }}
            >
              Connected — redirecting…
            </div>
          )}

          <Button type="submit" variant="primary" disabled={loading} className="w-full justify-center mt-1">
            {loading ? <Spinner /> : "Connect"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: "rgba(156,141,181,0.5)" }}>
          Your credentials are stored only in your browser's localStorage.
        </p>
      </div>
    </div>
  );
}
