import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { signInEmail, signUpEmail, useSession } from "../auth";
import { Button } from "@heroui/react/button";
import { Alert } from "@heroui/react/alert";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Tabs } from "@heroui/react/tabs";
import { FormField } from "../FormField";
import { signInSchema, signUpSchema } from "../validation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

const DEPLOY_MODE = (import.meta.env.VITE_QUILLBY_DEPLOYMENT_MODE ?? "")
  .trim()
  .toLowerCase();

type AuthMode = "sign-in" | "sign-up";

type AuthForm = z.infer<typeof signUpSchema>;

export function Cloud() {
  const session = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [apiError, setApiError] = useState<string | null>(null);

  const resolver: Resolver<AuthForm> = mode === "sign-in"
    ? zodResolver(signInSchema) as unknown as Resolver<AuthForm>
    : zodResolver(signUpSchema);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<AuthForm>({
    resolver,
  });

  const isSignUp = mode === "sign-up";

  if (session.data) {
    const isNewAccount = (() => {
      try {
        const flag = sessionStorage.getItem("quillby_new_account");
        if (flag) sessionStorage.removeItem("quillby_new_account");
        return flag === "1";
      } catch { return false; }
    })();
    if (isNewAccount) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  function handleModeChange(key: React.Key) {
    const next = key as AuthMode;
    setMode(next);
    setApiError(null);
    reset();
  }

  async function onSubmit(data: AuthForm) {
    setApiError(null);
    try {
      if (isSignUp) {
        await signUpEmail(data.name, data.email, data.password);
        try {
          sessionStorage.setItem("quillby_new_account", "1");
        } catch {
          console.debug("sessionStorage not available");
        }
      } else {
        await signInEmail(data.email, data.password);
      }
      await session.refresh();
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Authentication failed",
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left panel — branding */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col p-14 overflow-hidden bg-gradient-to-br from-accent/30 via-accent/10 to-transparent bg-surface">
        <div className="border-r border-border absolute inset-y-0 right-0" />

        {/* Top wordmark */}
        <div>
          <span className=" text-xl font-bold tracking-tight text-foreground">
            Quillby
          </span>
        </div>

        {/* Centered logo */}
        <div className="flex flex-1 items-center justify-center">
          <img
            src="/quillby-logo.png"
            alt="Quillby"
            className="w-96 h-96 object-contain"
          />
        </div>

        {/* Headline */}
        <div className="flex flex-col gap-6 max-w-sm">
          <h2 className="text-5xl font-bold text-foreground leading-[1.08] tracking-tighter">
            Content that{" "}
            <em className="italic font-light text-accent">
              moves with you.
            </em>
          </h2>
          <p className="text-base leading-relaxed text-muted">
            Harvest fresh signals, shape compelling narratives, and publish
            across every channel — all from a single AI-native workspace.
          </p>

          {/* Feature list */}
          <ul className="flex flex-col gap-3 mt-2">
            {[
              "Connected to Claude, ChatGPT, and any MCP client",
              "Real-time content harvesting from RSS, Reddit, and more",
              "Card-based drafts that stay in sync with your workflow",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted">
                <span className="mt-1 w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[9px] bg-accent/20 text-accent">✦</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 lg:px-16">
        {/* Mobile logo */}
        <div className="flex items-center gap-3 mb-10 lg:hidden">
          <img
            src="/quillby-logo.png"
            alt="Quillby"
            className="w-72 h-72 object-contain"
          />
          <span className=" text-lg font-bold tracking-tight text-foreground">
            Quillby
          </span>
        </div>

        <div className="w-full max-w-sm flex flex-col gap-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight leading-[1.1]">
              {mode === "sign-in" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-sm text-muted">
              {mode === "sign-in"
                ? "Sign in to your Quillby account."
                : "Start your Quillby journey today."}
            </p>
          </div>

          {/* Mode toggle */}
          <Tabs
            selectedKey={mode}
            onSelectionChange={handleModeChange}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Authentication mode">
                <Tabs.Tab id="sign-in">
                  Sign in<Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="sign-up">
                  Create account<Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>

          {/* Auth form */}
          <Form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            {isSignUp && (
              <FormField label="Name" error={errors.name} isRequired>
                <Input
                  placeholder="Your name"
                  {...register("name")}
                />
              </FormField>
            )}

            <FormField label="Email" error={errors.email} isRequired>
              <Input
                type="email"
                placeholder="you@example.com"
                {...register("email")}
              />
            </FormField>

            <FormField label="Password" error={errors.password} isRequired>
              <Input
                type="password"
                placeholder="••••••••"
                {...register("password")}
              />
            </FormField>

            {mode === "sign-in" && (
              <Link
                to="/forgot-password"
                className="text-xs text-accent hover:underline self-end -mt-2"
              >
                Forgot password?
              </Link>
            )}

            {apiError && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{apiError}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            <Button
              type="submit"
              variant="primary"
              isDisabled={isSubmitting || session.isPending}
              className="w-full justify-center mt-1"
            >
              {isSubmitting
                ? "Loading\u2026"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </Form>

          {DEPLOY_MODE !== "cloud" && (
            <div className="flex justify-center pt-1">
              <Button
                variant="ghost"
                onPress={() => navigate("/connect/self-hosted")}
                className="text-sm"
              >
                Use a self-hosted server instead
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
