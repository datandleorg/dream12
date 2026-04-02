import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/request-context";

export async function getActionLogContext(): Promise<{
  requestId: string | null;
  ip: string | null;
}> {
  const h = await headers();
  return {
    requestId: h.get("x-request-id"),
    ip: clientIpFromHeaders(h),
  };
}
