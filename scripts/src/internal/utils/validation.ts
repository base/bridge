/**
 * Validates that a string represents a properly formatted decimal number.
 * Rejects malformed inputs like "1.2.3", "10.", or ".5" that parseFloat
 * would silently accept or misinterpret.
 */
export function validateDecimalString(value: string): void {
  if (typeof value !== 'string') {
    throw new Error('Invalid input: must be a string');
  }

  // Reject multiple decimal points (e.g., "1.2.3" or "10..5")
  if ((value.match(/\./g) || []).length > 1) {
    throw new Error('Invalid decimal format: multiple decimal points not allowed');
  }

  // Reject trailing or leading decimal points (e.g., "10." or ".5")
  if (value.startsWith('.') || value.endsWith('.')) {
    throw new Error('Invalid decimal format: must be a valid decimal number');
  }

  // Reject empty strings
  if (value.trim() === '') {
    throw new Error('Invalid input: cannot be empty');
  }
}
