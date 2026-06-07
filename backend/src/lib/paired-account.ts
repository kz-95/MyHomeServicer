/**
 * Servicer "customer mode" pairing.
 *
 * A merchant can operate the platform as a customer through a *paired customer
 * account* (see schema-notes.md §Servicer "customer mode" and
 * `POST /merchant/customer-session`). There is **no schema column** linking a
 * merchant to its paired `USER` row — the link is encoded entirely in the
 * paired user's synthetic, non-deliverable email:
 *
 *     merchant-<merchantId>@customer.servicer.local
 *
 * These two helpers are the single source of truth for that encoding. Any code
 * that needs to know "is this customer the same person as this merchant?"
 * should go through here rather than re-deriving the email format.
 */

/** Domain for the synthetic, non-login email of a merchant's paired customer. */
const PAIRED_EMAIL_DOMAIN = 'customer.servicer.local';

/** The synthetic email of the customer account paired with the given merchant. */
export function pairedCustomerEmail(merchantId: string): string {
  return `merchant-${merchantId}@${PAIRED_EMAIL_DOMAIN}`;
}

/**
 * If `email` is a merchant's paired-customer synthetic email, returns that
 * merchant's id; otherwise `null`.
 *
 * Used to detect when a quote request was created by a merchant's own paired
 * customer account (i.e. the same person) so the merchant can be prevented
 * from quoting on their own job.
 */
export function pairedMerchantIdFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = /^merchant-(.+)@customer\.servicer\.local$/i.exec(email.trim());
  return match ? match[1] : null;
}
