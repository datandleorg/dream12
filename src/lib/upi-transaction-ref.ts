/** Match DB `is_valid_upi_transaction_ref`: 8–80 chars, alphanumeric + hyphen after trim. */
const UPI_TXN_REF = /^[0-9A-Za-z-]{8,80}$/;

export function isPlausibleUpiTransactionRef(raw: string): boolean {
  const s = raw.trim();
  return UPI_TXN_REF.test(s);
}

export const upiTransactionRefHint =
  "8–80 characters: letters, digits, and hyphens only (e.g. UTR from bank or UPI app).";
