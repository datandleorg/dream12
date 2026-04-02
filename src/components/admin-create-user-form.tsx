"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminCreateUser } from "@/app/actions/admin-users";
import { PASSWORD_RULES_HINT } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/loading-overlay";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AdminCreateUserForm({
  authAdminBlocked = false,
  authAdminBlockedReason,
  authCreateNote,
}: {
  /** When the env key is anon — only case we hard-block create. */
  authAdminBlocked?: boolean;
  authAdminBlockedReason?: string;
  /** Shown when list-users failed but create may still work (e.g. service_role JWT). */
  authCreateNote?: string;
} = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await adminCreateUser({ email, password, username });
    setLoading(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("User created");
    setEmail("");
    setPassword("");
    setUsername("");
    router.refresh();
  }

  return (
    <Card>
      <LoadingOverlay show={loading} label="Creating user…" />
      <CardHeader>
        <CardTitle className="text-lg">Create user</CardTitle>
        <CardDescription>New accounts must be created by an admin (sign-up is disabled).</CardDescription>
        {authAdminBlocked && authAdminBlockedReason ? (
          <p className="text-destructive pt-2 text-sm">{authAdminBlockedReason}</p>
        ) : null}
        {!authAdminBlocked && authCreateNote ? (
          <p className="text-muted-foreground border-primary/20 bg-primary/5 mt-2 rounded-md border px-2 py-2 text-xs leading-relaxed">
            {authCreateNote}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid max-w-md gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nu-email">Email</Label>
            <Input
              id="nu-email"
              type="email"
              required
              className="min-h-11"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={authAdminBlocked}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nu-user">Username</Label>
            <Input
              id="nu-user"
              required
              className="min-h-11"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={authAdminBlocked}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nu-pass">Password</Label>
            <Input
              id="nu-pass"
              type="password"
              required
              minLength={8}
              className="min-h-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={authAdminBlocked}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">{PASSWORD_RULES_HINT}</p>
          </div>
          <Button type="submit" disabled={loading || authAdminBlocked} className="min-h-11 w-fit">
            Create user
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
