import { randomBytes } from 'crypto';
import { Prisma, PriceType, TaxMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/errors';
import {
  autoAcceptConditionsSchema,
  fieldRequirementsSchema,
  moduleRefsSchema,
  optionPriceMapSchema,
} from '../lib/json-schemas';

const PRESET_LIMIT = 3; // V1 cap (seed-plan.md: servicer_proposal_preset_limit)
const SKU_PATTERN = /^[A-Za-z0-9_-]{3,30}$/;

export interface ServiceInput {
  subcategoryId?: string;
  newSubcategoryName?: string;
  title: string;
  description?: string;
  servicerSku?: string;
  basePrice: number;
  priceType: PriceType;
  taxMode: TaxMode;
  taxName?: string;
  taxRate?: number;
  estimatedDurationMinutes: number;
  autoAccept?: boolean;
  autoAcceptMessage?: string | null;
  listingMode?: 'simple' | 'advanced';
  moduleRefs?: unknown;
  modifiers?: unknown;
  fieldRequirements?: unknown;
  imageUrl?: string | null;
  published?: boolean;
  serviceChargeRate?: number | null;
  taxInclusive?: boolean | null;
  sstApplies?: boolean | null;
}

// ── Servicer services CRUD ───────────────────────────────────────────────────

export async function listServices(servicerId: string) {
  return prisma.servicerService.findMany({
    where: { servicerId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { category: { select: { id: true, name: true, parentCategoryId: true, imageUrl: true } } },
  });
}

/**
 * Lists the servicer's fixed platform "big category" plus the sub-categories
 * under it — the options shown in the listing form's Sub Category field.
 */
export async function listSubcategories(servicerId: string) {
  const servicer = await prisma.servicer.findUnique({
    where: { id: servicerId },
    include: { category: true },
  });
  if (!servicer) throw notFound('Servicer not found');
  const subcategories = await prisma.category.findMany({
    where: { parentCategoryId: servicer.categoryId, deletedAt: null },
    orderBy: { name: 'asc' },
  });
  return {
    category: { id: servicer.category.id, name: servicer.category.name },
    subcategories: subcategories.map((s) => ({ id: s.id, name: s.name })),
  };
}

/**
 * Resolves the category a listing belongs to. A listing sits under the
 * servicer's fixed big category — either as an existing sub-category, a new
 * sub-category the servicer names (created on the fly), or the big category
 * itself when no sub-category is given.
 */
async function resolveServiceCategory(
  servicerId: string,
  subcategoryId?: string,
  newSubcategoryName?: string,
): Promise<string> {
  const servicer = await prisma.servicer.findUnique({ where: { id: servicerId } });
  if (!servicer) throw notFound('Servicer not found');
  const bigCategoryId = servicer.categoryId;

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

async function checkSku(servicerId: string, sku: string | undefined, excludeId?: string) {
  if (!sku) return;
  if (!SKU_PATTERN.test(sku)) {
    throw badRequest('SKU must be 3-30 alphanumeric / hyphen / underscore characters');
  }
  const dup = await prisma.servicerService.findFirst({
    where: { servicerId, servicerSku: sku, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (dup) throw conflict('That SKU is already used by another of your listings');
}

export async function createService(servicerId: string, input: ServiceInput) {
  await checkSku(servicerId, input.servicerSku);
  const categoryId = await resolveServiceCategory(
    servicerId,
    input.subcategoryId,
    input.newSubcategoryName,
  );

  return prisma.servicerService.create({
    data: {
      servicerId,
      categoryId,
      title: input.title,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      published: input.published ?? true,
      servicerSku: input.servicerSku ?? null,
      basePrice: input.basePrice,
      priceType: input.priceType,
      taxMode: input.taxMode,
      taxName: input.taxName ?? null,
      taxRate: input.taxRate ?? null,
      estimatedDurationMinutes: input.estimatedDurationMinutes,
      listingMode: input.listingMode ?? 'simple',
      autoAccept: input.autoAccept ?? false,
      autoAcceptMessage: input.autoAcceptMessage ?? null,
      moduleRefs:
        input.moduleRefs !== undefined
          ? (moduleRefsSchema.parse(input.moduleRefs) as Prisma.InputJsonValue)
          : undefined,
      modifiers:
        input.modifiers !== undefined
          ? (optionPriceMapSchema.parse(input.modifiers) as Prisma.InputJsonValue)
          : undefined,
      fieldRequirements:
        input.fieldRequirements !== undefined
          ? (fieldRequirementsSchema.parse(input.fieldRequirements) as Prisma.InputJsonValue)
          : undefined,
      serviceChargeRate: input.serviceChargeRate ?? null,
      taxInclusive: input.taxInclusive ?? null,
      sstApplies: input.sstApplies ?? null,
    },
  });
}

async function ownedService(servicerId: string, serviceId: string) {
  const service = await prisma.servicerService.findFirst({
    where: { id: serviceId, servicerId, deletedAt: null },
  });
  if (!service) throw notFound('Listing not found');
  return service;
}

export async function updateService(
  servicerId: string,
  serviceId: string,
  input: Partial<ServiceInput>,
) {
  await ownedService(servicerId, serviceId);
  const data: Prisma.ServicerServiceUpdateInput = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.published !== undefined) data.published = input.published;
  if (input.basePrice !== undefined) data.basePrice = input.basePrice;
  if (input.priceType !== undefined) data.priceType = input.priceType;
  if (input.taxMode !== undefined) data.taxMode = input.taxMode;
  if (input.taxName !== undefined) data.taxName = input.taxName;
  if (input.taxRate !== undefined) data.taxRate = input.taxRate;
  if (input.estimatedDurationMinutes !== undefined) {
    data.estimatedDurationMinutes = input.estimatedDurationMinutes;
  }
  if (input.servicerSku !== undefined) {
    await checkSku(servicerId, input.servicerSku || undefined, serviceId);
    data.servicerSku = input.servicerSku || null;
  }
  if (input.listingMode !== undefined) data.listingMode = input.listingMode;
  if (input.autoAccept !== undefined) data.autoAccept = input.autoAccept;
  if (input.autoAcceptMessage !== undefined) data.autoAcceptMessage = input.autoAcceptMessage;
  if (input.moduleRefs !== undefined) {
    data.moduleRefs = moduleRefsSchema.parse(input.moduleRefs) as Prisma.InputJsonValue;
  }
  if (input.modifiers !== undefined) {
    data.modifiers = optionPriceMapSchema.parse(input.modifiers) as Prisma.InputJsonValue;
  }
  if (input.subcategoryId !== undefined || input.newSubcategoryName !== undefined) {
    const categoryId = await resolveServiceCategory(
      servicerId,
      input.subcategoryId,
      input.newSubcategoryName,
    );
    data.category = { connect: { id: categoryId } };
  }
  if (input.serviceChargeRate !== undefined) data.serviceChargeRate = input.serviceChargeRate;
  if (input.taxInclusive !== undefined) data.taxInclusive = input.taxInclusive;
  if (input.sstApplies !== undefined) data.sstApplies = input.sstApplies;
  return prisma.servicerService.update({ where: { id: serviceId }, data });
}

export async function deleteService(servicerId: string, serviceId: string) {
  await ownedService(servicerId, serviceId);
  await prisma.servicerService.update({
    where: { id: serviceId },
    data: { deletedAt: new Date() },
  });
}

/** Toggle and configure auto-accept on a service. JSON conditions validated. */
export async function configureAutoAccept(
  servicerId: string,
  serviceId: string,
  input: { autoAccept: boolean; autoAcceptConditions?: unknown; autoAcceptPresetId?: string },
) {
  await ownedService(servicerId, serviceId);
  let conditions: Prisma.InputJsonValue | undefined;
  if (input.autoAccept) {
    if (!input.autoAcceptConditions) {
      throw badRequest('autoAcceptConditions are required when enabling auto-accept');
    }
    conditions = autoAcceptConditionsSchema.parse(input.autoAcceptConditions);
  }
  return prisma.servicerService.update({
    where: { id: serviceId },
    data: {
      autoAccept: input.autoAccept,
      autoAcceptConditions: conditions ?? undefined,
      autoAcceptPresetId: input.autoAcceptPresetId ?? null,
    },
  });
}

// ── Proposal presets ─────────────────────────────────────────────────────────

export async function listPresets(servicerId: string) {
  return prisma.servicerProposalPreset.findMany({
    where: { servicerId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createPreset(
  servicerId: string,
  input: { name: string; message: string; priceOffset?: number; isDefault?: boolean },
) {
  const count = await prisma.servicerProposalPreset.count({ where: { servicerId } });
  if (count >= PRESET_LIMIT) {
    throw conflict(`Preset limit reached (${PRESET_LIMIT} in V1)`);
  }
  if (input.isDefault) {
    await prisma.servicerProposalPreset.updateMany({
      where: { servicerId },
      data: { isDefault: false },
    });
  }
  return prisma.servicerProposalPreset.create({
    data: {
      servicerId,
      name: input.name,
      message: input.message,
      priceOffset: input.priceOffset ?? null,
      isDefault: Boolean(input.isDefault),
      sortOrder: count,
    },
  });
}

export async function updatePreset(
  servicerId: string,
  presetId: string,
  input: {
    name?: string;
    message?: string;
    priceOffset?: number | null;
    isDefault?: boolean;
    sortOrder?: number;
  },
) {
  const preset = await prisma.servicerProposalPreset.findFirst({
    where: { id: presetId, servicerId },
  });
  if (!preset) throw notFound('Preset not found');
  if (input.isDefault) {
    await prisma.servicerProposalPreset.updateMany({
      where: { servicerId },
      data: { isDefault: false },
    });
  }
  return prisma.servicerProposalPreset.update({
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

export async function deletePreset(servicerId: string, presetId: string) {
  const preset = await prisma.servicerProposalPreset.findFirst({
    where: { id: presetId, servicerId },
  });
  if (!preset) throw notFound('Preset not found');
  await prisma.servicerProposalPreset.delete({ where: { id: presetId } });
}
