import { useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@heroui/react/button";
import { Alert } from "@heroui/react/alert";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { FormField } from "../FormField";
import { resetPasswordSchema } from "../validation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPassword } from "../auth";

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [apiError, setApiError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-bold">Invalid reset link</h1>
          <p className="text-muted">
            This reset link is missing a token. Please request a new one.
          </p>
          <Link
            to="/forgot-password"
            className="text-sm text-accent hover:underline"
          >
            Request new reset link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-bold">Password reset</h1>
          <p className="text-muted">
            Your password has been reset successfully.
          </p>
          <Button variant="primary" onPress={() => navigate("/cloud")}>
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  async function onSubmit(data: { password: string; confirmPassword: string }) {
    setApiError(null);
    try {
      await resetPassword(data.password, token);
      setDone(true);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to reset password",
      );
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="flex flex-col gap-6 max-w-sm w-full">
        <div>
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-sm text-muted mt-1">
            Enter your new password below.
          </p>
        </div>

        <Form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <FormField label="New password" error={errors.password} isRequired>
            <Input
              type="password"
              placeholder="••••••••"
              {...register("password")}
            />
          </FormField>

          <FormField
            label="Confirm password"
            error={errors.confirmPassword}
            isRequired
          >
            <Input
              type="password"
              placeholder="••••••••"
              {...register("confirmPassword")}
            />
          </FormField>

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
            isDisabled={isSubmitting}
            className="w-full justify-center"
          >
            {isSubmitting ? "Resetting..." : "Reset password"}
          </Button>
        </Form>
      </div>
    </div>
  );
}
