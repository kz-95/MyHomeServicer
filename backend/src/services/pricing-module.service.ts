import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';

export interface PricingModuleInput {
  label: string;
  defaultPrice: number;
  taxable?: boolean;
  serviceChargeable?: boolean;
  categoryId?: string | null;
  active?: boolean;
}

export async function listPricingModules(servicerId: string, activeOnly = false) {
  return prisma.pricingModule.findMany({
    where: { servicerId, ...(activeOnly ? { active: true } : {}) },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createPricingModule(servicerId: string, input: PricingModuleInput) {
  return prisma.pricingModule.create({
    data: {
      servicerId,
      label: input.label,
      defaultPrice: input.defaultPrice,
      taxable: input.taxable ?? true,
      serviceChargeable: input.serviceChargeable ?? true,
      categoryId: input.categoryId ?? null,
      active: input.active ?? true,
    },
  });
}

async function ownedModule(servicerId: string, moduleId: string) {
  const mod = await prisma.pricingModule.findFirst({ where: { id: moduleId, servicerId } });
  if (!mod) throw notFound('Pricing module not found');
  return mod;
}

export async function updatePricingModule(
  servicerId: string,
  moduleId: string,
  input: Partial<PricingModuleInput>,
) {
  await ownedModule(servicerId, moduleId);
  const data: Prisma.PricingModuleUpdateInput = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.defaultPrice !== undefined) data.defaultPrice = input.defaultPrice;
  if (input.taxable !== undefined) data.taxable = input.taxable;
  if (input.serviceChargeable !== undefined) data.serviceChargeable = input.serviceChargeable;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId ?? null;
  if (input.active !== undefined) data.active = input.active;
  return prisma.pricingModule.update({ where: { id: moduleId }, data });
}

export async function getModule(servicerId: string, moduleId: string) {
  return ownedModule(servicerId, moduleId);
}

export async function deletePricingModule(servicerId: string, moduleId: string) {
  await ownedModule(servicerId, moduleId);
  await prisma.pricingModule.update({ where: { id: moduleId }, data: { active: false } });
}
