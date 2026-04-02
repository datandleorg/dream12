"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  adminAdjustWallet,
  adminDeleteUser,
  adminSetIsAdmin,
  adminUpdateEmail,
  adminUpdateUserPassword,
  adminUpdateUsername,
} from "@/app/actions/admin-users";
import { AdminUserActiveToggle } from "@/components/admin-user-active-toggle";
import { AdminUserAvatarEditor } from "@/components/admin-user-avatar-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/loading-overlay";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { PASSWORD_RULES_HINT } from "@/lib/password-policy";

export function AdminUserManage({
  userId,
  currentAdminId,
  email,
  username,
  avatarUrl,
  walletBalance,
  isAdmin,
  isActive,
}: {
  userId: string;
  currentAdminId: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
  walletBalance: number;
  isAdmin: boolean;
  isActive: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uEmail, setUEmail] = useState(email);
  const [uName, setUName] = useState(username);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function saveUsername(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await adminUpdateUsername(userId, uName);
    setLoading(false);
    if (!r.ok) toast.error(r.message);
    else {
      toast.success("Username updated");
      router.refresh();
    }
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await adminUpdateEmail(userId, uEmail);
    setLoading(false);
    if (!r.ok) toast.error(r.message);
    else {
      toast.success("Email updated");
      router.refresh();
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const r = await adminUpdateUserPassword(userId, newPassword);
    setLoading(false);
    if (!r.ok) toast.error(r.message);
    else {
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
    }
  }

  async function toggleAdmin() {
    setLoading(true);
    const r = await adminSetIsAdmin(userId, !isAdmin);
    setLoading(false);
    if (!r.ok) toast.error(r.message);
    else {
      toast.success("Role updated");
      router.refresh();
    }
  }

  async function onAdjustWallet(e: React.FormEvent) {
    e.preventDefault();
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) {
      toast.error("Enter a non-zero number");
      return;
    }
    setLoading(true);
    const r = await adminAdjustWallet(userId, d, reason);
    setLoading(false);
    if (!r.ok) toast.error(r.message);
    else {
      toast.success("Wallet adjusted");
      setDelta("");
      setReason("");
      router.refresh();
    }
  }

  async function onDelete() {
    if (!confirm("Delete this user permanently?")) return;
    setLoading(true);
    const r = await adminDeleteUser(userId);
    if (!r.ok) {
      setLoading(false);
      toast.error(r.message);
      return;
    }
    toast.success("User deleted");
    router.replace("/admin/users");
    router.refresh();
  }

  return (
    <div className="relative space-y-8">
      <LoadingOverlay show={loading} label="Saving…" />
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/users" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to users
        </Link>
        {userId !== currentAdminId ? (
          <Button type="button" variant="destructive" size="sm" onClick={() => void onDelete()}>
            Delete user
          </Button>
        ) : null}
      </div>

      <AdminUserAvatarEditor userId={userId} username={username} avatarUrl={avatarUrl ?? null} />

      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{username?.trim() || "User"}</h1>
          {email ? (
            <span className="text-muted-foreground max-w-full truncate text-sm">{email}</span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">User id</p>
        <code className="text-xs break-all">{userId}</code>
        <p className="text-lg font-semibold tabular-nums">Wallet: ₹{walletBalance.toFixed(2)}</p>
      </div>

      <form onSubmit={saveUsername} className="grid max-w-md gap-3">
        <Label htmlFor="edit-user">Username</Label>
        <Input
          id="edit-user"
          className="min-h-11"
          value={uName}
          onChange={(e) => setUName(e.target.value)}
        />
        <Button type="submit" className="min-h-11 w-fit">
          Save username
        </Button>
      </form>

      <form onSubmit={saveEmail} className="grid max-w-md gap-3">
        <Label htmlFor="edit-email">Email</Label>
        <Input
          id="edit-email"
          type="email"
          className="min-h-11"
          value={uEmail}
          onChange={(e) => setUEmail(e.target.value)}
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Updates Supabase Auth (login identifier). Notification and password-reset emails use this address
          after you save.
        </p>
        <Button type="submit" className="min-h-11 w-fit">
          Save email
        </Button>
      </form>

      <form onSubmit={(e) => void savePassword(e)} className="grid max-w-md gap-3">
        <p className="font-medium">Set password</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Sets the user&apos;s login password immediately. They should sign in with the new password on
          their next session; existing sessions may stay valid until they expire.
        </p>
        <Label htmlFor="admin-new-password">New password</Label>
        <Input
          id="admin-new-password"
          type="password"
          autoComplete="new-password"
          className="min-h-11"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Label htmlFor="admin-confirm-password">Confirm new password</Label>
        <Input
          id="admin-confirm-password"
          type="password"
          autoComplete="new-password"
          className="min-h-11"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <p className="text-muted-foreground text-xs leading-relaxed">{PASSWORD_RULES_HINT}</p>
        <Button type="submit" className="min-h-11 w-fit">
          Set password
        </Button>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <AdminUserActiveToggle
          userId={userId}
          isActive={isActive}
          currentAdminId={currentAdminId}
          layout="detail"
        />
        <Button type="button" variant="secondary" className="min-h-11" onClick={() => void toggleAdmin()}>
          {isAdmin ? "Remove admin" : "Make admin"}
        </Button>
      </div>

      <form onSubmit={onAdjustWallet} className="grid max-w-md gap-3">
        <p className="font-medium">Adjust wallet</p>
        <Label htmlFor="delta">Delta (₹, negative to debit)</Label>
        <Input
          id="delta"
          type="number"
          step="0.01"
          className="min-h-11"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
        />
        <Label htmlFor="why">Reason (required)</Label>
        <Input
          id="why"
          className="min-h-11"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button type="submit" className="min-h-11 w-fit">
          Apply adjustment
        </Button>
      </form>
    </div>
  );
}
