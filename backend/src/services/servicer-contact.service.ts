import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';

const MAX_CONTACTS = 10;

/** List all contacts for a servicer. */
export async function listContacts(servicerId: string) {
  return prisma.servicerContact.findMany({
    where: { servicerId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
}

/** Create a new contact for a servicer. */
export async function createContact(
  servicerId: string,
  input: {
    contactPerson: string;
    number?: string | null;
    email?: string | null;
    isPrimary?: boolean;
    visibleToCustomer?: boolean;
  },
) {
  // Validate required fields
  if (!input.contactPerson?.trim()) {
    throw badRequest('Contact person name is required');
  }
  if (!input.number?.trim() && !input.email?.trim()) {
    throw badRequest('At least one of phone number or email is required');
  }

  const count = await prisma.servicerContact.count({ where: { servicerId } });
  if (count >= MAX_CONTACTS) {
    throw badRequest(`Maximum ${MAX_CONTACTS} contacts allowed`);
  }

  // If this is the first contact, force isPrimary=true
  if (count === 0) {
    input.isPrimary = true;
  }

  // If setting as primary, clear existing primary
  if (input.isPrimary) {
    await prisma.servicerContact.updateMany({
      where: { servicerId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  return prisma.servicerContact.create({
    data: {
      servicerId,
      contactPerson: input.contactPerson.trim(),
      number: input.number?.trim() || null,
      email: input.email?.trim() || null,
      isPrimary: input.isPrimary ?? false,
      visibleToCustomer: input.visibleToCustomer ?? false,
    },
  });
}

/** Update an existing contact. */
export async function updateContact(
  servicerId: string,
  contactId: string,
  input: {
    contactPerson?: string;
    number?: string | null;
    email?: string | null;
    isPrimary?: boolean;
    visibleToCustomer?: boolean;
  },
) {
  const contact = await prisma.servicerContact.findFirst({
    where: { id: contactId, servicerId },
  });
  if (!contact) throw notFound('Contact not found');

  // Validate: after update, must still have number OR email
  const mergedNumber = input.number !== undefined ? input.number?.trim() || null : contact.number;
  const mergedEmail = input.email !== undefined ? input.email?.trim() || null : contact.email;
  if (!mergedNumber && !mergedEmail) {
    throw badRequest('At least one of phone number or email is required');
  }

  // Validate: contactPerson must not become empty
  if (input.contactPerson !== undefined && !input.contactPerson?.trim()) {
    throw badRequest('Contact person name is required');
  }

  // If setting as primary, clear existing primary
  if (input.isPrimary) {
    await prisma.servicerContact.updateMany({
      where: { servicerId, isPrimary: true, id: { not: contactId } },
      data: { isPrimary: false },
    });
  }

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (input.contactPerson !== undefined) data['contactPerson'] = input.contactPerson.trim();
  if (input.number !== undefined) data['number'] = input.number?.trim() || null;
  if (input.email !== undefined) data['email'] = input.email?.trim() || null;
  if (input.isPrimary !== undefined) data['isPrimary'] = input.isPrimary;
  if (input.visibleToCustomer !== undefined) data['visibleToCustomer'] = input.visibleToCustomer;

  return prisma.servicerContact.update({
    where: { id: contactId },
    data,
  });
}

/** Delete a contact. Cannot delete the last contact or the current primary. */
export async function deleteContact(servicerId: string, contactId: string) {
  const contact = await prisma.servicerContact.findFirst({
    where: { id: contactId, servicerId },
  });
  if (!contact) throw notFound('Contact not found');

  const count = await prisma.servicerContact.count({ where: { servicerId } });
  if (count <= 1) {
    throw badRequest('Cannot delete the only contact - at least one contact is required');
  }

  if (contact.isPrimary) {
    throw badRequest('Cannot delete the primary contact. Reassign primary first.');
  }

  await prisma.servicerContact.delete({ where: { id: contactId } });
  return { deleted: true };
}
