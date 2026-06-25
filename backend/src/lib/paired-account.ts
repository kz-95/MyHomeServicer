/**
 * Servicer "customer mode" pairing.
 *
 * A servicer can operate the platform as a customer through a *paired customer
 * account* (see schema-notes.md §Servicer "customer mode" and
 * `POST /servicer/customer-session`). There is **no schema column** linking a
 * servicer to its paired `USER` row - the link is encoded entirely in the
 * paired user's synthetic, non-deliverable email:
 *
 *     servicer-<servicerId>@customer.servicer.local
 *
 * These two helpers are the single source of truth for that encoding. Any code
 * that needs to know "is this customer the same person as this servicer?"
 * should go through here rather than re-deriving the email format.
 */

/** Domain for the synthetic, non-login email of a servicer's paired customer. */
const PAIRED_EMAIL_DOMAIN = 'customer.servicer.local';

/** The synthetic email of the customer account paired with the given servicer. */
export function pairedCustomerEmail(servicerId: string): string {
  return `servicer-${servicerId}@${PAIRED_EMAIL_DOMAIN}`;
}

/**
 * If `email` is a servicer's paired-customer synthetic email, returns that
 * servicer's id; otherwise `null`.
 *
 * Used to detect when a quote request was created by a servicer's own paired
 * customer account (i.e. the same person) so the servicer can be prevented
 * from quoting on their own job.
 */
export function pairedServicerIdFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = /^servicer-(.+)@customer\.servicer\.local$/i.exec(email.trim());
  return match ? match[1] : null;
}
