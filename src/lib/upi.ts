/**
 * NPCI-style UPI deep links. Amount uses two decimal places as string.
 *
 * Google Pay (India):
 * - Android package: com.google.android.apps.nbu.paisa.user (official India app — see Google Pay India API docs).
 * - iOS: must use gpay://upi/pay?... NOT upi://pay — generic upi:// often opens WhatsApp first.
 *
 * @see https://developers.google.com/pay/india/api/ios/in-app-payments
 * @see https://developers.google.com/pay/india/api/android/in-app-payments
 */

export type UpiPaymentAppOption = {
  id: string;
  label: string;
  href: string;
};

/** India Google Pay (Tez successor) — correct package per Google Pay India developer docs. */
export const ANDROID_GPAY_PACKAGE = "com.google.android.apps.nbu.paisa.user";
const ANDROID_PHONEPE = "com.phonepe.app";
const ANDROID_PAYTM = "net.one97.paytm";

/** NPCI tr: short, alphanumeric-friendly (some PSPs choke on odd chars). Max 35. */
function defaultTransactionRef(): string {
  const n = Date.now().toString();
  const r = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  const tr = `D12${n}${r}`;
  return tr.length > 35 ? tr.slice(0, 35) : tr;
}

/** Avoid characters that break query parsing; trim length for picky UPI apps. */
function sanitizeUpiField(s: string, maxLen: number): string {
  return s
    .trim()
    .replace(/[&=#?]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

function envFlag(name: string): boolean {
  const v =
    typeof process !== "undefined" ? process.env[name]?.trim().toLowerCase() : undefined;
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Build UPI pay query string.
 *
 * **“Exceeded bank limit for this type of payment”** on deep links but not when paying manually:
 * banks often treat links with **`tr` / `tn` / `mc`** as **merchant or intent/collect** payments,
 * which have **lower limits** than simple **P2P “send to UPI ID”**. Manual entry is usually P2P.
 *
 * **Default (minimal P2P-style):** only `pa`, `pn`, `am`, `cu` — closest to typing the VPA in GPay.
 * Set `NEXT_PUBLIC_UPI_FULL_LINK_PARAMS=true` to add `tr`, optional `tn`, optional `mc` (gateway-style).
 *
 * - Query built with `encodeURIComponent` (spaces as `%20`, not `+`).
 */
export function buildUpiPayQueryString(params: {
  payeeVpa: string;
  payeeName?: string;
  amountInr: number;
  transactionNote?: string;
  transactionRef?: string;
  merchantCategoryCode?: string | null;
}): string {
  const pa = sanitizeUpiField(params.payeeVpa, 256);
  const pn = sanitizeUpiField(params.payeeName ?? "Merchant", 50);
  const am = Number(params.amountInr).toFixed(2);

  const parts: string[] = [
    `pa=${encodeURIComponent(pa)}`,
    `pn=${encodeURIComponent(pn)}`,
  ];

  /** User enters amount in the UPI app — same rail as manual send; use if prefilled `am` still hits limits. */
  const omitAmount = envFlag("NEXT_PUBLIC_UPI_USER_ENTERS_AMOUNT");
  if (!omitAmount) {
    parts.push(`am=${encodeURIComponent(am)}`);
  }
  parts.push(`cu=${encodeURIComponent("INR")}`);

  const fullParams = envFlag("NEXT_PUBLIC_UPI_FULL_LINK_PARAMS");

  if (fullParams) {
    const tr = (params.transactionRef ?? defaultTransactionRef()).slice(0, 35);
    parts.push(`tr=${encodeURIComponent(tr)}`);

    const mcFromParam =
      params.merchantCategoryCode === null || params.merchantCategoryCode === undefined
        ? undefined
        : params.merchantCategoryCode.trim();
    const mcFromEnv =
      typeof process !== "undefined" && process.env.NEXT_PUBLIC_UPI_MERCHANT_CATEGORY_CODE?.trim()
        ? process.env.NEXT_PUBLIC_UPI_MERCHANT_CATEGORY_CODE.trim()
        : undefined;
    const mc = mcFromParam ?? mcFromEnv;
    if (mc) parts.push(`mc=${encodeURIComponent(mc)}`);

    const tn = params.transactionNote?.trim();
    if (tn) parts.push(`tn=${encodeURIComponent(sanitizeUpiField(tn, 80))}`);
  }

  return parts.join("&");
}

/**
 * Chrome/Android: target a specific app with upi://pay + package.
 * Host must be `pay` (i.e. same as upi://pay?...).
 */
function androidPackageIntent(queryString: string, packageName: string): string {
  return `intent://pay?${queryString}#Intent;scheme=upi;package=${packageName};end`;
}

/**
 * iOS Google Pay India — official format from Google (gpay:// prefix + upi/pay path).
 * Do not use plain upi:// here or iOS may open WhatsApp or another default handler.
 */
function iosGooglePayUrl(queryString: string): string {
  return `gpay://upi/pay?${queryString}`;
}

/**
 * Links for opening a specific UPI app (avoids generic `upi://` being captured by WhatsApp, etc.).
 * Call from a user gesture (click) on the client so `navigator` is available.
 */
export function getUpiPaymentAppOptions(params: {
  payeeVpa: string;
  payeeName?: string;
  amountInr: number;
  transactionNote?: string;
  transactionRef?: string;
  /** Omit or leave unset for personal VPAs. Set for verified merchant UPI. */
  merchantCategoryCode?: string | null;
}): UpiPaymentAppOption[] {
  const qs = buildUpiPayQueryString(params);
  const generic = `upi://pay?${qs}`;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  if (isAndroid) {
    return [
      {
        id: "gpay",
        label: "Google Pay",
        href: androidPackageIntent(qs, ANDROID_GPAY_PACKAGE),
      },
      {
        id: "phonepe",
        label: "PhonePe",
        href: androidPackageIntent(qs, ANDROID_PHONEPE),
      },
      {
        id: "paytm",
        label: "Paytm",
        href: androidPackageIntent(qs, ANDROID_PAYTM),
      },
      {
        id: "other",
        label: "Other UPI app",
        href: generic,
      },
    ];
  }

  if (isIOS) {
    return [
      {
        id: "gpay",
        label: "Google Pay",
        href: iosGooglePayUrl(qs),
      },
      {
        id: "phonepe",
        label: "PhonePe",
        href: `phonepe://pay?${qs}`,
      },
      {
        id: "paytm",
        label: "Paytm",
        href: `paytmmp://pay?${qs}`,
      },
      {
        id: "other",
        label: "Other UPI apps",
        href: generic,
      },
    ];
  }

  return [
    {
      id: "upi",
      label: "Open UPI payment link",
      href: generic,
    },
  ];
}

export function buildPayInIntentUrl(params: {
  payeeVpa: string;
  payeeName?: string;
  amountInr: number;
  transactionNote?: string;
}): string {
  return `upi://pay?${buildUpiPayQueryString(params)}`;
}

export function buildPayOutIntentUrl(params: {
  payeeVpa: string;
  payeeName?: string;
  amountInr: number;
  transactionNote?: string;
}): string {
  return buildPayInIntentUrl(params);
}

export function companyUpiFromEnv(): { vpa: string; payeeName: string } | null {
  const vpa =
    process.env.NEXT_PUBLIC_COMPANY_UPI_VPA?.trim() ||
    process.env.COMPANY_UPI_VPA?.trim();
  if (!vpa) return null;
  const payeeName =
    process.env.NEXT_PUBLIC_COMPANY_UPI_PAYEE_NAME?.trim() ||
    process.env.COMPANY_UPI_PAYEE_NAME?.trim() ||
    "Dream12";
  return { vpa, payeeName };
}
