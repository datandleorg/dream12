import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient, verifyPaymentSignature } from "@/lib/razorpay";

type VerifyBody = {
  orderId?: string;
  paymentId?: string;
  signature?: string;
};

export async function POST(request: Request) {
  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const paymentId = typeof body.paymentId === "string" ? body.paymentId.trim() : "";
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "Missing orderId, paymentId, or signature" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!verifyPaymentSignature(orderId, paymentId, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: row, error: rowErr } = await admin
    .from("razorpay_orders")
    .select("user_id, amount_inr, amount_paise")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();

  if (rowErr || !row) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (row.user_id !== user.id) {
    return NextResponse.json({ error: "Order does not belong to this user" }, { status: 403 });
  }

  let remoteAmountPaise: number;
  try {
    const rzp = getRazorpayClient();
    const order = await rzp.orders.fetch(orderId);
    const amt = order.amount;
    remoteAmountPaise = typeof amt === "number" ? amt : Number.parseInt(String(amt), 10);
    if (!Number.isFinite(remoteAmountPaise)) {
      return NextResponse.json({ error: "Invalid order data" }, { status: 502 });
    }
  } catch (e) {
    console.error("verify fetch order:", e);
    return NextResponse.json({ error: "Could not verify order with Razorpay" }, { status: 502 });
  }

  const storedPaise = Number(row.amount_paise);
  if (remoteAmountPaise !== storedPaise) {
    return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
  }

  const amountInr = Number(row.amount_inr);
  if (!Number.isFinite(amountInr) || amountInr <= 0) {
    return NextResponse.json({ error: "Invalid stored amount" }, { status: 500 });
  }

  const { data: rpcResult, error: rpcErr } = await admin.rpc("finalize_razorpay_topup", {
    p_user_id: user.id,
    p_amount_inr: amountInr,
    p_order_id: orderId,
    p_payment_id: paymentId,
  });

  if (rpcErr) {
    console.error("finalize_razorpay_topup:", rpcErr);
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const result = rpcResult as { ok?: boolean; duplicate?: boolean } | null;
  if (!result?.ok) {
    return NextResponse.json({ error: "Could not finalize payment" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, duplicate: Boolean(result.duplicate) });
}
