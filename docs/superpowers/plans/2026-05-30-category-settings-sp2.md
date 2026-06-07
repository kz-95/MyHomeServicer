# Category Settings SP2 — Category CRUD + Question Schema Editor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully-functional admin Category Settings page with CRUD + drag-drop Question Schema editor, enforce immutable keys/values + soft-deactivate on the backend, and filter `active: false` questions/options in all three consumers.

**Architecture:** Backend-first. Zod schema + immutability check go in `json-schemas.ts` as pure library code. Four new/extended admin endpoints. Frontend rewrites `category-settings.component.ts` as a master-detail page (searchable list + wide modal editor). Consumers updated in one pass after backend is stable.

**Tech Stack:** Node/Express/Prisma/Zod, Jest (unit tests), Angular 17 signals, `@angular/cdk` drag-drop.

---

## File Map

| Action | Path | What changes |
|--------|------|--------------|
| Modify | `backend/src/lib/json-schemas.ts` | Add `questionSchemaSchema`, `QuestionItem`, `QuestionOption`, `checkQuestionSchemaImmutability` |
| Create | `backend/tests/unit/question-schema.test.ts` | Unit tests for schema validation + immutability check |
| Modify | `backend/src/routes/admin.routes.ts` | Extend PATCH, add POST / DELETE / GET-impact for categories; add `Prisma` import |
| Modify | `backend/src/services/servicer-quote.service.ts` | Add `active` field to `QuestionSchemaItem`; filter inactive questions in `computePrefill` |
| Modify | `frontend/src/app/customer/pages/quote-form.component.ts` | Add `active?` to `QuoteQuestion`; filter inactive questions + options |
| Modify | `frontend/src/app/servicer/pages/services.component.ts` | Add `active?` to type; filter inactive questions + options |
| Modify | `frontend/package.json` + lockfile | Add `@angular/cdk@^17.3.0` |
| Rewrite | `frontend/src/app/admin/pages/category-settings.component.ts` | Master-detail page (replaces SP1 tabs) |
| Modify | `docs/ai-context/schema-notes.md` | Document questionSchema shape + soft-delete |
| Modify | `docs/api-reference/api-doc.md` | Document four new/changed category endpoints |
| Modify | `docs/ai-context/tech-stack.md` | Add `@angular/cdk` entry |
| Modify | `TODO.md` | Mark SP2 complete |

---

## Task 1 — Add `questionSchemaSchema` + immutability check to json-schemas.ts

**Files:**
- Modify: `backend/src/lib/json-schemas.ts`

- [ ] **Step 1: Append these exports after the last export in the file**

```typescript
// ── Category.questionSchema ────────────────────────────────────────────────

/** One option inside a radio/checkbox question. `value` is immutable after first save. */
export const questionOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  sortOrder: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

/** One question in a category's question schema. `key` is immutable after first save. */
export const questionItemSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['checkbox', 'radio', 'text']),
  required: z.boolean().optional(),
  priced: z.boolean().optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
  options: z.array(questionOptionSchema).optional(),
});

export const questionSchemaSchema = z.array(questionItemSchema);

export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type QuestionItem = z.infer<typeof questionItemSchema>;
export type QuestionSchema = z.infer<typeof questionSchemaSchema>;

/**
 * Compares an incoming questionSchema against the currently-stored one.
 * Returns an error string if any existing `key` or option `value` was removed or
 * renamed (immutability violation). Returns null when the payload is safe to save.
 * Adding new questions/options and editing labels/flags/active is always allowed.
 */
export function checkQuestionSchemaImmutability(
  existing: QuestionSchema,
  incoming: QuestionSchema,
): string | null {
  for (const existingQ of existing) {
    const incomingQ = incoming.find((q) => q.key === existingQ.key);
    if (!incomingQ) {
      return `Question key "${existingQ.key}" cannot be removed — set active: false to deactivate it.`;
    }
    for (const existingOpt of existingQ.options ?? []) {
      const found = (incomingQ.options ?? []).find((o) => o.value === existingOpt.value);
      if (!found) {
        return `Option value "${existingOpt.value}" in question "${existingQ.key}" cannot be removed — set active: false to deactivate it.`;
      }
    }
  }
  return null;
}
```

- [ ] **Step 2: Run tsc to confirm no errors**

```
cd backend && npx tsc --noEmit
```
Expected: `TypeScript: No errors found`

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/json-schemas.ts
git commit -m "feat: add questionSchemaSchema Zod + immutability check to json-schemas"
```

---

## Task 2 — Unit tests for questionSchemaSchema + immutability check

**Files:**
- Create: `backend/tests/unit/question-schema.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import {
  questionSchemaSchema,
  checkQuestionSchemaImmutability,
  QuestionSchema,
} from '../../src/lib/json-schemas';

const base: QuestionSchema = [
  {
    key: 'rooms',
    label: 'Number of rooms',
    type: 'radio',
    priced: true,
    options: [
      { value: '1', label: '1 room' },
      { value: '2', label: '2 rooms' },
    ],
  },
  {
    key: 'notes',
    label: 'Special notes',
    type: 'text',
  },
];

// ── questionSchemaSchema ──────────────────────────────────────────────────────

describe('questionSchemaSchema — valid', () => {
  it('parses minimal item', () => {
    expect(questionSchemaSchema.safeParse([{ key: 'q', label: 'Q', type: 'text' }]).success).toBe(true);
  });
  it('parses full schema', () => {
    expect(questionSchemaSchema.safeParse(base).success).toBe(true);
  });
  it('accepts active: false on question and option', () => {
    const s = [{ key: 'q', label: 'Q', type: 'radio', active: false,
      options: [{ value: 'a', label: 'A', active: false }] }];
    expect(questionSchemaSchema.safeParse(s).success).toBe(true);
  });
  it('accepts empty array', () => {
    expect(questionSchemaSchema.safeParse([]).success).toBe(true);
  });
});

describe('questionSchemaSchema — invalid', () => {
  it('rejects unsupported type', () => {
    expect(questionSchemaSchema.safeParse([{ key: 'q', label: 'Q', type: 'select' }]).success).toBe(false);
  });
  it('rejects empty key', () => {
    expect(questionSchemaSchema.safeParse([{ key: '', label: 'Q', type: 'text' }]).success).toBe(false);
  });
  it('rejects empty option value', () => {
    const s = [{ key: 'q', label: 'Q', type: 'checkbox', options: [{ value: '', label: 'A' }] }];
    expect(questionSchemaSchema.safeParse(s).success).toBe(false);
  });
});

// ── checkQuestionSchemaImmutability ──────────────────────────────────────────

