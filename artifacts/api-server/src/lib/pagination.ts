import type { Request, Response } from "express";
import { z } from "zod";

const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().max(200).optional(),
});

export interface PaginationOpts {
  defaultPageSize?: number;
  maxPageSize?: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  q: string | null;
  explicit: boolean;
}

export function parsePagination(req: Request, opts: PaginationOpts = {}): Pagination {
  const defaultPageSize = opts.defaultPageSize ?? 50;
  const maxPageSize = opts.maxPageSize ?? 200;
  const parsed = PaginationQuery.safeParse(req.query);
  const data = parsed.success ? parsed.data : {};

  const explicit =
    data.page !== undefined ||
    data.pageSize !== undefined ||
    data.limit !== undefined ||
    data.offset !== undefined;

  let pageSize = data.pageSize ?? data.limit ?? defaultPageSize;
  pageSize = Math.min(Math.max(1, pageSize), maxPageSize);

  let offset = data.offset ?? 0;
  let page = data.page ?? Math.floor(offset / pageSize) + 1;
  page = Math.max(1, page);
  if (data.offset === undefined) offset = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    limit: pageSize,
    offset,
    q: data.q ?? null,
    explicit,
  };
}

export function paginationMeta(p: Pagination, total: number) {
  return {
    page: p.page,
    pageSize: p.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
    hasMore: p.offset + p.pageSize < total,
  };
}

export function setPaginationHeaders(res: Response, p: Pagination, total: number) {
  res.setHeader("X-Total-Count", String(total));
  res.setHeader("X-Page", String(p.page));
  res.setHeader("X-Page-Size", String(p.pageSize));
  res.setHeader("X-Total-Pages", String(Math.max(1, Math.ceil(total / p.pageSize))));
}
