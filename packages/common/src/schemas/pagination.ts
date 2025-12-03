import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export type PaginationQuery = z.output<typeof paginationQuerySchema>;

export const applyPagination = <T>(items: T[], { page, pageSize }: PaginationQuery) => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

export const paginationMeta = (total: number, { page, pageSize }: PaginationQuery) => ({
  total,
  page,
  pageSize,
  pageCount: Math.ceil(total / pageSize),
});
