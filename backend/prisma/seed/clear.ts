import { PrismaClient } from '@prisma/client';

/**
 * Deletes every row in foreign-key-safe order (children before parents).
 * Shared by `seed` (which self-wipes on every run, so a partial prior run
 * can't wedge it) and by `unseed`.
 */
export async function clearAll(prisma: PrismaClient): Promise<void> {
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.promotionRedemption.deleteMany();
  await prisma.servicerCreditLog.deleteMany();
  await prisma.penaltyAppeal.deleteMany();
  await prisma.penaltyLog.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.escrow.deleteMany();
  await prisma.report.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.customerPoints.deleteMany();
  await prisma.pointsTransaction.deleteMany();
  await prisma.redemption.deleteMany();
  await prisma.orderHistory.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.quoteProposal.deleteMany();
  await prisma.quoteBroadcast.deleteMany();
  await prisma.discountCode.deleteMany();
  await prisma.quoteRequest.deleteMany();
  await prisma.servicerWithdrawal.deleteMany();
  await prisma.servicerProposalPreset.deleteMany();
  await prisma.servicerService.deleteMany();
  await prisma.servicerDeposit.deleteMany();
  await prisma.servicerDocument.deleteMany();
  await prisma.servicerSchedule.deleteMany();
  await prisma.categoryRequest.deleteMany();
  await prisma.servicerIdentityChangeRequest.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.reward.deleteMany();
  await prisma.loyaltyTier.deleteMany();
  await prisma.quotePreset.deleteMany();
  await prisma.servicerWaPreset.deleteMany();
  await prisma.servicerModule.deleteMany();
  await prisma.pricingModule.deleteMany();
  await prisma.servicerContact.deleteMany();
  await prisma.servicer.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.userDevice.deleteMany();
  await prisma.file.deleteMany();
  await prisma.balanceCheckpoint.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.savedPaymentMethod.deleteMany();
  await prisma.adminOtp.deleteMany();
  await prisma.userAddress.deleteMany();
  await prisma.user.deleteMany();
  // Sub-categories first (self-relation), then top-level categories.
  await prisma.category.deleteMany({ where: { parentCategoryId: { not: null } } });
  await prisma.category.deleteMany();
  await prisma.loyaltyTier.deleteMany();
  await prisma.faq.deleteMany();
  await prisma.platformMarketingBudget.deleteMany();
  await prisma.postcode.deleteMany();
  await prisma.penaltyRule.deleteMany();
  await prisma.featureFlag.deleteMany();
  await prisma.platformSettings.deleteMany();
  await prisma.jobQueue.deleteMany();
  await prisma.idempotencyFallback.deleteMany();
  // Config tables (safe to preserve across reseeds, but cleared for clean slate)
  await prisma.feeRule.deleteMany();
  await prisma.llmApiKey.deleteMany();
  await prisma.bannedEmail.deleteMany();
}
