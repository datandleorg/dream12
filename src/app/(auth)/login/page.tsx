"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/loading-overlay";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="relative flex w-full flex-col items-center gap-8 py-6">
      <LoadingOverlay show={loading} label="Signing in…" />
      <div className="flex flex-col items-center gap-3">
        <BrandLogo variant="hero" />
        <div className="text-center">
          <p className="text-primary font-display text-2xl tracking-[0.2em] uppercase">
            Dream12
          </p>
          <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
            Fantasy cricket league
          </p>
        </div>
      </div>

      <Card className="border-border/80 w-full shadow-xl ring-1 ring-accent/20">
        <CardHeader className="space-y-1">
          <CardTitle className="text-primary text-2xl">Sign in</CardTitle>
          <CardDescription>Welcome back — use your email and password.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="min-h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="min-h-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="min-h-11 w-full"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-muted-foreground text-center text-sm">
              No account?{" "}
              <Link
                href="/signup"
                className="text-accent font-medium underline-offset-4 hover:underline"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
