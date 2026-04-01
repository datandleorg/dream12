/**
 * Must live under `src/` next to `app/` — root-level `instrumentation.ts` is NOT discovered by Next.
 * Runs once when the Node server starts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const msg =
    "[notification-email] Server boot: use POST /api/webhooks/notifications-email; test logs with GET that URL; cloud Supabase cannot reach localhost without ngrok/public HTTPS.";
  console.log(msg);
  if (typeof process.stderr?.write === "function") {
    process.stderr.write(`${msg}\n`);
  }
}
