/** Format a booking's auto-increment number into a human-readable Order ID. */
export function formatOrderId(orderNumber: number, createdAt: Date): string {
  const year = createdAt.getFullYear();
  const padded = String(orderNumber).padStart(5, '0');
  return `SVC-${year}-${padded}`;
}
