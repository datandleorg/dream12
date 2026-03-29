"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminCreateUser } from "@/app/actions/admin-users";
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

export function AdminCreateUserForm() {
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
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nu-pass">Password</Label>
            <Input
              id="nu-pass"
              type="password"
              required
              minLength={6}
              className="min-h-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading} className="min-h-11 w-fit">
            Create user
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
