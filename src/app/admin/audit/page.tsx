import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default async function AdminAuditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/adminlogin");
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/");

  const { data: rows } = await supabase
    .from("admin_audit_log")
    .select("id,actor_id,action,entity_type,entity_id,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4">
      <Link href="/admin/pay-in-requests" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Back to admin
      </Link>
      <p className="text-muted-foreground text-sm">Recent privileged actions (newest first).</p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Actor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-sm">
                  No entries yet.
                </TableCell>
              </TableRow>
            ) : (
              (rows ?? []).map((r) => (
                <TableRow key={r.id as string}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(r.created_at as string).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">{r.action as string}</TableCell>
                  <TableCell className="text-xs">
                    {(r.entity_type as string) ?? "—"} / {(r.entity_id as string)?.slice(0, 8) ?? "—"}…
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {(r.actor_id as string)?.slice(0, 8) ?? "—"}…
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
