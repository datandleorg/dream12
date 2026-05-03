#!/usr/bin/env node
/**
 * Set a new password for a Supabase Auth user (Auth Admin API).
 *
 *   node --env-file=.env.local scripts/admin-reset-password.mjs <user-uuid>
 *   NEW_PASSWORD='YourChoice1!' node --env-file=.env.local scripts/admin-reset-password.mjs <user-uuid>
 *
 * npm:
 *   npm run admin:reset-password -- 9bdc5274-b5e6-455e-b613-9c111ca79ae0
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * If NEW_PASSWORD is omitted, a random password is generated (matches app rules:
 * ≥8 chars, one uppercase, one digit, one symbol). The new password is printed once — save it securely.
 */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const MIN_LEN = 8;
const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /[0-9]/;
const HAS_SYMBOL = /[^\w\s]/;

function validatePasswordStrength(password) {
  if (password.length < MIN_LEN) {
    return `Password must be at least ${MIN_LEN} characters`;
  }
  if (!HAS_UPPER.test(password)) {
    return "Password must include at least one uppercase letter";
  }
  if (!HAS_DIGIT.test(password)) {
    return "Password must include at least one number";
  }
  if (!HAS_SYMBOL.test(password)) {
    return "Password must include at least one symbol (e.g. @, #, !)";
  }
  return null;
}

function genPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "@#%!";
  const pick = (s) => s[crypto.randomInt(0, s.length)];
  const parts = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 0; i < 10; i++) {
    parts.push(pick(lower + upper + digits));
  }
  for (let i = parts.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts.join("");
}

async function main() {
  const userId = process.argv[2]?.trim();
  if (!userId) {
    console.error("Usage: node scripts/admin-reset-password.mjs <auth-user-uuid>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use: node --env-file=.env.local …)",
    );
    process.exit(1);
  }

  let newPassword = process.env.NEW_PASSWORD?.trim();
  if (!newPassword) {
    newPassword = genPassword();
  } else {
    const err = validatePasswordStrength(newPassword);
    if (err) {
      console.error(err);
      process.exit(1);
    }
  }

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    console.error("Supabase error:", error.message);
    process.exit(1);
  }

  console.log("OK: password updated for", userId);
  console.log("Email:", data.user?.email ?? "(unknown)");
  console.log("New password:", newPassword);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
