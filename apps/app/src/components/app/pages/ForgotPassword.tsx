import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@heroui/react/button";
import { Alert } from "@heroui/react/alert";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { FormField } from "../FormField";
import { forgotPasswordSchema } from "../validation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgetPassword } from "../auth";

export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(data: { email: string }) {
    setApiError(null);
    try {
      await forgetPassword(data.email);
      setSent(true);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Failed to send reset email",
      );
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <div className="flex flex-col items-center gap-4 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-muted">
            If an account exists for{" "}
            <strong>{getValues("email")}</strong>, we've sent a password reset
            link.
          </p>
          <Button variant="ghost" onPress={() => setSent(false)}>
            Send again
          </Button>
          <Link to="/cloud" className="text-sm text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="flex flex-col gap-6 max-w-sm w-full">
        <div>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-sm text-muted mt-1">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        <Form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <FormField label="Email" error={errors.email} isRequired>
            <Input
              type="email"
              placeholder="you@example.com"
              {...register("email")}
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
            {isSubmitting ? "Sending..." : "Send reset link"}
          </Button>
        </Form>

        <Link to="/cloud" className="text-sm text-accent hover:underline text-center">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
