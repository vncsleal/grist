import { useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Button, Alert, Form, Input, Label, TextField } from "@heroui/react";
import { resetPassword } from "../auth";

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-bold">Invalid reset link</h1>
          <p className="text-muted">This reset link is missing a token. Please request a new one.</p>
          <Link to="/forgot-password" className="text-sm text-accent hover:underline">Request new reset link</Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(password, token);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-bold">Password reset</h1>
          <p className="text-muted">Your password has been reset successfully.</p>
          <Button variant="primary" onPress={() => navigate("/cloud")}>Sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="flex flex-col gap-6 max-w-sm w-full">
        <div>
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-sm text-muted mt-1">Enter your new password below.</p>
        </div>

        <Form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <TextField isRequired type="password" value={password} onChange={setPassword} name="password" className="w-full">
            <Label>New password</Label>
            <Input placeholder="••••••••" />
          </TextField>

          <TextField isRequired type="password" value={confirm} onChange={setConfirm} name="confirmPassword" className="w-full">
            <Label>Confirm password</Label>
            <Input placeholder="••••••••" />
          </TextField>

          {error && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <Button type="submit" variant="primary" isDisabled={loading} className="w-full justify-center">
            {loading ? "Resetting..." : "Reset password"}
          </Button>
        </Form>
      </div>
    </div>
  );
}
