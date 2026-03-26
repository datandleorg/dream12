import { z } from "zod";

/** Alphanumeric + underscore; normalized to lowercase before save. */
export const signupUsernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(24, "Username must be at most 24 characters")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Use only letters, numbers, and underscores (no spaces)",
  )
  .transform((s) => s.toLowerCase());

export const signupEmailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(320, "Email is too long")
  .email("Enter a valid email address")
  .transform((s) => s.toLowerCase());

/** Strong password: 8+ chars, upper, lower, digit, special. */
export const signupPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[0-9]/, "Include at least one number")
  .regex(
    /[^a-zA-Z0-9]/,
    "Include at least one special character (e.g. !@#$%^&*)",
  );

export const signupFormSchema = z.object({
  username: signupUsernameSchema,
  email: signupEmailSchema,
  password: signupPasswordSchema,
});

export type SignupFormInput = z.input<typeof signupFormSchema>;
export type SignupFormValues = z.output<typeof signupFormSchema>;

/** Map Supabase Auth errors to clearer copy for email duplicates, etc. */
export function mapSignupAuthError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user already exists") ||
    m.includes("email address is already")
  ) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("password") && m.includes("weak")) {
    return "Password does not meet security requirements. Use a stronger password.";
  }
  return message;
}
