import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { notFound } from '../lib/errors';

/** Public category browsing endpoints. */
export const categoriesRouter = Router();

/**
 * GET /categories — published categories.
 * Default: top-level parents (grouping). With `?parent=<slug>`: that parent's
 * published children (the quotable services). With `?scope=all`: every published
 * category (parents AND children) in one call — used by the quote-form
 * Category/Type-of-service dropdowns and the home search. Each row carries
 * `parentCategoryId` (null for parents) so the client can group children under
 * parents. `activeListingCount` counts active listings on each returned category.
 */
categoriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parentSlug = typeof req.query.parent === 'string' ? req.query.parent.trim() : '';
    const scopeAll = req.query.scope === 'all';
    let parentFilter: { parentCategoryId?: string | null } = { parentCategoryId: null };
    if (scopeAll) {
      // both parents and children in one response
      parentFilter = {};
    } else if (parentSlug) {
      const parent = await prisma.category.findFirst({
        where: { slug: parentSlug, deletedAt: null, published: true },
        select: { id: true },
      });
      if (!parent) throw notFound('Category not found');
      parentFilter = { parentCategoryId: parent.id };
    }
    const categories = await prisma.category.findMany({
      where: { deletedAt: null, published: true, ...parentFilter },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { services: { where: { deletedAt: null } } },
        },
      },
    });
    res.json({
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        parentCategoryId: c.parentCategoryId,
        icon: c.icon,
        imageUrl: c.imageUrl,
        bannerUrl: c.bannerUrl,
        cardColor: c.cardColor,
        description: c.description,
        defaultPriceSuggestion: c.defaultPriceSuggestion,
        defaultEstimatedDurationMinutes: c.defaultEstimatedDurationMinutes,
        questionSchema: c.questionSchema ?? null,
        published: c.published,
        activeListingCount: c._count.services,
      })),
    });
  }),
);

/** GET /categories/:slug — single category + active servicer count. */
categoriesRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({
      where: { slug: req.params.slug, deletedAt: null, published: true },
    });
    if (!category) throw notFound('Category not found');

    const servicerCount = await prisma.servicer.count({
      where: { deletedAt: null, isBanned: false, categoryId: category.id },
    });

    res.json({
      id: category.id,
      name: category.name,
      slug: category.slug,
      icon: category.icon,
      imageUrl: category.imageUrl,
      bannerUrl: category.bannerUrl,
      cardColor: category.cardColor,
      description: category.description,
      defaultPriceSuggestion: category.defaultPriceSuggestion,
      defaultEstimatedDurationMinutes: category.defaultEstimatedDurationMinutes,
      servicerCount,
    });
  }),
);

/** GET /categories/:slug/servicers — servicers offering this category. */
categoriesRouter.get(
  '/:slug/servicers',
  asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({
      where: { slug: req.params.slug, deletedAt: null, published: true },
    });
    if (!category) throw notFound('Category not found');

    const servicers = await prisma.servicer.findMany({
      where: { deletedAt: null, isBanned: false, categoryId: category.id },
      include: { services: { where: { deletedAt: null } } },
    });

    res.json({
      data: servicers.map((m) => ({
        id: m.id,
        businessName: m.businessName,
        bio: m.bio,
        rating: m.rating,
        logoUrl: m.logoUrl,
        serviceAreas: m.serviceAreas,
        services: m.services.map((s) => ({
          id: s.id,
          title: s.title,
          basePrice: s.basePrice,
          priceType: s.priceType,
          sku: s.servicerSku,
        })),
      })),
    });
  }),
);
