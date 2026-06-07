import { Router } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../lib/async-handler';
import { validate } from '../middleware/validate';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { requirePin } from '../middleware/pin';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';
import { configVault } from '../lib/config-vault';
import { recordAudit } from '../services/ledger.service';
import { invalidateLlmKeyCache } from '../services/chat.service';
import { logger } from '../lib/logger';

export const llmKeysRouter = Router();
llmKeysRouter.use(requireAuth, requireAdmin);

/** Mask a secret for display — never send the plaintext key to the browser. */
function maskKey(v: string): string {
  if (!v) return '';
  if (v.length <= 8) return '••••••••';
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

llmKeysRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await prisma.llmApiKey.findMany({
      orderBy: { priority: 'asc' },
    });
    const keys = rows.map((r) => ({
      id: r.id,
      label: r.label,
      provider: r.provider,
      model: r.model,
      value: maskKey(configVault.decryptValue(r.encryptedValue, r.iv, r.authTag)),
      priority: r.priority,
      isActive: r.isActive,
      isFallback: r.isFallback,
    }));
    res.json({ keys });
  }),
);

llmKeysRouter.post(
  '/',
  requirePin,
  validate([
  body('label').isString().isLength({ min: 1, max: 100 }).trim(),
  body('provider').optional().isString().isLength({ min: 1, max: 50 }).trim(),
  body('model').optional().isString().isLength({ max: 200 }),
  body('value').isString().isLength({ min: 1 }),
  body('isFallback').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const { label, value, provider, model, isFallback } = req.body;
    const adminId = req.user!.id;

    const { encryptedValue, iv, authTag } = configVault.encryptValue(value);

    const maxPriority = await prisma.llmApiKey.aggregate({ _max: { priority: true } });
    const priority = (maxPriority._max.priority ?? -1) + 1;

    const key = await prisma.llmApiKey.create({
      data: {
        label,
        provider: provider || 'generic',
        model: model || '',
        encryptedValue,
        iv,
        authTag,
        priority,
        isFallback: isFallback === true,
      },
    });

    invalidateLlmKeyCache();

    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: 'LLM_KEY_CREATED',
      entityId: key.id,
      newValue: { label },
    });

    res.status(201).json({ id: key.id, label: key.label, priority: key.priority });
  }),
);

llmKeysRouter.put(
  '/:id',
  requirePin,
  validate([
  body('label').optional().isString().isLength({ min: 1, max: 100 }).trim(),
  body('provider').optional().isString().isLength({ min: 1, max: 50 }).trim(),
  body('model').optional().isString().isLength({ max: 200 }),
  body('value').optional().isString().isLength({ min: 1 }),
  body('priority').optional().isInt({ min: 0 }),
  body('isFallback').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { label, value, priority, provider, model, isFallback } = req.body;
    const adminId = req.user!.id;

    const existing = await prisma.llmApiKey.findUnique({ where: { id } });
    if (!existing) throw notFound('LLM API key not found');

    const data: Record<string, unknown> = {};
    if (label !== undefined) data.label = label;
    if (provider !== undefined) data.provider = provider;
    if (model !== undefined) data.model = model;
    if (isFallback !== undefined) data.isFallback = isFallback;
    if (priority !== undefined) data.priority = priority;
    if (value !== undefined) {
      const enc = configVault.encryptValue(value);
      data.encryptedValue = enc.encryptedValue;
      data.iv = enc.iv;
      data.authTag = enc.authTag;
    }

    const updated = await prisma.llmApiKey.update({ where: { id }, data });

    invalidateLlmKeyCache();

    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: 'LLM_KEY_UPDATED',
      entityId: id,
      newValue: { label: updated.label },
    });

    res.json({ id: updated.id, label: updated.label, priority: updated.priority });
  }),
);

llmKeysRouter.put(
  '/reorder',
  requirePin,
  validate([
  body('keys').isArray({ min: 1 }),
  body('keys.*.id').isString(),
  body('keys.*.priority').isInt({ min: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    const { keys } = req.body as { keys: { id: string; priority: number }[] };
    const adminId = req.user!.id;

    await prisma.$transaction(
      keys.map((k) =>
        prisma.llmApiKey.update({ where: { id: k.id }, data: { priority: k.priority } }),
      ),
    );

    invalidateLlmKeyCache();

    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: 'LLM_KEYS_REORDERED',
      newValue: { count: keys.length },
    });

    res.json({ ok: true });
  }),
);

llmKeysRouter.delete(
  '/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const adminId = req.user!.id;

    const existing = await prisma.llmApiKey.findUnique({ where: { id } });
    if (!existing) throw notFound('LLM API key not found');

    await prisma.llmApiKey.delete({ where: { id } });

    invalidateLlmKeyCache();

    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: 'LLM_KEY_DELETED',
      entityId: id,
      newValue: { label: existing.label },
    });

    res.json({ ok: true });
  }),
);

llmKeysRouter.post(
  '/models',
  requirePin,
  validate([
  body('id').optional().isUUID(),
  body('provider').optional().isString().isLength({ min: 1, max: 50 }).trim(),
  body('apiKey').optional().isString().isLength({ min: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    let provider: string | undefined = req.body.provider;
    let apiKey: string | undefined = req.body.apiKey;

    // Existing key: resolve the stored (encrypted) key by id so the plaintext
    // never has to travel from the browser. New key: use the typed provider/key.
    if (req.body.id) {
      const row = await prisma.llmApiKey.findUnique({ where: { id: req.body.id } });
      if (!row) throw notFound('LLM API key not found');
      provider = row.provider;
      apiKey = configVault.decryptValue(row.encryptedValue, row.iv, row.authTag);
    }

    if (!provider || !apiKey) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Provide an id, or provider + apiKey.' } });
      return;
    }

    const adminId = req.user!.id;
    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: 'LLM_MODELS_FETCHED',
      entityId: req.body.id || undefined,
      newValue: { provider },
    });

    try {
      const models = await fetchProviderModels(provider, apiKey);
      res.json({ models });
    } catch (err) {
      logger.warn(`Failed to fetch models for ${provider}`, { error: (err as Error).message });
      const fallback = PROVIDER_DEFAULT_MODELS[provider] ?? [];
      res.json({ models: fallback, source: 'fallback' });
    }
  }),
);

const PROVIDER_DEFAULT_MODELS: Record<string, string[]> = {
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro-exp-03-25', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  generic: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
};

async function fetchProviderModels(provider: string, apiKey: string): Promise<string[]> {
  switch (provider) {
    case 'openai':
    case 'generic': {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      return (data.data ?? [])
        .map((m) => m.id)
        .filter((id) => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'))
        .sort()
        .slice(0, 30);
    }
    case 'deepseek': {
      const res = await fetch('https://api.deepseek.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      return (data.data ?? []).map((m) => m.id).sort().slice(0, 20);
    }
    case 'gemini': {
      // Google ListModels — returns the models available to THIS key.
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data = (await res.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      };
      const models = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => (m.name ?? '').replace(/^models\//, ''))
        .filter(Boolean)
        .sort()
        .slice(0, 30);
      return models.length ? models : PROVIDER_DEFAULT_MODELS.gemini;
    }
    default: {
      // Unknown/custom provider — try OpenAI-compatible API
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        return (data.data ?? [])
          .map((m) => m.id)
          .filter((id) => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'))
          .sort()
          .slice(0, 30);
      } catch {
        return PROVIDER_DEFAULT_MODELS.generic;
      }
    }
  }
}
