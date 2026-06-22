import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';

export interface ServicerWaPresetInput {
  label: string;
  body: string;
  active?: boolean;
}

/**
 * Lists a servicer's WhatsApp message presets, active ones first, then newest.
 * Each preset's `body` may carry {name}/{orderId}/{eta} placeholders that the
 * frontend interpolates before opening the wa.me link.
 */
export async function listServicerWaPresets(servicerId: string, activeOnly = false) {
  return prisma.servicerWaPreset.findMany({
    where: { servicerId, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function createServicerWaPreset(servicerId: string, input: ServicerWaPresetInput) {
  return prisma.servicerWaPreset.create({
    data: {
      servicerId,
      label: input.label.trim(),
      body: input.body,
      active: input.active ?? true,
    },
  });
}

async function ownedPreset(servicerId: string, presetId: string) {
  const preset = await prisma.servicerWaPreset.findFirst({ where: { id: presetId, servicerId } });
  if (!preset) throw notFound('Preset not found');
  return preset;
}

export async function updateServicerWaPreset(
  servicerId: string,
  presetId: string,
  input: Partial<ServicerWaPresetInput>,
) {
  await ownedPreset(servicerId, presetId);
  const data: Prisma.ServicerWaPresetUpdateInput = {};
  if (input.label !== undefined) data.label = input.label.trim();
  if (input.body !== undefined) data.body = input.body;
  if (input.active !== undefined) data.active = input.active;
  return prisma.servicerWaPreset.update({ where: { id: presetId }, data });
}

/** Soft-disable a preset (sets active=false) so it drops out of the active list. */
export async function deleteServicerWaPreset(servicerId: string, presetId: string) {
  await ownedPreset(servicerId, presetId);
  await prisma.servicerWaPreset.update({ where: { id: presetId }, data: { active: false } });
}
