import React from "react";
import { TextField } from "@heroui/react/textfield";
import { Label } from "@heroui/react/label";
import { FieldError } from "@heroui/react/field-error";
import type { FieldError as RHFError } from "react-hook-form";

/**
 * FormField — a HeroUI v3 TextField wrapper that renders a labelled
 * input alongside a react-hook-form field-level error message.
 *
 * Usage:
 *   <FormField label="Email" error={errors.email}>
 *     <Input type="email" placeholder="you@example.com" {...register("email")} />
 *   </FormField>
 */
interface FormFieldProps {
  label: string;
  error?: RHFError;
  isRequired?: boolean;
  children: React.ReactNode;
}

export function FormField({
  label,
  error,
  isRequired = false,
  children,
}: FormFieldProps) {
  return (
    <TextField isRequired={isRequired} isInvalid={!!error} className="w-full">
      <Label>{label}</Label>
      {children}
      {error && <FieldError>{error.message}</FieldError>}
    </TextField>
  );
}
