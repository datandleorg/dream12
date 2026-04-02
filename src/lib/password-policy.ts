export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

const HAS_UPPERCASE = /[A-Z]/;
const HAS_DIGIT = /[0-9]/;
/** Punctuation/symbol: not a letter, digit, underscore, or whitespace (matches e.g. @ in Welcome@123). */
const HAS_SYMBOL = /[^\w\s]/;

/** One-line copy for forms (profile, admin). */
export const PASSWORD_RULES_HINT =
  "At least 8 characters with one uppercase letter, one number, and one symbol (e.g. @, #, !).";

/** Returns an error message or null if valid. */
export function validateNewPasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  if (!HAS_UPPERCASE.test(password)) {
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
