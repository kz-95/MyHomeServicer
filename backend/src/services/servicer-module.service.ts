import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';

const SKU_PATTERN = /^[A-Za-z0-9_-]{3,30}$/;

export interface ServicerModuleInput {
  name: string;
  price: number;
  sku?: string | null;
  active?: boolean;
}

/**
 * Counts how many of the servicer's listings reference each module id via the
 * MerchantService.moduleRefs JSON array. Phase 1 listings carry no module refs
 * yet, so this is typically 0 — it stays correct once Advanced (Phase 2) wires
 * modules into listings.
 */
async function usageByModuleId(servicerId: string): Promise<Record<string, number>> {
  const services = await prisma.merchantService.findMany({
    where: { merchantId: servicerId, deletedAt: null },
    select: { moduleRefs: true },
  });
  const counts: Record<string, number> = {};
  for (const svc of services) {
    const refs = Array.isArray(svc.moduleRefs) ? svc.moduleRefs : [];
    for (const ref of refs) {
      const id = (ref as { moduleId?: unknown })?.moduleId;
      if (typeof id === 'string') counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

export async function listServicerModules(servicerId: string, activeOnly = false) {
  const [modules, usage] = await Promise.all([
    prisma.servicerModule.findMany({
      where: { servicerId, ...(activeOnly ? { active: true } : {}) },
      orderBy: { createdAt: 'asc' },
    }),
    usageByModuleId(servicerId),
  ]);
  return modules.map((m) => ({ ...m, usedInListings: usage[m.id] ?? 0 }));
}

function checkSku(sku: string | null | undefined) {
  if (sku && !SKU_PATTERN.test(sku)) {
    throw badRequest('SKU must be 3-30 alphanumeric / hyphen / underscore characters');
  }
}

export async function createServicerModule(servicerId: string, input: ServicerModuleInput) {
  checkSku(input.sku);
  return prisma.servicerModule.create({
    data: {
      servicerId,
      name: input.name,
      price: input.price,
      sku: input.sku?.trim() || null,
      active: input.active ?? true,
    },
  });
}

async function ownedModule(servicerId: string, moduleId: string) {
  const mod = await prisma.servicerModule.findFirst({ where: { id: moduleId, servicerId } });
  if (!mod) throw notFound('Module not found');
  return mod;
}

export async function updateServicerModule(
  servicerId: string,
  moduleId: string,
  input: Partial<ServicerModuleInput>,
) {
  await ownedModule(servicerId, moduleId);
  const data: Prisma.ServicerModuleUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.price !== undefined) data.price = input.price;
  if (input.sku !== undefined) {
    checkSku(input.sku);
    data.sku = input.sku?.trim() || null;
  }
  if (input.active !== undefined) data.active = input.active;
  return prisma.servicerModule.update({ where: { id: moduleId }, data });
}

/** Soft-disable a module (sets active=false) so existing references stay valid. */
export async function deleteServicerModule(servicerId: string, moduleId: string) {
  await ownedModule(servicerId, moduleId);
  await prisma.servicerModule.update({ where: { id: moduleId }, data: { active: false } });
}
