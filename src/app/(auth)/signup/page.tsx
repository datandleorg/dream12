"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { checkUsernameAvailable } from "@/lib/auth/username-availability";
import {
  mapSignupAuthError,
  signupFormSchema,
} from "@/lib/validation/signup";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LoadingOverlay } from "@/components/loading-overlay";

type FieldErrors = Partial<Record<"username" | "email" | "password", string>>;

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    const parsed = signupFormSchema.safeParse({ username, email, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          (key === "username" || key === "email" || key === "password") &&
          !next[key]
        ) {
          next[key] = issue.message;
        }
      }
      setFieldErrors(next);
      toast.error("Fix the errors below to continue.");
      return;
    }

    const { username: u, email: em, password: pw } = parsed.data;
    setLoading(true);
    const supabase = createClient();

    const { available, error: usernameCheckError } =
      await checkUsernameAvailable(u);

    if (usernameCheckError) {
      setLoading(false);
      toast.error(usernameCheckError);
      return;
    }

    if (!available) {
      setLoading(false);
      setFieldErrors({
        username: "This username is already taken. Try another.",
      });
      toast.error("Username is already taken.");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: em,
      password: pw,
      options: {
        data: { username: u },
      },
    });

    setLoading(false);

    if (error) {
      toast.error(mapSignupAuthError(error.message));
      const msg = mapSignupAuthError(error.message);
      if (
        msg.toLowerCase().includes("email") &&
        msg.toLowerCase().includes("already")
      ) {
        setFieldErrors({ email: msg });
      }
      return;
    }

    toast.success("Check your email to confirm, then sign in.");
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative flex w-full flex-col items-center gap-8 py-6">
      <LoadingOverlay show={loading} label="Creating account…" />
      <div className="flex flex-col items-center gap-3">
        <BrandLogo variant="hero" />
        <div className="text-center">
          <p className="text-primary font-display text-2xl tracking-[0.2em] uppercase">
            Join the league
          </p>
          <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
            Create your Dream12 account
          </p>
        </div>
      </div>

      <Card className="border-border/80 w-full shadow-xl ring-1 ring-accent/20">
        <CardHeader className="space-y-1">
          <CardTitle className="text-primary text-2xl">Create account</CardTitle>
          <CardDescription>
            Pick a unique username and a strong password.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                className={cn(
                  "min-h-11",
                  fieldErrors.username && "border-destructive",
                )}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (fieldErrors.username) {
                    setFieldErrors((x) => ({ ...x, username: undefined }));
                  }
                }}
                placeholder="fantasy_king"
                aria-invalid={Boolean(fieldErrors.username)}
                aria-describedby={
                  fieldErrors.username ? "username-error" : "username-hint"
                }
              />
              <p id="username-hint" className="text-muted-foreground text-xs">
                3–24 characters · letters, numbers, underscores only · stored
                lowercase
              </p>
              {fieldErrors.username ? (
                <p
                  id="username-error"
                  className="text-destructive text-sm"
                  role="alert"
                >
                  {fieldErrors.username}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                className={cn(
                  "min-h-11",
                  fieldErrors.email && "border-destructive",
                )}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((x) => ({ ...x, email: undefined }));
                  }
                }}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email ? (
                <p
                  id="email-error"
                  className="text-destructive text-sm"
                  role="alert"
                >
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                className={cn(
                  "min-h-11",
                  fieldErrors.password && "border-destructive",
                )}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((x) => ({ ...x, password: undefined }));
                  }
                }}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={
                  fieldErrors.password ? "password-error" : "password-hint"
                }
              />
              <p id="password-hint" className="text-muted-foreground text-xs">
                At least 8 characters with uppercase, lowercase, a number, and a
                special character
              </p>
              {fieldErrors.password ? (
                <p
                  id="password-error"
                  className="text-destructive text-sm"
                  role="alert"
                >
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="min-h-11 w-full"
              disabled={loading}
            >
              {loading ? "Creating…" : "Sign up"}
            </Button>
            <p className="text-muted-foreground text-center text-sm">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-accent font-medium underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
