/**
 * Data-masking helpers for list responses (security-notes.md §9). Full
 * details are only ever returned in single-resource responses where the
 * caller's ownership has been proven.
 */

/** Mask a phone number, keeping the country/area prefix visible. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  if (phone.length <= 4) return '****';
  return phone.slice(0, -4) + '****';
}

/** Mask a bank account number, keeping only the last 4 digits. */
export function maskBankAccount(account: string | null | undefined): string {
  if (!account) return '';
  if (account.length <= 4) return account;
  return '*'.repeat(account.length - 4) + account.slice(-4);
}
