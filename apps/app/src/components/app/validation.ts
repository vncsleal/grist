import { z } from "zod";

export const emailSchema = z.string().email("Enter a valid email address");
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");
export const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name must be at most 100 characters");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  name: z.string().max(100, "Name must be at most 100 characters").optional(),
  role: z.string().max(200, "Role must be at most 200 characters").optional(),
  industry: z
    .string()
    .max(200, "Industry must be at most 200 characters")
    .optional(),
  voice: z
    .string()
    .max(500, "Voice description must be at most 500 characters")
    .optional(),
  audienceDescription: z
    .string()
    .max(1000, "Audience description must be at most 1000 characters")
    .optional(),
  contentGoals: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  excludeTopics: z.array(z.string()).optional(),
});
