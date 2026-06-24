import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth, requireCustomer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { idempotency } from '../middleware/idempotency';
import { notFound } from '../lib/errors';
import {
  listBookings,
  getBooking,
  addTip,
  customerCancelBooking,
  respondMutualCancel,
  reportBookingProblem,
  reorderBooking,
  settleBooking,
  listUnpaidInvoices,
} from '../services/booking.service';

/** Customer booking endpoints. */
export const bookingsRouter = Router();
bookingsRouter.use(requireAuth, requireCustomer);

/** GET /bookings — the customer's bookings. */
bookingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: await listBookings(req.user!.id, req.query.status as string | undefined) });
  }),
);

/** GET /bookings/:id — full booking detail. */
bookingsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getBooking(req.user!.id, req.params.id));
  }),
);

/** GET /bookings/:id/invoice — the invoice for this booking. */
bookingsRouter.get(
  '/:id/invoice',
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!booking) throw notFound('Booking not found');
    const invoice = await prisma.invoice.findUnique({ where: { bookingId: req.params.id } });
    if (!invoice) throw notFound('Invoice not generated yet');
    res.json(invoice);
  }),
);

/** POST /bookings/:id/tip — add a tip (pay_later, after done). */
bookingsRouter.post(
  '/:id/tip',
  idempotency,
  validate([body('tipAmount').isFloat({ gt: 0 })]),
  asyncHandler(async (req, res) => {
    res.json(await addTip(req.user!.id, req.params.id, req.body.tipAmount));
  }),
);

/** POST /bookings/:id/cancel — customer cancels. */
bookingsRouter.post(
  '/:id/cancel',
  idempotency,
  validate([body('reason').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    res.json(await customerCancelBooking(req.user!.id, req.params.id, req.body.reason));
  }),
);

/** POST /bookings/:id/report — report a problem. */
bookingsRouter.post(
  '/:id/report',
  validate([
    body('subject').isString().trim().notEmpty(),
    body('description').isString().trim().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const report = await reportBookingProblem(
      req.user!.id,
      req.params.id,
      req.body.subject,
      req.body.description,
    );
    res.status(201).json(report);
  }),
);

/** POST /bookings/:id/mutual-cancel/respond — accept/reject servicer request. */
bookingsRouter.post(
  '/:id/mutual-cancel/respond',
  validate([body('accept').isBoolean()]),
  asyncHandler(async (req, res) => {
    res.json(await respondMutualCancel(req.user!.id, req.params.id, req.body.accept));
  }),
);

/** POST /bookings/:id/reorder — rebook from a past booking. */
bookingsRouter.post(
  '/:id/reorder',
  idempotency,
  asyncHandler(async (req, res) => {
    res.status(201).json(await reorderBooking(req.user!.id, req.params.id));
  }),
);

// ── Settlement ────────────────────────────────────────────────────────────────

/**
 * POST /bookings/:id/settle — settle a pay_later booking.
 *
 * Body: { settlementMethod: 'credit' | 'cash' | 'gateway' }
 *   credit  → deduct from customer credit, mark invoice paid
 *   cash    → confirm cash, deduct platform fee from servicer
 *   gateway → placeholder for Stripe (records pending)
 *
 * Requires: booking is pay_later, completed, and invoice is unpaid.
 * Cash settlement requires booking.settlementMethod = 'cash' from acceptance.
 */
bookingsRouter.post(
  '/:id/settle',
  idempotency,
  validate([
    body('settlementMethod')
      .isIn(['credit', 'cash', 'gateway'])
      .withMessage('settlementMethod must be credit, cash, or gateway'),
  ]),
  asyncHandler(async (req, res) => {
    const result = await settleBooking(req.user!.id, req.params.id, req.body.settlementMethod);
    res.json(result);
  }),
);

// ── Disputes ──────────────────────────────────────────────────────────────────

/** POST /bookings/:id/dispute — customer opens a dispute on a booking. */
bookingsRouter.post(
  '/:id/dispute',
  validate([
    body('reason').isString().notEmpty().isLength({ max: 1000 }),
  ]),
  asyncHandler(async (req, res) => {
    const { openDispute } = await import('../services/dispute.service');
    const dispute = await openDispute(req.user!.id, 'customer', {
      bookingId: req.params.id,
      reason: req.body.reason,
    });
    res.status(201).json({ data: dispute });
  }),
);

// ── Unpaid invoices ──────────────────────────────────────────────────────────

/** GET /bookings/unpaid-invoices — list customer's unpaid invoices with overdue status. */
bookingsRouter.get(
  '/unpaid-invoices',
  asyncHandler(async (req, res) => {
    res.json({ data: await listUnpaidInvoices(req.user!.id) });
  }),
);
