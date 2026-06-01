import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveConnection, ping, exchangeApiKey } from "../api";
import { Card, Button, Alert, Form, Input, Label, TextField, Description } from "@heroui/react";

const DEPLOY_MODE = (import.meta.env.VITE_QUILLBY_DEPLOYMENT_MODE ?? "").trim().toLowerCase();

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
      const url = serverUrl.trim().replace(/\/$/, "");
      setServerUrl(url);
      const version = await ping(url);
      await exchangeApiKey(url, apiKey);
      saveConnection({ serverUrl: url });
      setTested(true);
      void version;
      setTimeout(() => navigate("/dashboard"), 600);
    } catch (err) {
      setError((err as Error).message ?? "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-accent/[0.14] to-transparent bg-background">
      <div className="w-full max-w-md flex flex-col gap-8">
        {/* Brand heading */}
        <div className="flex flex-col items-center text-center gap-4">
            <img
              src="/quillby-logo.png"
              alt=""
              className="w-14 h-14 rounded-full object-cover"
              style={{ boxShadow: "0 0 24px color-mix(in oklch, var(--accent) 45%, transparent), 0 0 60px color-mix(in oklch, var(--accent) 12%, transparent)" }}
            />
          <div>
            <h1 className="text-4xl font-bold text-foreground font-display tracking-tight leading-[1.1]">
              Connect your{" "}
              <em className="italic font-light text-accent">
                server.
              </em>
            </h1>
          </div>
          <p className="text-sm leading-relaxed text-muted max-w-xs">
            Connect to a self-hosted Quillby server to manage cards and drafts.
          </p>
        </div>

        <Card className="flex flex-col gap-5">
          <Form
            onSubmit={(e) => void handleConnect(e)}
            className="flex flex-col gap-5"
          >
            <TextField
              isRequired
              name="serverUrl"
              type="url"
              value={serverUrl}
              onChange={setServerUrl}
              className="w-full"
            >
              <Label>Server URL</Label>
              <Input placeholder="https://..." className="font-mono" />
            </TextField>

            <TextField
              isRequired
              type="password"
              name="apiKey"
              value={apiKey}
              onChange={setApiKey}
              className="w-full"
            >
              <Label>Self-hosted API Key</Label>
              <Input placeholder="qly_..." className="font-mono" />
              <Description className="text-xs text-muted">
                Generate a key with{" "}
                <code className="font-mono text-accent">
                  npm run keys create &lt;userId&gt; &lt;label&gt;
                </code>
              </Description>
            </TextField>

            {error && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {tested && !error && (
              <Alert status="success">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>Connected — redirecting…</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            <Button
              type="submit"
              variant="primary"
              isDisabled={loading}
              className="w-full justify-center"
            >
              {loading ? "Connecting\u2026" : "Connect"}
            </Button>
          </Form>
        </Card>

        <div className="flex flex-col items-center gap-2 pt-1">
          <p className="text-xs text-muted">
            Connection details are stored in this browser only.
          </p>
          {DEPLOY_MODE !== "self-hosted" && (
            <Button
              variant="ghost"
              onPress={() => navigate("/cloud")}
              className="text-sm"
            >
              Looking for Quillby Cloud?
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
