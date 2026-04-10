"use client";

import { useState } from "react";
import { changeOwnPassword } from "@/app/actions/profile-password";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingOverlay } from "@/components/loading-overlay";
import { PASSWORD_RULES_HINT } from "@/lib/password-policy";
import { toast } from "sonner";

export function ProfilePasswordForm({
  canChangePassword,
}: {
  canChangePassword: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("New passwords do not match.");
      return;
    }
    setLoading(true);
    const r = await changeOwnPassword({
      currentPassword: current,
      newPassword: next,
    });
    setLoading(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("Password updated");
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <Card className="relative">
      <LoadingOverlay show={loading} label="Updating…" />
      <CardHeader>
        <CardTitle className="text-lg">Change password</CardTitle>
        <CardDescription>
          {canChangePassword
            ? `${PASSWORD_RULES_HINT} You will stay signed in on this device.`
            : "Password sign-in is not set up for this account (for example, if you only use another sign-in method)."}
        </CardDescription>
      </CardHeader>
      {canChangePassword ? (
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="profile-current-password">Current password</Label>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                className="min-h-11"
                value={current}
                onValueChange={(v) => setCurrent(v)}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-new-password">New password</Label>
              <Input
                id="profile-new-password"
                type="password"
                autoComplete="new-password"
                className="min-h-11"
                value={next}
                onValueChange={(v) => setNext(v)}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-confirm-password">Confirm new password</Label>
              <Input
                id="profile-confirm-password"
                type="password"
                autoComplete="new-password"
                className="min-h-11"
                value={confirm}
                onValueChange={(v) => setConfirm(v)}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="min-h-11 w-fit" disabled={loading}>
              Update password
            </Button>
          </form>
        </CardContent>
      ) : null}
    </Card>
  );
}
