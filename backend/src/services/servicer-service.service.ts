import { randomBytes } from 'crypto';
import { Prisma, PriceType, TaxMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/errors';
import {
  autoAcceptConditionsSchema,
  fieldRequirementsSchema,
  optionPriceMapSchema,
} from '../lib/json-schemas';

const PRESET_LIMIT = 3; // V1 cap (seed-plan.md: merchant_proposal_preset_limit)
const SKU_PATTERN = /^[A-Za-z0-9_-]{3,30}$/;

export interface ServiceInput {
  subcategoryId?: string;
  newSubcategoryName?: string;
  title: string;
  description?: string;
  merchantSku?: string;
  basePrice: number;
  priceType: PriceType;
  taxMode: TaxMode;
  taxName?: string;
  taxRate?: number;
  estimatedDurationMinutes: number;
  autoAccept?: boolean;
  modifiers?: unknown;
  fieldRequirements?: unknown;
}

// ── Servicer services CRUD ───────────────────────────────────────────────────

export async function listServices(merchantId: string) {
  return prisma.merchantService.findMany({
    where: { merchantId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { category: { select: { id: true, name: true, parentCategoryId: true, imageUrl: true } } },
  });
}

/**
 * Lists the merchant's fixed platform "big category" plus the sub-categories
 * under it — the options shown in the listing form's Sub Category field.
 */
export async function listSubcategories(merchantId: string) {
  const merchant = await prisma.servicer.findUnique({
    where: { id: merchantId },
    include: { category: true },
  });
  if (!merchant) throw notFound('Servicer not found');
  const subcategories = await prisma.category.findMany({
    where: { parentCategoryId: merchant.categoryId, deletedAt: null },
    orderBy: { name: 'asc' },
  });
  return {
    category: { id: merchant.category.id, name: merchant.category.name },
    subcategories: subcategories.map((s) => ({ id: s.id, name: s.name })),
  };
}

/**
 * Resolves the category a listing belongs to. A listing sits under the
 * merchant's fixed big category — either as an existing sub-category, a new
 * sub-category the merchant names (created on the fly), or the big category
 * itself when no sub-category is given.
 */
async function resolveServiceCategory(
  merchantId: string,
  subcategoryId?: string,
  newSubcategoryName?: string,
): Promise<string> {
  const merchant = await prisma.servicer.findUnique({ where: { id: merchantId } });
  if (!merchant) throw notFound('Servicer not found');
  const bigCategoryId = merchant.categoryId;

  if (newSubcategoryName && newSubcategoryName.trim()) {
    const name = newSubcategoryName.trim();
    // Reuse a sub-category of the same name if it already exists.
    const existing = await prisma.category.findFirst({
      where: {
        parentCategoryId: bigCategoryId,
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (existing) return existing.id;
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const created = await prisma.category.create({
      data: { name, slug: `${base || 'sub'}-${randomBytes(3).toString('hex')}`, parentCategoryId: bigCategoryId },
    });
    return created.id;
  }

  if (subcategoryId) {
    const cat = await prisma.category.findFirst({ where: { id: subcategoryId, deletedAt: null } });
    if (!cat) throw notFound('Sub-category not found');
    if (cat.id !== bigCategoryId && cat.parentCategoryId !== bigCategoryId) {
      throw badRequest('That sub-category is not under your registered category');
    }
    return cat.id;
  }

  return bigCategoryId;
}

async function checkSku(merchantId: string, sku: string | undefined, excludeId?: string) {
  if (!sku) return;
  if (!SKU_PATTERN.test(sku)) {
    throw badRequest('SKU must be 3-30 alphanumeric / hyphen / underscore characters');
  }
  const dup = await prisma.merchantService.findFirst({
    where: { merchantId, merchantSku: sku, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (dup) throw conflict('That SKU is already used by another of your listings');
}

export async function createService(merchantId: string, input: ServiceInput) {
  await checkSku(merchantId, input.merchantSku);
  const categoryId = await resolveServiceCategory(
    merchantId,
    input.subcategoryId,
    input.newSubcategoryName,
  );

  return prisma.merchantService.create({
    data: {
      merchantId,
      categoryId,
      title: input.title,
      description: input.description ?? null,
      merchantSku: input.merchantSku ?? null,
      basePrice: input.basePrice,
      priceType: input.priceType,
      taxMode: input.taxMode,
      taxName: input.taxName ?? null,
      taxRate: input.taxRate ?? null,
      estimatedDurationMinutes: input.estimatedDurationMinutes,
      autoAccept: input.autoAccept ?? false,
      modifiers:
        input.modifiers !== undefined
          ? (optionPriceMapSchema.parse(input.modifiers) as Prisma.InputJsonValue)
          : undefined,
      fieldRequirements:
        input.fieldRequirements !== undefined
          ? (fieldRequirementsSchema.parse(input.fieldRequirements) as Prisma.InputJsonValue)
          : undefined,
    },
  });
}

async function ownedService(merchantId: string, serviceId: string) {
  const service = await prisma.merchantService.findFirst({
    where: { id: serviceId, merchantId, deletedAt: null },
  });
  if (!service) throw notFound('Listing not found');
  return service;
}

export async function updateService(
  merchantId: string,
  serviceId: string,
  input: Partial<ServiceInput>,
) {
  await ownedService(merchantId, serviceId);
  const data: Prisma.MerchantServiceUpdateInput = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.basePrice !== undefined) data.basePrice = input.basePrice;
  if (input.priceType !== undefined) data.priceType = input.priceType;
  if (input.taxMode !== undefined) data.taxMode = input.taxMode;
  if (input.taxName !== undefined) data.taxName = input.taxName;
  if (input.taxRate !== undefined) data.taxRate = input.taxRate;
  if (input.estimatedDurationMinutes !== undefined) {
    data.estimatedDurationMinutes = input.estimatedDurationMinutes;
  }
  if (input.merchantSku !== undefined) {
    await checkSku(merchantId, input.merchantSku || undefined, serviceId);
    data.merchantSku = input.merchantSku || null;
  }
  if (input.modifiers !== undefined) {
    data.modifiers = optionPriceMapSchema.parse(input.modifiers) as Prisma.InputJsonValue;
  }
  if (input.subcategoryId !== undefined || input.newSubcategoryName !== undefined) {
    const categoryId = await resolveServiceCategory(
      merchantId,
      input.subcategoryId,
      input.newSubcategoryName,
    );
    data.category = { connect: { id: categoryId } };
  }
  return prisma.merchantService.update({ where: { id: serviceId }, data });
}

export async function deleteService(merchantId: string, serviceId: string) {
  await ownedService(merchantId, serviceId);
  await prisma.merchantService.update({
    where: { id: serviceId },
    data: { deletedAt: new Date() },
  });
}

/** Toggle and configure auto-accept on a service. JSON conditions validated. */
export async function configureAutoAccept(
  merchantId: string,
  serviceId: string,
  input: { autoAccept: boolean; autoAcceptConditions?: unknown; autoAcceptPresetId?: string },
) {
  await ownedService(merchantId, serviceId);
  let conditions: Prisma.InputJsonValue | undefined;
  if (input.autoAccept) {
    if (!input.autoAcceptConditions) {
      throw badRequest('autoAcceptConditions are required when enabling auto-accept');
    }
    conditions = autoAcceptConditionsSchema.parse(input.autoAcceptConditions);
  }
  return prisma.merchantService.update({
    where: { id: serviceId },
    data: {
      autoAccept: input.autoAccept,
      autoAcceptConditions: conditions ?? undefined,
      autoAcceptPresetId: input.autoAcceptPresetId ?? null,
    },
  });
}

// ── Proposal presets ─────────────────────────────────────────────────────────

export async function listPresets(merchantId: string) {
  return prisma.merchantProposalPreset.findMany({
    where: { merchantId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createPreset(
  merchantId: string,
  input: { name: string; message: string; priceOffset?: number; isDefault?: boolean },
) {
  const count = await prisma.merchantProposalPreset.count({ where: { merchantId } });
  if (count >= PRESET_LIMIT) {
    throw conflict(`Preset limit reached (${PRESET_LIMIT} in V1)`);
  }
  if (input.isDefault) {
    await prisma.merchantProposalPreset.updateMany({
      where: { merchantId },
      data: { isDefault: false },
    });
  }
  return prisma.merchantProposalPreset.create({
    data: {
      merchantId,
      name: input.name,
      message: input.message,
      priceOffset: input.priceOffset ?? null,
      isDefault: Boolean(input.isDefault),
      sortOrder: count,
    },
  });
}

export async function updatePreset(
  merchantId: string,
  presetId: string,
  input: {
    name?: string;
    message?: string;
    priceOffset?: number | null;
    isDefault?: boolean;
    sortOrder?: number;
  },
) {
  const preset = await prisma.merchantProposalPreset.findFirst({
    where: { id: presetId, merchantId },
  });
  if (!preset) throw notFound('Preset not found');
  if (input.isDefault) {
    await prisma.merchantProposalPreset.updateMany({
      where: { merchantId },
      data: { isDefault: false },
    });
  }
  return prisma.merchantProposalPreset.update({
    where: { id: presetId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.message !== undefined && { message: input.message }),
      ...(input.priceOffset !== undefined && { priceOffset: input.priceOffset }),
      ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
  });
}

export async function deletePreset(merchantId: string, presetId: string) {
  const preset = await prisma.merchantProposalPreset.findFirst({
    where: { id: presetId, merchantId },
  });
  if (!preset) throw notFound('Preset not found');
  await prisma.merchantProposalPreset.delete({ where: { id: presetId } });
}
