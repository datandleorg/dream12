import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username,is_admin,wallet_balance")
    .eq("id", user.id)
    .single();

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>{profile?.username ?? "Player"}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
          <p className="text-muted-foreground pt-2 text-sm">
            Wallet: ₹{Number(profile?.wallet_balance ?? 0).toFixed(2)}
          </p>
        </CardHeader>
      </Card>
      {profile?.is_admin ? (
        <Link
          href="/admin/pay-in-requests"
          className={cn(
            buttonVariants({ variant: "default" }),
            "inline-flex min-h-11 w-full items-center justify-center",
          )}
        >
          Admin console
        </Link>
      ) : null}
      <SignOutButton />
    </div>
  );
}
