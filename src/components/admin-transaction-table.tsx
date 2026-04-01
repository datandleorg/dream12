"use client";

import { useState } from "react";
import { toast } from "sonner";
import { approveTransaction, rejectTransaction } from "@/app/actions/admin-transactions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingOverlay } from "@/components/loading-overlay";
import { formatStatusLabel } from "@/lib/format-status-ui";

type Row = {
  id: string;
  user_id: string;
  username: string | null;
  amount: number;
  utr_number: string | null;
  source: string;
  razorpay_payment_id: string | null;
  status: string;
  created_at: string;
};

export function AdminTransactionTable({ rows }: { rows: Row[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function onApprove(id: string) {
    setBusy(id);
    const r = await approveTransaction(id);
    setBusy(null);
    if (!r.ok) toast.error(r.message);
    else toast.success("Approved");
  }

  async function onReject(id: string) {
    setBusy(id);
    const r = await rejectTransaction(id);
    setBusy(null);
    if (!r.ok) toast.error(r.message);
    else toast.success("Rejected");
  }

  if (!rows.length) {
    return <p className="text-muted-foreground text-sm">No transactions.</p>;
  }

  return (
    <div className="relative rounded-md border">
      <LoadingOverlay show={busy !== null} label="Updating transaction…" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-[120px] truncate">
                {r.username ?? r.user_id.slice(0, 8)}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {r.source === "razorpay" && r.razorpay_payment_id
                  ? `RZ ${r.razorpay_payment_id.slice(0, 14)}…`
                  : (r.utr_number ?? "—")}
              </TableCell>
              <TableCell className="tabular-nums">₹{r.amount.toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="tracking-wide">
                  {formatStatusLabel(r.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {r.status === "pending" ? (
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      className="min-h-11 min-w-[88px]"
                      disabled={busy === r.id}
                      onClick={() => void onApprove(r.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="min-h-11 min-w-[88px]"
                      disabled={busy === r.id}
                      onClick={() => void onReject(r.id)}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
