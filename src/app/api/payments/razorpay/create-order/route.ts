import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient, getRazorpayKeyId } from "@/lib/razorpay";

const MIN_INR = 1;
const MAX_INR = 50_000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amountRaw =
    typeof body === "object" && body !== null && "amount" in body
      ? (body as { amount: unknown }).amount
      : undefined;

  const amountInr =
    typeof amountRaw === "number" ? amountRaw : typeof amountRaw === "string" ? Number(amountRaw) : NaN;

  if (!Number.isFinite(amountInr) || amountInr < MIN_INR || amountInr > MAX_INR) {
    return NextResponse.json(
      { error: `Amount must be between ₹${MIN_INR} and ₹${MAX_INR.toLocaleString("en-IN")}` },
      { status: 400 },
    );
  }

  const amountPaise = Math.round(amountInr * 100);
  if (amountPaise < 100 || amountPaise > MAX_INR * 100) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rzp = getRazorpayClient();
    const receipt = `w_${user.id.slice(0, 8)}_${Date.now().toString(36)}`.slice(0, 40);

    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        user_id: user.id,
      },
    });

    const orderId = order.id as string;
    if (!orderId) {
      return NextResponse.json({ error: "Failed to create order" }, { status: 502 });
    }

    const admin = createServiceClient();
    const { error: insertErr } = await admin.from("razorpay_orders").insert({
      user_id: user.id,
      razorpay_order_id: orderId,
      amount_inr: amountInr,
      amount_paise: amountPaise,
      currency: "INR",
      status: "created",
    });

    if (insertErr) {
      console.error("razorpay_orders insert:", insertErr);
      return NextResponse.json({ error: "Could not save order" }, { status: 500 });
    }

    return NextResponse.json({
      orderId,
      amount: amountPaise,
      currency: "INR",
      key: getRazorpayKeyId(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Razorpay error";
    if (msg.includes("RAZORPAY") || msg.includes("Missing")) {
      return NextResponse.json(
        { error: "Payments are not configured on this server." },
        { status: 503 },
      );
    }
    console.error("create-order:", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