describe('immutability — allowed changes', () => {
  it('returns null for identical schema', () => {
    expect(checkQuestionSchemaImmutability(base, base)).toBeNull();
  });
  it('returns null when label changed', () => {
    const updated = base.map((q) =>
      q.key === 'rooms' ? { ...q, label: 'Rooms (updated)' } : q,
    );
    expect(checkQuestionSchemaImmutability(base, updated)).toBeNull();
  });
  it('returns null when new question added', () => {
    expect(checkQuestionSchemaImmutability(base, [...base, { key: 'extra', label: 'Extra', type: 'text' as const }])).toBeNull();
  });
  it('returns null when new option added', () => {
    const updated = base.map((q) =>
      q.key === 'rooms' ? { ...q, options: [...(q.options ?? []), { value: '3', label: '3 rooms' }] } : q,
    );
    expect(checkQuestionSchemaImmutability(base, updated)).toBeNull();
  });
  it('returns null when question set active: false', () => {
    const updated = base.map((q) => q.key === 'rooms' ? { ...q, active: false as const } : q);
    expect(checkQuestionSchemaImmutability(base, updated)).toBeNull();
  });
  it('returns null when option set active: false', () => {
    const updated = base.map((q) =>
      q.key === 'rooms'
        ? { ...q, options: q.options!.map((o) => o.value === '1' ? { ...o, active: false as const } : o) }
        : q,
    );
    expect(checkQuestionSchemaImmutability(base, updated)).toBeNull();
  });
});

