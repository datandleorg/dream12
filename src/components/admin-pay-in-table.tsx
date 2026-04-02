"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  approvePayInRequest,
  rejectPayInRequest,
} from "@/app/actions/admin-pay-requests";
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
import { UserAvatar } from "@/components/user-avatar";
import { formatStatusLabel } from "@/lib/format-status-ui";
import {
  isPlausibleUpiTransactionRef,
  upiTransactionRefHint,
} from "@/lib/upi-transaction-ref";

type Row = {
  id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  amount_inr: number;
  utr_ref: string;
  status: string;
  created_at: string;
};

export function AdminPayInTable({ rows }: { rows: Row[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function onApprove(id: string) {
    setBusy(id);
    const r = await approvePayInRequest(id);
    setBusy(null);
    if (!r.ok) toast.error(r.message);
    else toast.success("Approved");
  }

  async function onReject(id: string) {
    setBusy(id);
    const r = await rejectPayInRequest(id);
    setBusy(null);
    if (!r.ok) toast.error(r.message);
    else toast.success("Rejected");
  }

  if (!rows.length) {
    return <p className="text-muted-foreground text-sm">No pay-in requests.</p>;
  }

  return (
    <div className="relative rounded-md border">
      <LoadingOverlay show={busy !== null} label="Updating…" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>UTR / ref</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const utrOk = isPlausibleUpiTransactionRef(r.utr_ref);
            return (
            <TableRow key={r.id}>
              <TableCell className="max-w-[160px]">
                <div className="flex min-w-0 items-center gap-2">
                  <UserAvatar
                    avatarUrl={r.avatar_url}
                    username={r.username}
                    userIdFallback={r.user_id}
                    size="sm"
                  />
                  <span className="truncate">
                    {r.username ?? r.user_id.slice(0, 8)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {r.utr_ref}
                {r.status === "pending" && !utrOk ? (
                  <span className="text-destructive mt-1 block text-[11px] font-sans normal-case">
                    Invalid ref — cannot approve ({upiTransactionRefHint})
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="tabular-nums">₹{r.amount_inr.toFixed(2)}</TableCell>
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
                      disabled={busy === r.id || !utrOk}
                      title={!utrOk ? upiTransactionRefHint : undefined}
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
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
