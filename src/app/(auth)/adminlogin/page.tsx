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
import { safeInternalPath } from "@/lib/safe-return-to";

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextRaw = searchParams.get("next");
  const next = safeInternalPath(nextRaw ?? undefined) ?? "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signErr) {
      setLoading(false);
      toast.error(signErr.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      toast.error("Sign-in failed");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      await supabase.auth.signOut();
      setLoading(false);
      toast.error("This account is not an admin.");
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
          <p className="text-primary font-display text-2xl tracking-[0.2em] uppercase">Admin</p>
          <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
            Console sign-in
          </p>
        </div>
      </div>

      <Card className="border-border/80 w-full shadow-xl ring-1 ring-accent/20">
        <CardHeader className="space-y-1">
          <CardTitle className="text-primary text-2xl">Admin login</CardTitle>
          <CardDescription>Only accounts with admin access can continue.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                className="min-h-11"
                value={email}
                onValueChange={(v) => setEmail(v)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                className="min-h-11"
                value={password}
                onValueChange={(v) => setPassword(v)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="min-h-11 w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in to admin"}
            </Button>
            <p className="text-muted-foreground text-center text-sm">
              <Link href="/login" className="text-accent font-medium underline-offset-4 hover:underline">
                Player login
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
