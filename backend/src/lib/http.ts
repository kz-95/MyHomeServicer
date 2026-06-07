import { Request, Response } from 'express';

/** Standard pagination envelope used by all list endpoints. */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PageParams {
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  skip: number;
}

/** Parse `?page&limit&sort&order` query params with documented defaults/caps. */
export function parsePageParams(req: Request, defaultSort = 'createdAt'): PageParams {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limitRaw = parseInt(String(req.query.limit ?? '20'), 10) || 20;
  const limit = Math.min(100, Math.max(1, limitRaw));
  const sort = String(req.query.sort ?? defaultSort);
  const order = String(req.query.order ?? 'desc') === 'asc' ? 'asc' : 'desc';
  return { page, limit, sort, order, skip: (page - 1) * limit };
}

export function buildPagination(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Send a paginated list response. */
export function sendList<T>(res: Response, data: T[], pagination: Pagination): void {
  res.json({ data, pagination });
}
