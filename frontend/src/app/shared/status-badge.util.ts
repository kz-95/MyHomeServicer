const STATUS_TOKEN: Record<string, string> = {
  pending_confirm: 'open',
  pending_start: 'accepted',
  in_progress: 'progress',
  confirmed: 'accepted',
  completed: 'completed',
  cancelled: 'cancelled',
  paid: 'paid',
  pending: 'pending',
  open: 'open',
  accepted: 'accepted',
  progress: 'progress',
};

/** Returns the global badge CSS class string for a booking or job status. */
export function statusBadgeClass(status: string): string {
  const token = STATUS_TOKEN[status] ?? 'pending';
  return `badge badge-${token}`;
}
