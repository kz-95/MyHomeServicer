import { Request } from 'express';
import { parsePageParams, buildPagination } from '../../src/lib/http';

const fakeReq = (query: Record<string, string>): Request => ({ query } as unknown as Request);

describe('parsePageParams', () => {
  it('applies documented defaults when no query params are given', () => {
    const p = parsePageParams(fakeReq({}));
    expect(p).toMatchObject({ page: 1, limit: 20, order: 'desc', skip: 0 });
  });

  it('computes skip from page and limit', () => {
    const p = parsePageParams(fakeReq({ page: '3', limit: '10' }));
    expect(p.skip).toBe(20);
  });

  it('caps limit at 100', () => {
    expect(parsePageParams(fakeReq({ limit: '500' })).limit).toBe(100);
  });

  it('floors a negative limit at 1 and treats 0 as the default', () => {
    expect(parsePageParams(fakeReq({ limit: '-5' })).limit).toBe(1);
    expect(parsePageParams(fakeReq({ limit: '0' })).limit).toBe(20);
  });

  it('only accepts asc/desc for order', () => {
    expect(parsePageParams(fakeReq({ order: 'asc' })).order).toBe('asc');
    expect(parsePageParams(fakeReq({ order: 'sideways' })).order).toBe('desc');
  });
});

describe('buildPagination', () => {
  it('computes totalPages by ceiling division', () => {
    expect(buildPagination(1, 20, 142)).toEqual({
      page: 1,
      limit: 20,
      total: 142,
      totalPages: 8,
    });
  });

  it('always reports at least one page', () => {
    expect(buildPagination(1, 20, 0).totalPages).toBe(1);
  });
});
