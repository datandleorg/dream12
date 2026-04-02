"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  approvePayOutRequest,
  rejectPayOutRequest,
} from "@/app/actions/admin-pay-requests";
import { UpiAppPickerButton } from "@/components/upi-app-picker-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  payee_upi: string;
  status: string;
  created_at: string;
  payout_utr_ref: string | null;
};

export function AdminPayOutTable({ rows }: { rows: Row[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [payoutUtrById, setPayoutUtrById] = useState<Record<string, string>>({});

  async function onApprove(id: string) {
    const utr = (payoutUtrById[id] ?? "").trim();
    if (!isPlausibleUpiTransactionRef(utr)) {
      toast.error(upiTransactionRefHint);
      return;
    }
    setBusy(id);
    const r = await approvePayOutRequest(id, utr);
    setBusy(null);
    if (!r.ok) toast.error(r.message);
    else toast.success("Approved — wallet debited");
  }

  async function onReject(id: string) {
    setBusy(id);
    const r = await rejectPayOutRequest(id);
    setBusy(null);
    if (!r.ok) toast.error(r.message);
    else toast.success("Rejected");
  }

  if (!rows.length) {
    return <p className="text-muted-foreground text-sm">No pay-out requests.</p>;
  }

  return (
    <div className="relative rounded-md border">
      <LoadingOverlay show={busy !== null} label="Updating…" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>UPI</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Intent</TableHead>
            <TableHead>Payout UTR</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const payParams =
              r.status === "pending"
                ? {
                    payeeVpa: r.payee_upi,
                    payeeName: "Beneficiary",
                    amountInr: r.amount_inr,
                    transactionNote: "Dream12 payout",
                  }
                : null;
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
                <TableCell className="font-mono text-xs">{r.payee_upi}</TableCell>
                <TableCell className="tabular-nums">₹{r.amount_inr.toFixed(2)}</TableCell>
                <TableCell>
                  {payParams ? (
                    <UpiAppPickerButton
                      payParams={payParams}
                      variant="outline"
                      size="sm"
                      title="Pay beneficiary"
                      description="Pick Google Pay, PhonePe, Paytm, or another UPI app to send to this VPA."
                    >
                      Open UPI
                    </UpiAppPickerButton>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="max-w-[200px]">
                  {r.status === "pending" ? (
                    <div className="grid gap-1">
                      <Label className="sr-only" htmlFor={`payout-utr-${r.id}`}>
                        Payout UTR after sending
                      </Label>
                      <Input
                        id={`payout-utr-${r.id}`}
                        className="font-mono text-xs min-h-9"
                        placeholder="UTR after you paid"
                        value={payoutUtrById[r.id] ?? ""}
                        onChange={(e) =>
                          setPayoutUtrById((prev) => ({
                            ...prev,
                            [r.id]: e.target.value,
                          }))
                        }
                        autoComplete="off"
                      />
                      <span className="text-muted-foreground text-[10px] leading-tight">
                        {upiTransactionRefHint}
                      </span>
                    </div>
                  ) : (
                    <span className="font-mono text-xs">
                      {r.payout_utr_ref ?? "—"}
                    </span>
                  )}
                </TableCell>
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
                        disabled={
                          busy === r.id ||
                          !isPlausibleUpiTransactionRef(payoutUtrById[r.id] ?? "")
                        }
                        title={upiTransactionRefHint}
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
