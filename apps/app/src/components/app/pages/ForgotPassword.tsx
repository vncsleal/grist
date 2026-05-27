import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Alert, Form, Input, Label, TextField } from "@heroui/react";
import { forgetPassword } from "../auth";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await forgetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <div className="flex flex-col items-center gap-4 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-muted">
            If an account exists for <strong>{email}</strong>, we've sent a password reset link.
          </p>
          <Button variant="ghost" onPress={() => setSent(false)}>
            Send again
          </Button>
          <Link to="/cloud" className="text-sm text-accent hover:underline">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="flex flex-col gap-6 max-w-sm w-full">
        <div>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-sm text-muted mt-1">Enter your email and we'll send you a reset link.</p>
        </div>

        <Form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <TextField isRequired type="email" value={email} onChange={setEmail} name="email" className="w-full">
            <Label>Email</Label>
            <Input placeholder="you@example.com" />
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
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </Form>

        <Link to="/cloud" className="text-sm text-accent hover:underline text-center">Back to sign in</Link>
      </div>
    </div>
  );
}