describe('immutability — violations', () => {
  it('errors when question key removed', () => {
    const err = checkQuestionSchemaImmutability(base, base.filter((q) => q.key !== 'notes'));
    expect(err).toMatch(/notes/);
  });
  it('errors when option value removed', () => {
    const updated = base.map((q) =>
      q.key === 'rooms' ? { ...q, options: [{ value: '2', label: '2 rooms' }] } : q,
    );
    expect(checkQuestionSchemaImmutability(base, updated)).toMatch(/"1"/);
  });
  it('errors when all questions removed', () => {
    expect(checkQuestionSchemaImmutability(base, [])).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests**

```
cd backend && npx jest tests/unit/question-schema.test.ts --no-coverage
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/unit/question-schema.test.ts
git commit -m "test: unit tests for questionSchemaSchema and immutability check"
```

---

## Task 3 — Extend PATCH /admin/categories/:id

**Files:**
- Modify: `backend/src/routes/admin.routes.ts`

The existing handler (around line 252) only accepts `imageUrl` and `allowedTimeSlots`. Extend it to accept `name`, `icon`, `defaultPriceSuggestion`, `defaultEstimatedDurationMinutes`, and `questionSchema`.

- [ ] **Step 1: Add `Prisma` import at the top of admin.routes.ts (after the existing imports)**

```typescript
import { Prisma } from '@prisma/client';
```

- [ ] **Step 2: Add `questionSchemaSchema` and `checkQuestionSchemaImmutability` to the json-schemas import**

The existing line imports from `../lib/json-schemas` — find it and add the new exports. The line will look like:

```typescript
import {
  questionSchemaSchema,
  checkQuestionSchemaImmutability,
  /* any other imports already there */
} from '../lib/json-schemas';
```

If no json-schemas import exists yet, add the line fresh:
```typescript
import { questionSchemaSchema, checkQuestionSchemaImmutability } from '../lib/json-schemas';
```

- [ ] **Step 3: Replace the full PATCH /categories/:id handler (lines ~252-283)**

```typescript
/** PATCH /admin/categories/:id — update category fields. PIN-gated. */
adminRouter.patch(
  '/categories/:id',
  requirePin,
  validate([
    body('name').optional().isString().trim().notEmpty(),
    body('icon').optional({ values: 'null' }).isString(),
    body('imageUrl').optional({ values: 'null' }).isString(),
    body('allowedTimeSlots').optional().isArray(),
    body('allowedTimeSlots.*').optional().isString(),
    body('defaultPriceSuggestion').optional({ values: 'null' }).isFloat({ min: 0 }),
    body('defaultEstimatedDurationMinutes').optional({ values: 'null' }).isInt({ min: 1 }),
    body('questionSchema').optional().isArray(),
  ]),
  asyncHandler(async (req, res) => {
    const cat = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!cat) throw notFound('Category not found');

    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.icon !== undefined) data.icon = req.body.icon ?? null;
    if (req.body.imageUrl !== undefined) data.imageUrl = req.body.imageUrl ?? null;
    if (req.body.allowedTimeSlots !== undefined) data.allowedTimeSlots = req.body.allowedTimeSlots;
    if (req.body.defaultPriceSuggestion !== undefined)
      data.defaultPriceSuggestion = req.body.defaultPriceSuggestion != null
        ? new Prisma.Decimal(req.body.defaultPriceSuggestion) : null;
    if (req.body.defaultEstimatedDurationMinutes !== undefined)
      data.defaultEstimatedDurationMinutes = req.body.defaultEstimatedDurationMinutes ?? null;

    if (req.body.questionSchema !== undefined) {
      const parsed = questionSchemaSchema.safeParse(req.body.questionSchema);
      if (!parsed.success) throw badRequest('Invalid questionSchema: ' + parsed.error.message);

      if (cat.questionSchema != null) {
        const existingParsed = questionSchemaSchema.safeParse(cat.questionSchema);
        if (existingParsed.success) {
          const err = checkQuestionSchemaImmutability(existingParsed.data, parsed.data);
          if (err) throw badRequest(err);
        }
      }
      data.questionSchema = parsed.data;
    }

    const updated = await prisma.category.update({ where: { id: req.params.id }, data });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'category.update',
      entityType: 'Category',
      entityId: req.params.id,
      oldValue: {
        name: cat.name, icon: cat.icon, imageUrl: cat.imageUrl,
        allowedTimeSlots: cat.allowedTimeSlots,
        defaultPriceSuggestion: cat.defaultPriceSuggestion,
        questionSchema: cat.questionSchema,
      },
      newValue: {
        name: updated.name, icon: updated.icon, imageUrl: updated.imageUrl,
        allowedTimeSlots: updated.allowedTimeSlots,
        defaultPriceSuggestion: updated.defaultPriceSuggestion,
        questionSchema: updated.questionSchema,
      },
      ipAddress: ip(req),
    });
    res.json(updated);
  }),
);
```

- [ ] **Step 4: Run tsc**

```
cd backend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.routes.ts
git commit -m "feat: extend PATCH /admin/categories/:id — name, icon, questionSchema, defaults"
```

---

## Task 4 — Add POST /admin/categories

**Files:**
- Modify: `backend/src/routes/admin.routes.ts`

- [ ] **Step 1: Add a slug helper function near the top of the categories section (before or after the PATCH handler)**

```typescript
function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
}
```

- [ ] **Step 2: Add POST /admin/categories after the PATCH handler**

```typescript
/** POST /admin/categories — create a new category. PIN-gated. */
adminRouter.post(
  '/categories',
  requirePin,
  validate([
    body('name').isString().trim().notEmpty().withMessage('name is required'),
    body('slug').optional().isString().trim(),
    body('icon').optional().isString(),
    body('imageUrl').optional().isString(),
    body('parentCategoryId').optional({ values: 'null' }).isUUID(),
    body('defaultPriceSuggestion').optional({ values: 'null' }).isFloat({ min: 0 }),
    body('defaultEstimatedDurationMinutes').optional({ values: 'null' }).isInt({ min: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    const slug = req.body.slug ? req.body.slug.toLowerCase().trim() : toSlug(req.body.name);
    if (!slug) throw badRequest('Could not derive a valid slug from the name.');

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) throw badRequest(`Slug "${slug}" is already taken.`);

    const created = await prisma.category.create({
      data: {
        name: req.body.name,
        slug,
        icon: req.body.icon ?? null,
        imageUrl: req.body.imageUrl ?? null,
        parentCategoryId: req.body.parentCategoryId ?? null,
        defaultPriceSuggestion: req.body.defaultPriceSuggestion != null
          ? new Prisma.Decimal(req.body.defaultPriceSuggestion) : null,
        defaultEstimatedDurationMinutes: req.body.defaultEstimatedDurationMinutes ?? null,
        questionSchema: [],
        allowedTimeSlots: ['morning', 'noon', 'afternoon', 'evening', 'night'],
      },
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'category.create',
      entityType: 'Category',
      entityId: created.id,
      oldValue: null,
      newValue: { name: created.name, slug: created.slug },
      ipAddress: ip(req),
    });
    res.status(201).json(created);
  }),
);
```

- [ ] **Step 3: Run tsc**

```
cd backend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin.routes.ts
git commit -m "feat: add POST /admin/categories endpoint"
```

---

## Task 5 — Add DELETE /admin/categories/:id (soft-delete + guard)

**Files:**
- Modify: `backend/src/routes/admin.routes.ts`

`QuoteStatus` values: `open | matched | expired | cancelled | reposted`. Block on `open`, `matched`, `reposted`.

- [ ] **Step 1: Add DELETE handler after the POST handler**

```typescript
/** DELETE /admin/categories/:id — soft-delete. Blocked when active listings or open
 *  quote requests exist. PIN-gated. */
adminRouter.delete(
  '/categories/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const cat = await prisma.category.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!cat) throw notFound('Category not found');
    if (cat.deletedAt) throw badRequest('Category is already deleted.');

    const activeService = await prisma.merchantService.findFirst({
      where: { categoryId: req.params.id, deletedAt: null },
      select: { id: true },
    });
    if (activeService) {
      throw badRequest('Cannot delete: active service listings exist for this category. Remove them first.');
    }

    const openQuote = await prisma.quoteRequest.findFirst({
      where: { categoryId: req.params.id, status: { in: ['open', 'matched', 'reposted'] } },
      select: { id: true },
    });
    if (openQuote) {
      throw badRequest('Cannot delete: open quote requests exist for this category.');
    }

    const deleted = await prisma.category.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'admin',
      action: 'category.delete',
      entityType: 'Category',
      entityId: req.params.id,
      oldValue: { name: cat.name },
      newValue: { deletedAt: deleted.deletedAt },
      ipAddress: ip(req),
    });
    res.json({ ok: true });
  }),
);
```

- [ ] **Step 2: Run tsc**

```
cd backend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/admin.routes.ts
git commit -m "feat: add DELETE /admin/categories/:id with soft-delete + listing guard"
```

---

## Task 6 — Add GET /admin/categories/:id/question-impact

**Files:**
- Modify: `backend/src/routes/admin.routes.ts`

Uses `prisma.$queryRaw` with PostgreSQL `?` (JSONB hasKey) operator because Prisma's standard filters don't expose it.

- [ ] **Step 1: Add the endpoint after the DELETE handler**

```typescript
/** GET /admin/categories/:id/question-impact?key=<questionKey>
 *  Returns { key, count } — number of MerchantService rows whose modifiers JSONB
 *  contains the given question key. Used by the editor to warn before deactivating
 *  a question or flipping its priced flag. */
adminRouter.get(
  '/categories/:id/question-impact',
  asyncHandler(async (req, res) => {
    const { key } = req.query;
    if (!key || typeof key !== 'string') throw badRequest('key query param is required');

    const cat = await prisma.category.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!cat) throw notFound('Category not found');

    const rows = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM merchant_services
      WHERE category_id = ${req.params.id}::uuid
        AND deleted_at IS NULL
        AND modifiers ? ${key}
    `;
    res.json({ key, count: Number(rows[0].count) });
  }),
);
```

- [ ] **Step 2: Run tsc**

```
cd backend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/admin.routes.ts
git commit -m "feat: add GET /admin/categories/:id/question-impact endpoint"
```

---

## Task 7 — Add `active` filter to all three consumers

**Files:**
- Modify: `backend/src/services/servicer-quote.service.ts`
- Modify: `frontend/src/app/customer/pages/quote-form.component.ts`
- Modify: `frontend/src/app/servicer/pages/services.component.ts`

- [ ] **Step 1: Update `QuestionSchemaItem` in servicer-quote.service.ts (line ~71)**

```typescript
interface QuestionSchemaItem {
  key: string;
  label: string;
  type: string;
  priced?: boolean;
  active?: boolean;
  options?: { value: string; label: string; active?: boolean }[];
}
```

- [ ] **Step 2: Update `computePrefill` in servicer-quote.service.ts (line ~97)**

Change:
```typescript
const pricedQuestions = (questionSchema ?? []).filter((q) => q.priced === true);
```
To:
```typescript
const pricedQuestions = (questionSchema ?? []).filter((q) => q.priced === true && q.active !== false);
```

- [ ] **Step 3: Update `QuoteQuestion` interface in quote-form.component.ts (line ~13)**

```typescript
interface QuoteQuestion {
  key: string;
  label: string;
  type: 'checkbox' | 'radio' | 'text';
  required: boolean;
  description?: string;
  active?: boolean;
  options?: { value: string; label: string; active?: boolean }[];
}
```

- [ ] **Step 4: Update `questions` computed in quote-form.component.ts (line ~919)**

```typescript
questions = computed<QuoteQuestion[]>(() => {
  const cat = this.categories().find((c) => c.id === this.categoryId());
  return (cat?.questionSchema ?? []).filter((q) => q.active !== false);
});
```

- [ ] **Step 5: In quote-form.component.ts template, filter inactive options when rendering**

Find every `@for` that iterates `q.options` and change the iterable to filter active:

```html
@for (opt of (q.options ?? []).filter(o => o.active !== false); track opt.value) {
```

There may be multiple spots (for radio and checkbox). Update all of them.

- [ ] **Step 6: Update the priced-question filter in services.component.ts (line ~860)**

Find:
```typescript
const priced = cat.questionSchema
  .filter((q) => q.priced === true && Array.isArray(q.options) && q.options!.length > 0)
```
Change to:
```typescript
const priced = cat.questionSchema
  .filter((q) => q.priced === true && q.active !== false && Array.isArray(q.options) && q.options!.length > 0)
```

- [ ] **Step 7: Update the `CategoryQuestion` type in services.component.ts to include `active?`**

Find the interface around line 67 that has `priced?: boolean` and add:
```typescript
active?: boolean;
```

Also update the options type used in `pricedQuestions` signal to include `active?: boolean` and filter when mapping:
```typescript
options: (q.options ?? []).filter((o) => o.active !== false) as { value: string; label: string }[],
```

- [ ] **Step 8: Run both tsc checks**

```
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```
Expected: 0 errors each.

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/servicer-quote.service.ts \
        frontend/src/app/customer/pages/quote-form.component.ts \
        frontend/src/app/servicer/pages/services.component.ts
git commit -m "feat: filter active !== false questions/options in all three consumers"
```

---

## Task 8 — Install @angular/cdk

- [ ] **Step 1: Check the exact Angular version in use**

```
node -e "const p = require('./frontend/package.json'); console.log(p.dependencies['@angular/core']);"
```
Expected output: `^17.3.0` (or similar 17.3.x).

- [ ] **Step 2: Install matching CDK version**

```
cd frontend && npm install @angular/cdk@^17.3.0
```

- [ ] **Step 3: Verify CDK is importable**

```
cd frontend && node -e "require('@angular/cdk/drag-drop'); console.log('CDK OK');"
```
Expected: `CDK OK`

- [ ] **Step 4: Run tsc**

```
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: add @angular/cdk for drag-drop in question schema editor"
```

---

## Task 9 — Rewrite category-settings.component.ts as master-detail

SP1's tab layout (Question Schema placeholder | Budget Ranges | Time Slots) is **replaced** by a master-detail page: searchable category list + wide modal editor (Basics | Question Schema | Budget Ranges | Time Slots sections).

**Files:**
- Rewrite: `frontend/src/app/admin/pages/category-settings.component.ts`

- [ ] **Step 1: Write the full component**

```typescript
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ApiService } from '../../core/services/api.service';
import { PinService } from '../../core/services/pin.service';
import { ModalComponent } from '../../shared/modal.component';

// ── Domain types ─────────────────────────────────────────────────────────────

interface QuestionOption {
  value: string;
  label: string;
  sortOrder?: number;
  active?: boolean;
}

interface QuestionItem {
  key: string;
  label: string;
  type: 'checkbox' | 'radio' | 'text';
  required?: boolean;
  priced?: boolean;
  description?: string;
  sortOrder?: number;
  active?: boolean;
  options?: QuestionOption[];
}

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  imageUrl?: string | null;
  parentCategoryId?: string | null;
  defaultPriceSuggestion?: string | null;
  defaultEstimatedDurationMinutes?: number | null;
  questionSchema?: QuestionItem[] | null;
  allowedTimeSlots?: string[];
  deletedAt?: string | null;
}

interface RangeRow {
  min: number | null;
  max: number | null;
}

const ALL_TIME_SLOTS = ['morning', 'noon', 'afternoon', 'evening', 'night'];
const TIME_SLOT_LABELS: Record<string, string> = {
  morning: 'Morning', noon: 'Noon', afternoon: 'Afternoon', evening: 'Evening', night: 'Night',
};

type DetailSection = 'basics' | 'schema' | 'budget' | 'slots';

interface QForm {
  label: string;
  type: 'checkbox' | 'radio' | 'text';
  required: boolean;
  priced: boolean;
  description: string;
  options: Array<{ value: string; label: string; active: boolean; isNew: boolean }>;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-admin-category-settings',
  standalone: true,
  host: { class: 'page-enter' },
  imports: [CommonModule, FormsModule, DragDropModule, ModalComponent],
  template: `
    <h1>Category Settings</h1>

    <div class="list-toolbar">
      <input class="search-input" type="text" placeholder="Search categories…"
             [(ngModel)]="searchQuery" name="search" (ngModelChange)="onSearch()" />
      <button class="btn-primary btn-sm" (click)="openNew()">+ New category</button>
    </div>

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (loadFailed()) {
      <p class="err">Could not load categories. Refresh and try again.</p>
    } @else {
      <div class="cat-list">
        @for (cat of filteredCategories(); track cat.id) {
          <div class="cat-row">
            <span class="cat-name">{{ cat.name }}</span>
            <span class="cat-slug muted small">{{ cat.slug }}</span>
            <div class="cat-actions">
              <button class="btn-ghost btn-xs" (click)="openEdit(cat)">Edit</button>
              <button class="btn-ghost btn-xs danger" (click)="confirmDelete(cat)"
                      [disabled]="deletingId() === cat.id">
                {{ deletingId() === cat.id ? '…' : 'Delete' }}
              </button>
            </div>
          </div>
        } @empty {
          <p class="muted pad">No categories found.</p>
        }
      </div>
    }

    @if (deleteError()) { <p class="err top-gap">{{ deleteError() }}</p> }

    <!-- ═══════════ Editor modal ═══════════ -->
    @if (editorOpen()) {
      <app-modal [open]="true" [wide]="true"
                 [title]="editTarget() ? 'Edit — ' + editTarget()!.name : 'New category'"
                 (closed)="closeEditor()">

        <div class="section-tabs">
          <button class="stab" [class.active]="section() === 'basics'" (click)="section.set('basics')">Basics</button>
          <button class="stab" [class.active]="section() === 'schema'" (click)="section.set('schema')">Question Schema</button>
          <button class="stab" [class.active]="section() === 'budget'" (click)="section.set('budget')">Budget Ranges</button>
          <button class="stab" [class.active]="section() === 'slots'" (click)="section.set('slots')">Time Slots</button>
        </div>

        <!-- ── Basics ── -->
        @if (section() === 'basics') {
          <div class="section-body">
            <label>Name *<input [(ngModel)]="basics.name" name="cname" required /></label>
            @if (!editTarget()) {
              <label>Slug <span class="muted small">(optional — auto-generated from name)</span>
                <input [(ngModel)]="basics.slug" name="cslug" />
              </label>
            } @else {
              <div class="field-readonly">
                <span class="small muted">Slug (locked after creation)</span>
                <span class="mono">{{ editTarget()!.slug }}</span>
              </div>
            }
            <label>Icon <span class="muted small">(icon name from icon set, e.g. wrench)</span>
              <input [(ngModel)]="basics.icon" name="cicon" />
            </label>
            <label>Image URL<input [(ngModel)]="basics.imageUrl" name="cimgurl" /></label>
            <label>Default price suggestion (RM)
              <input type="number" min="0" step="0.01" [(ngModel)]="basics.defaultPriceSuggestion" name="cprice" />
            </label>
            <label>Default estimated duration (minutes)
              <input type="number" min="1" [(ngModel)]="basics.defaultEstimatedDurationMinutes" name="cdur" />
            </label>
            @if (basicsError()) { <p class="err">{{ basicsError() }}</p> }
            <div class="modal-actions">
              <button class="btn-ghost" (click)="closeEditor()">Cancel</button>
              <button class="btn-primary" (click)="saveBasics()" [disabled]="savingBasics()">
                {{ savingBasics() ? 'Saving…' : editTarget() ? 'Save basics' : 'Create category' }}
              </button>
            </div>
          </div>
        }

        <!-- ── Question Schema ── -->
        @if (section() === 'schema') {
          <div class="section-body">
            @if (!editTarget()) {
              <p class="muted">Save basics first to enable schema editing.</p>
            } @else {
              <p class="muted small">Drag rows to reorder. Keys and option values are locked after first save — deactivate instead of removing.</p>

              <div cdkDropList (cdkDropListDropped)="dropQuestion($event)" class="schema-list">
                @for (q of editorSchema(); track q.key; let qi = $index) {
                  <div class="schema-item" [class.inactive]="q.active === false" cdkDrag>
                    <div class="schema-item-hd" cdkDragHandle>
                      <span class="drag-handle">⠿</span>
                      <strong class="q-label">{{ q.label }}</strong>
                      <span class="mono small muted">{{ q.key }}</span>
                      <span class="badge">{{ q.type }}</span>
                      @if (q.priced) { <span class="badge priced">priced</span> }
                      @if (q.active === false) { <span class="badge off">off</span> }
                    </div>
                    <div class="schema-item-actions">
                      <button class="btn-ghost btn-xs" (click)="openQuestionEditor(qi)">Edit</button>
                      <button class="btn-ghost btn-xs" (click)="toggleQuestionActive(qi)">
                        {{ q.active === false ? 'Activate' : 'Deactivate' }}
                      </button>
                    </div>
                  </div>
                }
              </div>

              <button class="btn-ghost btn-sm top-gap" (click)="openQuestionEditor(-1)">+ Add question</button>
              @if (schemaError()) { <p class="err">{{ schemaError() }}</p> }
              <div class="modal-actions">
                <button class="btn-primary" (click)="saveSchema()" [disabled]="savingSchema()">
                  {{ savingSchema() ? 'Saving…' : 'Save schema' }}
                </button>
              </div>
            }
          </div>
        }

        <!-- ── Budget Ranges ── -->
        @if (section() === 'budget') {
          <div class="section-body">
            @if (!editTarget()) {
              <p class="muted">Save basics first.</p>
            } @else {
              <p class="muted small">Budget brackets customers choose from on the quote form. Leave upper value blank for open-ended (e.g. RM 350+).</p>
              @for (r of currentRanges(); track $index) {
                <div class="range-row">
                  <span>RM</span>
                  <input type="number" min="0" [(ngModel)]="r.min" [name]="'rmin' + $index" />
                  <span>–</span>
                  <input type="number" min="0" [(ngModel)]="r.max" [name]="'rmax' + $index" placeholder="(open)" />
                  <button class="btn-ghost btn-xs" (click)="removeRange($index)">✕</button>
                </div>
              }
              <button class="btn-ghost btn-sm" (click)="addRange()">+ Add range</button>
              @if (budgetMsg()) { <p class="row-msg" [class.err]="budgetIsError()">{{ budgetMsg() }}</p> }
              <div class="modal-actions">
                <button class="btn-primary" (click)="saveBudgetRanges()" [disabled]="savingBudget()">
                  {{ savingBudget() ? 'Saving…' : 'Save budget ranges' }}
                </button>
              </div>
            }
          </div>
        }

        <!-- ── Time Slots ── -->
        @if (section() === 'slots') {
          <div class="section-body">
            @if (!editTarget()) {
              <p class="muted">Save basics first.</p>
            } @else {
              <p class="muted small">Toggle which time slots customers can book for this category.</p>
              <div class="slot-chips">
                @for (slot of ALL_TIME_SLOTS; track slot) {
                  <label class="slot-chip" [class.on]="editorSlots().has(slot)">
                    <input type="checkbox" [checked]="editorSlots().has(slot)"
                           (change)="toggleSlot(slot, $event)" hidden />
                    {{ TIME_SLOT_LABELS[slot] }}
                  </label>
                }
              </div>
              @if (slotsMsg()) { <p class="row-msg" [class.err]="slotsIsError()">{{ slotsMsg() }}</p> }
              <div class="modal-actions">
                <button class="btn-primary" (click)="saveSlots()" [disabled]="savingSlots()">
                  {{ savingSlots() ? 'Saving…' : 'Save time slots' }}
                </button>
              </div>
            }
          </div>
        }
      </app-modal>
    }

    <!-- ═══════════ Question editor modal ═══════════ -->
    @if (questionEditorOpen()) {
      <app-modal [open]="true"
                 [title]="editingQIdx() === -1 ? 'Add question' : 'Edit question'"
                 (closed)="questionEditorOpen.set(false)">
        <div class="q-form">
          <label>Label *<input [(ngModel)]="qf.label" name="ql" required /></label>

          @if (editingQIdx() === -1) {
            <p class="muted small">Key is auto-generated from the label on save and cannot be changed later.</p>
          } @else {
            <div class="field-readonly">
              <span class="small muted">Key (locked)</span>
              <span class="mono">{{ editorSchema()[editingQIdx()!].key }}</span>
            </div>
          }

          <label>Type
            <select [(ngModel)]="qf.type" name="qt">
              <option value="radio">Radio — pick one</option>
              <option value="checkbox">Checkbox — pick many</option>
              <option value="text">Text — free answer</option>
            </select>
          </label>
          <label class="inline-check">
            <input type="checkbox" [(ngModel)]="qf.required" name="qreq" /> Required
          </label>
          <label class="inline-check">
            <input type="checkbox" [(ngModel)]="qf.priced" name="qpriced" /> Priced (servicer sets per-option prices)
          </label>
          <label>Description (optional)<input [(ngModel)]="qf.description" name="qdesc" /></label>

          @if (qf.type !== 'text') {
            <div class="opts-section">
              <strong class="small">Options</strong>
              <div cdkDropList (cdkDropListDropped)="dropOption($event)" class="opts-list">
                @for (opt of qf.options; track $index; let oi = $index) {
                  <div class="opt-row" cdkDrag>
                    <span class="drag-handle" cdkDragHandle>⠿</span>
                    @if (!opt.isNew) {
                      <span class="mono small locked">{{ opt.value }}</span>
                      <input [(ngModel)]="opt.label" [name]="'ol' + oi" placeholder="Label" />
                      <label class="small inline-check">
                        <input type="checkbox" [checked]="opt.active" (change)="toggleOptionActive(oi, $event)" /> Active
                      </label>
                    } @else {
                      <input [(ngModel)]="opt.label" [name]="'ol' + oi" placeholder="Label (value auto-generated)" />
                    }
                    <button class="btn-ghost btn-xs" (click)="removeOption(oi)">✕</button>
                  </div>
                }
              </div>
              <button class="btn-ghost btn-xs top-gap" (click)="addOption()">+ Add option</button>
            </div>
          }

          @if (qFormError()) { <p class="err">{{ qFormError() }}</p> }
          <div class="modal-actions">
            <button class="btn-ghost" (click)="questionEditorOpen.set(false)">Cancel</button>
            <button class="btn-primary" (click)="saveQuestion()">
              {{ editingQIdx() === -1 ? 'Add question' : 'Update question' }}
            </button>
          </div>
        </div>
      </app-modal>
    }
  `,
  styles: [`
    :host { display: block; }
    .list-toolbar { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1.2rem; }
    .search-input { flex: 1; max-width: 320px; }
    .btn-primary { /* global */ }
    .btn-sm { font-size: 0.82rem; padding: 0.3rem 0.7rem; }
    .btn-xs { font-size: 0.75rem; padding: 0.2rem 0.5rem; }
    .btn-ghost { display: inline-flex; align-items: center; gap: 0.2rem; cursor: pointer; }
    .btn-ghost.danger { color: var(--color-danger); }
    .cat-list { border: 1px solid var(--color-border); border-radius: var(--radius-md, 6px); overflow: hidden; max-width: 680px; }
    .cat-row { display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0.8rem; border-bottom: 1px solid var(--color-border); }
    .cat-row:last-child { border-bottom: none; }
    .cat-name { flex: 1; font-size: 0.9rem; font-weight: 500; }
    .cat-slug { font-size: 0.78rem; }
    .cat-actions { display: flex; gap: 0.3rem; }
    .pad { padding: 0.8rem; }
    .top-gap { margin-top: 0.5rem; }
    .muted { color: var(--color-muted); }
    .small { font-size: 0.82rem; }
    .mono { font-family: monospace; font-size: 0.82rem; }
    .err { color: var(--color-danger); font-size: 0.85rem; }
    .row-msg { font-size: 0.8rem; color: var(--color-success); }
    .row-msg.err { color: var(--color-danger); }
    /* Section tabs inside modal */
    .section-tabs { display: flex; border-bottom: 1px solid var(--color-border); margin-bottom: 1rem; gap: 0; }
    .stab { background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px;
            padding: 0.5rem 1rem; font-size: 0.88rem; color: var(--color-muted); cursor: pointer; }
    .stab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }
    .section-body { display: flex; flex-direction: column; gap: 0.7rem; }
    .section-body label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; font-weight: 500; }
    .inline-check { flex-direction: row !important; align-items: center; gap: 0.4rem !important; font-weight: 400 !important; }
    .field-readonly { display: flex; flex-direction: column; gap: 0.2rem; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.6rem; }
    /* Schema list */
    .schema-list { display: flex; flex-direction: column; gap: 0.3rem; }
    .schema-item { border: 1px solid var(--color-border); border-radius: 4px; padding: 0.4rem 0.6rem;
                   display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: var(--color-bg); cursor: grab; }
    .schema-item.inactive { opacity: 0.5; }
    .schema-item-hd { display: flex; align-items: center; gap: 0.5rem; flex: 1; flex-wrap: wrap; cursor: grab; }
    .drag-handle { color: var(--color-muted); font-size: 1.1rem; line-height: 1; }
    .q-label { font-size: 0.88rem; }
    .schema-item-actions { display: flex; gap: 0.3rem; }
    .badge { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 999px; border: 1px solid var(--color-border); }
    .badge.priced { background: var(--color-primary-light); color: var(--color-primary); border-color: var(--color-primary-light); }
    .badge.off { background: var(--color-danger-bg, #f8edec); color: var(--color-danger); border-color: var(--color-danger-bg, #f8edec); }
    /* Budget ranges */
    .range-row { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem; }
    .range-row input { width: 100px; }
    /* Time slots */
    .slot-chips { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
    .slot-chip { font-size: 0.8rem; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid var(--color-border); cursor: pointer; user-select: none; }
    .slot-chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
    /* Question editor */
    .q-form { display: flex; flex-direction: column; gap: 0.7rem; }
    .q-form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; font-weight: 500; }
    .opts-section { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.6rem; background: var(--color-bg); border-radius: 4px; border: 1px solid var(--color-border); }
    .opts-list { display: flex; flex-direction: column; gap: 0.3rem; }
    .opt-row { display: flex; align-items: center; gap: 0.4rem; background: var(--color-surface, #fff); padding: 0.3rem 0.5rem; border-radius: 4px; border: 1px solid var(--color-border); }
    .opt-row input:not([type=checkbox]) { flex: 1; }
    .locked { min-width: 80px; }
    .cdk-drag-preview { box-shadow: 0 4px 16px rgba(0,0,0,0.15); opacity: 0.95; border-radius: 4px; }
    .cdk-drag-placeholder { opacity: 0.25; }
    .cdk-drop-list-dragging .schema-item:not(.cdk-drag-placeholder),
    .cdk-drop-list-dragging .opt-row:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0,0,0.2,1); }
  `],
})
export class AdminCategorySettingsComponent implements OnInit {
  private api = inject(ApiService);
  private pin = inject(PinService);

  // ── List ──
  loading = signal(true);
  loadFailed = signal(false);
  categories = signal<Category[]>([]);
  searchQuery = '';
  searchSignal = signal('');
  deletingId = signal<string | null>(null);
  deleteError = signal('');

  filteredCategories = computed(() =>
    this.categories().filter(
      (c) => !c.deletedAt &&
        (!this.searchSignal() || c.name.toLowerCase().includes(this.searchSignal().toLowerCase())),
    ),
  );

  onSearch(): void { this.searchSignal.set(this.searchQuery); }

  // ── Editor ──
  editorOpen = signal(false);
  editTarget = signal<Category | null>(null);
  section = signal<DetailSection>('basics');

  // ── Basics form ──
  basics = { name: '', slug: '', icon: '', imageUrl: '', defaultPriceSuggestion: null as number | null, defaultEstimatedDurationMinutes: null as number | null };
  basicsError = signal('');
  savingBasics = signal(false);

  // ── Schema ──
  editorSchema = signal<QuestionItem[]>([]);
  savingSchema = signal(false);
  schemaError = signal('');
  questionEditorOpen = signal(false);
  editingQIdx = signal<number>(-1);
  qf: QForm = { label: '', type: 'radio', required: false, priced: false, description: '', options: [] };
  qFormError = signal('');

  // ── Budget ranges ──
  private rawBudgetRanges = signal<Record<string, RangeRow[]>>({});
  currentRanges = signal<RangeRow[]>([]);
  savingBudget = signal(false);
  budgetMsg = signal('');
  budgetIsError = signal(false);

  // ── Time slots ──
  editorSlots = signal<Set<string>>(new Set());
  savingSlots = signal(false);
  slotsMsg = signal('');
  slotsIsError = signal(false);

  readonly ALL_TIME_SLOTS = ALL_TIME_SLOTS;
  readonly TIME_SLOT_LABELS = TIME_SLOT_LABELS;

  ngOnInit(): void {
    this.api.get<{ data: Category[] }>('/categories').subscribe({
      next: (r) => { this.categories.set(r.data ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.loadFailed.set(true); },
    });
    this.api.get<{ data: { key: string; value: unknown }[] }>('/admin/settings').subscribe({
      next: (r) => {
        const byKey = new Map(r.data.map((s) => [s.key, s.value]));
        const br = byKey.get('budget_ranges') as { ranges: Record<string, RangeRow[]> } | undefined;
        if (br?.ranges && !Array.isArray(br.ranges)) this.rawBudgetRanges.set(br.ranges);
      },
      error: () => {},
    });
  }

  // ── List actions ─────────────────────────────────────────────────────────────

  openNew(): void {
    this.editTarget.set(null);
    this.basics = { name: '', slug: '', icon: '', imageUrl: '', defaultPriceSuggestion: null, defaultEstimatedDurationMinutes: null };
    this.basicsError.set('');
    this.editorSchema.set([]);
    this.editorSlots.set(new Set(ALL_TIME_SLOTS));
    this.currentRanges.set([]);
    this.section.set('basics');
    this.editorOpen.set(true);
  }

  openEdit(cat: Category): void {
    this.editTarget.set(cat);
    this.basics = {
      name: cat.name, slug: cat.slug, icon: cat.icon ?? '', imageUrl: cat.imageUrl ?? '',
      defaultPriceSuggestion: cat.defaultPriceSuggestion != null ? Number(cat.defaultPriceSuggestion) : null,
      defaultEstimatedDurationMinutes: cat.defaultEstimatedDurationMinutes ?? null,
    };
    this.basicsError.set('');
    this.editorSchema.set(JSON.parse(JSON.stringify(cat.questionSchema ?? [])));
    this.editorSlots.set(new Set(cat.allowedTimeSlots ?? ALL_TIME_SLOTS));
    const raw = this.rawBudgetRanges();
    this.currentRanges.set(raw[cat.id] ? raw[cat.id].map((r) => ({ ...r })) : []);
    this.section.set('basics');
    this.editorOpen.set(true);
  }

  closeEditor(): void { this.editorOpen.set(false); }

  confirmDelete(cat: Category): void {
    if (!confirm(`Delete "${cat.name}"? This is permanent if no listings/quotes exist.`)) return;
    this.deleteError.set('');
    this.deletingId.set(cat.id);
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) { this.deletingId.set(null); return; }
      this.api.delete(`/admin/categories/${cat.id}`, { 'x-action-pin': pin }).subscribe({
        next: () => {
          this.deletingId.set(null);
          this.categories.update((list) => list.filter((c) => c.id !== cat.id));
        },
        error: (e: { message?: string }) => {
          this.deletingId.set(null);
          this.deleteError.set(e.message ?? 'Delete failed');
        },
      });
    });
  }

  // ── Basics save ──────────────────────────────────────────────────────────────

  saveBasics(): void {
    if (!this.basics.name.trim()) { this.basicsError.set('Name is required.'); return; }
    this.basicsError.set('');
    const cat = this.editTarget();
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingBasics.set(true);
      const body: Record<string, unknown> = {
        name: this.basics.name.trim(),
        icon: this.basics.icon.trim() || null,
        imageUrl: this.basics.imageUrl.trim() || null,
        defaultPriceSuggestion: this.basics.defaultPriceSuggestion,
        defaultEstimatedDurationMinutes: this.basics.defaultEstimatedDurationMinutes,
      };
      const req$ = cat
        ? this.api.patch<Category>(`/admin/categories/${cat.id}`, body, { 'x-action-pin': pin })
        : this.api.post<Category>('/admin/categories',
            { ...body, slug: this.basics.slug.trim() || undefined },
            { 'x-action-pin': pin });
      req$.subscribe({
        next: (updated) => {
          this.savingBasics.set(false);
          if (cat) {
            this.categories.update((list) => list.map((c) => c.id === cat.id ? { ...c, ...updated } : c));
            this.editTarget.set({ ...cat, ...updated });
          } else {
            this.categories.update((list) => [...list, updated]);
            this.editTarget.set(updated);
          }
          this.section.set('schema');
        },
        error: (e: { message?: string }) => { this.savingBasics.set(false); this.basicsError.set(e.message ?? 'Save failed'); },
      });
    });
  }

  // ── Question schema ──────────────────────────────────────────────────────────

  dropQuestion(event: CdkDragDrop<QuestionItem[]>): void {
    const arr = [...this.editorSchema()];
    moveItemInArray(arr, event.previousIndex, event.currentIndex);
    this.editorSchema.set(arr);
  }

  toggleQuestionActive(idx: number): void {
    const arr = [...this.editorSchema()];
    const q = arr[idx];
    arr[idx] = { ...q, active: q.active === false ? true : false };
    this.editorSchema.set(arr);
  }

  openQuestionEditor(idx: number): void {
    this.editingQIdx.set(idx);
    if (idx === -1) {
      this.qf = { label: '', type: 'radio', required: false, priced: false, description: '', options: [] };
    } else {
      const q = this.editorSchema()[idx];
      this.qf = {
        label: q.label, type: q.type,
        required: q.required ?? false, priced: q.priced ?? false,
        description: q.description ?? '',
        options: (q.options ?? []).map((o) => ({
          value: o.value, label: o.label, active: o.active !== false, isNew: false,
        })),
      };
    }
    this.qFormError.set('');
    this.questionEditorOpen.set(true);
  }

  addOption(): void { this.qf.options.push({ value: '', label: '', active: true, isNew: true }); }
  removeOption(i: number): void { this.qf.options.splice(i, 1); }
  toggleOptionActive(i: number, event: Event): void {
    this.qf.options[i].active = (event.target as HTMLInputElement).checked;
  }
  dropOption(event: CdkDragDrop<QForm['options']>): void {
    moveItemInArray(this.qf.options, event.previousIndex, event.currentIndex);
  }

  saveQuestion(): void {
    if (!this.qf.label.trim()) { this.qFormError.set('Label is required.'); return; }
    const toKey = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const idx = this.editingQIdx();
    const arr = [...this.editorSchema()];

    if (idx === -1) {
      const key = toKey(this.qf.label);
      if (!key) { this.qFormError.set('Label must produce a valid key.'); return; }
      if (arr.some((q) => q.key === key)) { this.qFormError.set(`Key "${key}" already exists.`); return; }
      const options: QuestionOption[] = this.qf.options.map((o, i) => ({
        value: toKey(o.label) || `opt${i}`,
        label: o.label,
        sortOrder: i,
        active: o.active ? undefined : false,
      }));
      arr.push({
        key, label: this.qf.label.trim(), type: this.qf.type,
        required: this.qf.required || undefined, priced: this.qf.priced || undefined,
        description: this.qf.description.trim() || undefined,
        sortOrder: arr.length,
        options: options.length ? options : undefined,
      });
    } else {
      const existing = arr[idx];
      const mergedOptions: QuestionOption[] = this.qf.options.map((o, i) => ({
        value: o.isNew ? (toKey(o.label) || `opt${i}`) : o.value,
        label: o.label,
        sortOrder: i,
        active: o.active ? undefined : false,
      }));
      arr[idx] = {
        ...existing,
        label: this.qf.label.trim(), type: this.qf.type,
        required: this.qf.required || undefined, priced: this.qf.priced || undefined,
        description: this.qf.description.trim() || undefined,
        options: mergedOptions.length ? mergedOptions : undefined,
      };
    }
    this.editorSchema.set(arr);
    this.questionEditorOpen.set(false);
  }

  saveSchema(): void {
    const cat = this.editTarget();
    if (!cat) return;
    this.schemaError.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingSchema.set(true);
      this.api.patch<Category>(`/admin/categories/${cat.id}`, { questionSchema: this.editorSchema() }, { 'x-action-pin': pin }).subscribe({
        next: (updated) => {
          this.savingSchema.set(false);
          this.editorSchema.set(JSON.parse(JSON.stringify(updated.questionSchema ?? [])));
          this.categories.update((list) => list.map((c) => c.id === cat.id ? { ...c, ...updated } : c));
          this.editTarget.set({ ...cat, ...updated });
        },
        error: (e: { message?: string }) => { this.savingSchema.set(false); this.schemaError.set(e.message ?? 'Save failed'); },
      });
    });
  }

  // ── Budget ranges ────────────────────────────────────────────────────────────

  addRange(): void { this.currentRanges.update((r) => [...r, { min: null, max: null }]); }
  removeRange(i: number): void { this.currentRanges.update((r) => r.filter((_, j) => j !== i)); }

  saveBudgetRanges(): void {
    const cat = this.editTarget();
    if (!cat) return;
    const ranges = this.currentRanges().filter((r) => r.min != null);
    this.budgetMsg.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingBudget.set(true);
      const allRanges = { ...this.rawBudgetRanges(), [cat.id]: ranges };
      this.api.patch('/admin/settings', { key: 'budget_ranges', value: { ranges: allRanges } }, { 'x-action-pin': pin }).subscribe({
        next: () => {
          this.savingBudget.set(false);
          this.rawBudgetRanges.set(allRanges);
          this.budgetMsg.set('Budget ranges saved.');
          this.budgetIsError.set(false);
        },
        error: (e: { message?: string }) => { this.savingBudget.set(false); this.budgetMsg.set(e.message ?? 'Save failed'); this.budgetIsError.set(true); },
      });
    });
  }

  // ── Time slots ───────────────────────────────────────────────────────────────

  toggleSlot(slot: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.editorSlots.update((s) => {
      const next = new Set(s);
      if (checked) next.add(slot); else next.delete(slot);
      return next;
    });
  }

  saveSlots(): void {
    const cat = this.editTarget();
    if (!cat) return;
    this.slotsMsg.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingSlots.set(true);
      const slots = [...this.editorSlots()];
      this.api.patch<Category>(`/admin/categories/${cat.id}`, { allowedTimeSlots: slots }, { 'x-action-pin': pin }).subscribe({
        next: (updated) => {
          this.savingSlots.set(false);
          this.categories.update((list) => list.map((c) => c.id === cat.id ? { ...c, ...updated } : c));
          this.editTarget.set({ ...cat, ...updated });
          this.slotsMsg.set('Saved.');
          this.slotsIsError.set(false);
        },
        error: (e: { message?: string }) => { this.savingSlots.set(false); this.slotsMsg.set(e.message ?? 'Save failed'); this.slotsIsError.set(true); },
      });
    });
  }
}
```

- [ ] **Step 2: Check if `ApiService` has generic `patch<T>` and `post<T>` — if it returns `Observable<any>` instead, remove the generic type parameters**

```
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
If errors mention `patch<Category>` or `post<Category>`, change those calls to `this.api.patch(...)` and `this.api.post(...)` without the generic and rely on type inference in `.subscribe({ next: (updated) => ... })` instead. Cast as `updated as Category` if needed.

- [ ] **Step 3: Run full frontend tsc**

```
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Run ng build to verify AOT**

```
cd frontend && npx ng build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/pages/category-settings.component.ts
git commit -m "feat: rewrite category-settings as master-detail with CRUD, question schema editor, drag-drop"
```

---

## Task 10 — Update docs

**Files:**
- Modify: `docs/ai-context/schema-notes.md`
- Modify: `docs/api-reference/api-doc.md`
- Modify: `docs/ai-context/tech-stack.md`
- Modify: `TODO.md`

- [ ] **Step 1: In schema-notes.md, find the Category model section and add/update**

```markdown
### Category (updated SP2)
- `questionSchema` (Json?) — `Array<{ key, label, type: 'checkbox'|'radio'|'text', required?, priced?, description?, sortOrder?, active?, options?: Array<{ value, label, sortOrder?, active? }> }>`. `key` and option `value` are **immutable after first save**. Set `active: false` to soft-deactivate (hidden from new forms; existing data preserved). Validated by `questionSchemaSchema` in `backend/src/lib/json-schemas.ts`. Immutability enforced by `checkQuestionSchemaImmutability` on every PATCH.
- `deletedAt` — soft-delete timestamp. Filtered out by `GET /categories` and admin list. Blocked by DELETE endpoint when active `MerchantService` or open `QuoteRequest` exist.
- `defaultPriceSuggestion` (Decimal?) — starting price hint shown to customers.
- `defaultEstimatedDurationMinutes` (Int?) — duration hint for quote form.
```

- [ ] **Step 2: In api-doc.md, find or create the Admin › Categories section and add**

```markdown
### PATCH /admin/categories/:id
PIN-gated. Extended in SP2. Accepts: `name`, `icon`, `imageUrl`, `allowedTimeSlots`, `defaultPriceSuggestion`, `defaultEstimatedDurationMinutes`, `questionSchema` (Zod-validated; immutability-checked against stored schema).

### POST /admin/categories  
PIN-gated. Body: `name` (required), `slug` (optional, auto-generated from name), `icon`, `imageUrl`, `parentCategoryId`, `defaultPriceSuggestion`, `defaultEstimatedDurationMinutes`. Creates with empty `questionSchema` and all 5 default time slots. Returns 201.

### DELETE /admin/categories/:id  
PIN-gated. Soft-deletes (sets `deletedAt`). Returns 400 if active `MerchantService` (deletedAt IS NULL) or open `QuoteRequest` (status IN open/matched/reposted) exists for this category.

### GET /admin/categories/:id/question-impact?key=\<questionKey\>
No PIN required. Returns `{ key, count }` where `count` is the number of `MerchantService` rows whose `modifiers` JSONB contains the given question key. Used to warn before deactivating a question or flipping its `priced` flag.
```

- [ ] **Step 3: In tech-stack.md, add CDK entry**

```markdown
- `@angular/cdk` (^17.3.0) — Angular Component Dev Kit. Used for drag-drop reorder in the admin Question Schema editor (`DragDropModule` from `@angular/cdk/drag-drop`).
```

- [ ] **Step 4: In TODO.md, mark SP2 complete**

```markdown
- [x] SP2 Category Settings master-detail: Category CRUD (POST/DELETE/PATCH-extended), Question Schema editor (drag-drop, immutable keys, active/soft-deactivate, priced-flag), active-filter in all consumers, @angular/cdk
```

- [ ] **Step 5: Commit**

```bash
git add docs/ai-context/schema-notes.md docs/api-reference/api-doc.md docs/ai-context/tech-stack.md TODO.md
git commit -m "docs: document SP2 category CRUD, questionSchema shape, new endpoints, CDK"
```

---

## Self-Review

**Spec coverage:**
- ✅ Category list + search + Edit/Delete/New (Task 9)
- ✅ Basics: name, slug (create-only), icon, imageUrl, defaultPriceSuggestion, defaultEstimatedDurationMinutes (Tasks 3, 4, 9)
- ✅ Question Schema list with drag-drop reorder (Task 9)
- ✅ Add/Edit question: label, type, required, priced, description, options (Task 9)
- ✅ Key locked after first save; option value locked after first save (Task 9 — shown readonly, generated on create)
- ✅ `active` toggle on questions and options (Task 9)
- ✅ Drag-drop on options (Task 9)
- ✅ Budget Ranges per-category in detail editor (Task 9)
- ✅ Time Slots per-category in detail editor (Task 9)
- ✅ Soft-delete + guard (Task 5)
- ✅ Backend `PATCH` extended + Zod validation + immutability check (Tasks 1–3)
- ✅ `POST /admin/categories` (Task 4)
- ✅ `GET question-impact` endpoint (Task 6)
- ✅ `active !== false` in all three consumers (Task 7)
- ✅ `@angular/cdk` install (Task 8)
- ✅ Docs (Task 10)
- ⚠️ **Priced-flag flip warning via impact endpoint**: The spec says show a warning before flipping `priced`. This is a UX enhancement inside `saveQuestion()` — before saving a flipped priced flag on an existing question, call `GET /admin/categories/:id/question-impact?key=...` and show a confirm dialog if `count > 0`. **Add this to Task 9 Step 1** in `saveQuestion()`: detect priced flag change on an existing question, fetch impact, confirm. This is in-browser and requires the editTarget to exist. Implementation note: make the call in `saveQuestion()` before pushing to `editorSchema`, inside a `this.api.get(...)` callback that wraps the push.

**Placeholder scan:** No TBD, no "implement later", no "similar to" references found.

**Type consistency:** `QuestionItem` / `QuestionOption` defined in category-settings.component.ts match the Zod types in json-schemas.ts. `QForm.options[].isNew` flag is used consistently across `openQuestionEditor`, `saveQuestion`, and the template.
