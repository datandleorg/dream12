import { createHmac } from "crypto";
import Razorpay from "razorpay";

export function getRazorpayKeyId(): string {
  const id = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!id) {
    throw new Error("Missing RAZORPAY_KEY_ID or NEXT_PUBLIC_RAZORPAY_KEY_ID");
  }
  return id;
}

export function getRazorpayClient(): Razorpay {
  const key_id = getRazorpayKeyId();
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_secret) {
    throw new Error("Missing RAZORPAY_KEY_SECRET");
  }
  return new Razorpay({ key_id, key_secret });
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const body = `${orderId}|${paymentId}`;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}
