import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@heroui/react/button";
import { Alert } from "@heroui/react/alert";
import { verifyEmail } from "../auth";

type VerifyState = "loading" | "verified" | "error" | "no-token";

export function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<VerifyState>(token ? "loading" : "no-token");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    verifyEmail(token)
      .then(() => setState("verified"))
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : "Verification failed");
        setState("error");
      });
  }, [token]);

  if (state === "no-token") {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-bold">Invalid verification link</h1>
          <p className="text-muted">This verification link is missing a token.</p>
          <Link to="/cloud" className="text-sm text-accent hover:underline">Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="flex flex-col items-center gap-4 max-w-md w-full text-center">
        {state === "loading" && (
          <>
            <h1 className="text-2xl font-bold">Verifying your email...</h1>
            <p className="text-muted">Please wait while we verify your email address.</p>
          </>
        )}

        {state === "verified" && (
          <>
            <Alert status="success" className="w-full">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>Your email has been verified successfully.</Alert.Description>
              </Alert.Content>
            </Alert>
            <Button variant="primary" onPress={() => navigate("/cloud")}>Sign in</Button>
          </>
        )}

        {state === "error" && (
          <>
            <Alert status="danger" className="w-full">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{message}</Alert.Description>
              </Alert.Content>
            </Alert>
            <Link to="/cloud" className="text-sm text-accent hover:underline">Sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}
