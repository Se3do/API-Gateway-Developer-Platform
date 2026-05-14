import crypto from 'crypto';

// Token expiry times (in milliseconds)
export const EMAIL_VERIFICATION_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
export const PASSWORD_RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a random verification/reset token
 * Returns a 32-character hex string suitable for URLs
 */
export function generateEmailToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate expiry date for email tokens
 * Default: 1 hour from now
 */
export function generateEmailTokenExpiry(expiryMs: number = EMAIL_VERIFICATION_TOKEN_EXPIRY_MS): Date {
  return new Date(Date.now() + expiryMs);
}

/**
 * Validate an email token
 * @param providedToken The token provided by the user (from URL)
 * @param storedToken The token stored in the database
 * @param expiresAt The expiry date of the token
 * @returns true if token is valid (matches and not expired)
 */
export function validateEmailToken(providedToken: string, storedToken: string | null, expiresAt: Date | null): boolean {
  if (!storedToken || !expiresAt) {
    return false;
  }

  // Token must match exactly
  if (providedToken !== storedToken) {
    return false;
  }

  // Token must not be expired
  if (new Date() > expiresAt) {
    return false;
  }

  return true;
}

/**
 * Clear email token from user (after use)
 */
export function clearEmailToken(): {
  token: null;
  expiresAt: null;
} {
  return {
    token: null,
    expiresAt: null,
  };
}
