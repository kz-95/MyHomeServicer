import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Create a new identity change request from a servicer. */
export async function createIdentityChangeRequest(
  merchantId: string,
  proposed: Record<string, unknown>,
) {
  return prisma.servicerIdentityChangeRequest.create({
    data: { merchantId, proposed: proposed as Prisma.InputJsonValue, status: 'pending' },
  });
}

/** List pending identity change requests (admin). */
export async function listIdentityChangeRequests(status?: string) {
  return prisma.servicerIdentityChangeRequest.findMany({
    where: status ? { status: status as 'pending' | 'approved' | 'rejected' } : {},
    include: {
      merchant: {
        select: {
          id: true,
          businessName: true,
          entityType: true,
          taxNumber: true,
          businessRegistrationNumber: true,
          sstRegistered: true,
          sstNumber: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Approve or reject an identity change request. On approve, apply the changes to the servicer record. */
export async function updateIdentityChangeRequest(
  id: string,
  status: 'approved' | 'rejected',
  reviewedBy: string,
) {
  const request = await prisma.servicerIdentityChangeRequest.findUniqueOrThrow({ where: { id } });

  if (request.status !== 'pending') {
    throw Object.assign(new Error('Change request already processed'), { statusCode: 409 });
  }

  // If approved, apply proposed changes to the servicer.
  if (status === 'approved') {
    const proposed = request.proposed as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};
    const validFields = [
      'entityType', 'businessRegistrationNumber', 'taxNumber',
      'sstRegistered', 'sstNumber',
    ];
    for (const f of validFields) {
      if (f in proposed) updateData[f] = proposed[f];
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.servicer.update({
        where: { id: request.merchantId },
        data: updateData,
      });
    }
  }

  return prisma.servicerIdentityChangeRequest.update({
    where: { id },
    data: { status, reviewedBy, reviewedAt: new Date() },
  });
}
